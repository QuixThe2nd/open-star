import { parseEther, type Hex } from 'viem';
import { type MethodsType, type MessageType, type OracleType, type PeerStates, mode, sortObjectByKeys, type PingPongMessage } from '../..';
import type { Signalling } from '../Signalling';

type State = {
  laws: string[],
  balances: { [pubKey: string]: Hex }
}

interface TheRadicalPartyMethods extends MethodsType {
  mint: (_args: { to: Hex, amount: Hex }) => true | string;
  burn: (_args: { to: Hex, amount: Hex }) => true | string;
  submitLaw: (_args: { value: string }) => true | string;
}

type Message = MessageType<'theRadicalParty', TheRadicalPartyMethods, State>

export class TheRadicalPartyOracle implements OracleType<'theRadicalParty', Message, State, TheRadicalPartyMethods> {
  public readonly name = 'theRadicalParty'
  private state: State = { laws: [], balances: {} }
  public readonly peerStates: PeerStates<State> = {}
  private mempool: Parameters<TheRadicalPartyMethods['addLaw']>[0][] = []
  public readonly boilerplateState: State = { laws: [], balances: {} }

  getState = (): State => sortObjectByKeys(this.state)

  blockYield(epochTime: number): number {
    let supply = 0n
    Object.keys(this.state).forEach(peer => {
      supply += BigInt(this.state.balances[peer as keyof PeerStates<State>] ?? `0x0`)
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += BigInt(this.state.balances[peer as keyof PeerStates<State>] ?? `0x0`)
    })

    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  readonly methods: TheRadicalPartyMethods = {
    mint: (args: Parameters<TheRadicalPartyMethods['mint']>[0]): ReturnType<TheRadicalPartyMethods['mint']> => {
      this.state.balances[args.to] = `0x${(BigInt(this.state.balances[args.to] ?? 0) + BigInt(args.amount)).toString(16)}`
      return true
    },
    burn: (args: Parameters<TheRadicalPartyMethods['burn']>[0]): ReturnType<TheRadicalPartyMethods['burn']> => {
      if (!this.state.balances[args.to]) return 'Address does not exist'
      if (BigInt(this.state.balances[args.to]!) < BigInt(args.amount)) this.state.balances[args.to] = `0x0`
      else this.state.balances[args.to] = `0x${(BigInt(this.state.balances[args.to] ?? 0) - BigInt(args.amount)).toString(16)}`
      return true
    },
    submitLaw: (args: Parameters<TheRadicalPartyMethods['submitLaw']>[0]): ReturnType<TheRadicalPartyMethods['submitLaw']> => {
      if (args.value.length === 0) return 'Law is empty'
      if (args.value.length > 280) return 'Law must be under 280 characters'
      this.state.laws.push(args.value)
      return true
    }
  }

  call<T extends keyof TheRadicalPartyMethods>(method: T, args: Parameters<TheRadicalPartyMethods[T]>[0]): ReturnType<TheRadicalPartyMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  onCall = async <T extends keyof TheRadicalPartyMethods>(method: T, args: Parameters<TheRadicalPartyMethods[T]>[0], signalling: Signalling<Message>): Promise<void> => {
    if (!this.mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
      this.mempool.push(args)
      signalling.sendMessage([ this.name, 'call', method, args ]).catch(console.error)
      await this.call(method, args)
    }
  }

  onConnect = async (): Promise<State> => {
    // Example bootstrap logic
    let mostCommonState = undefined;
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
      /*
      await new Promise((res) => setTimeout(res, 100))
      */
    }

    return mostCommonState
  }

  onEpoch = (signalling: Signalling<Message | PingPongMessage>, epochTime: number): void => {
    const blockYield = this.blockYield(epochTime)

    let netReputation = 0;
    for (const _peer in this.peerStates) {
      const peer = _peer as keyof PeerStates<State>
      const state = this.peerStates[peer]!
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      netReputation += state.reputation;

      const balance = BigInt(this.state.balances[peer] ?? `0x0`)
      if (state.reputation > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.call('mint', { to: peer, amount: `0x${(balance ? BigInt(Math.floor(Number(balance)*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (state.reputation < 0 && this.state.balances[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.call('burn', { to: peer, amount: `0x${((balance*9n)/10n).toString(16)}` })
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')

    this.call('mint', { to: signalling.address, amount: `0x${(this.state.balances[signalling.address] ? BigInt(Math.floor(Number(this.state.balances[signalling.address])*blockYield)) : parseEther('1')).toString(16)}` })

    this.mempool = []
  }
}