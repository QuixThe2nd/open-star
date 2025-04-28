import { parseEther, type Hex } from 'viem';
import { KeyManager, type Methods, OpenStar, type PeerStates, mode } from '../..';

type State = {
  laws: string[],
  balances: { [pubKey: string]: Hex }
}

interface TheRadicalPartyMethods extends Methods {
  mint: (_args: { to: Hex, amount: Hex }) => void | string;
  burn: (_args: { to: Hex, amount: Hex }) => void | string;
  submitLaw: (_args: { value: string }) => void | string;
}

export class TheRadicalPartyOracle {
  public readonly state: State = { laws: [], balances: {} }
  public readonly peerStates: PeerStates<State> = {}
  public mempool: Parameters<TheRadicalPartyMethods['addLaw']>[0][] = []
  public readonly openStar: OpenStar<'THERADICALPARTY', State, TheRadicalPartyMethods, typeof this.mempool>
  public readonly keyManager: KeyManager
  public readonly epochTime = 15_000

  constructor(keyManager: KeyManager) {
    this.keyManager = keyManager
    this.openStar = new OpenStar<'THERADICALPARTY', State, TheRadicalPartyMethods, typeof this.mempool>('THERADICALPARTY', this)
  }

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
    },
    burn: (args: Parameters<TheRadicalPartyMethods['burn']>[0]): ReturnType<TheRadicalPartyMethods['burn']> => {
      if (!this.state.balances[args.to]) return 'Address does not exist'
      if (BigInt(this.state.balances[args.to]!) < BigInt(args.amount)) this.state.balances[args.to] = `0x0`
      else this.state.balances[args.to] = `0x${(BigInt(this.state.balances[args.to] ?? 0) - BigInt(args.amount)).toString(16)}`
    },
    submitLaw: (args: Parameters<TheRadicalPartyMethods['submitLaw']>[0]): ReturnType<TheRadicalPartyMethods['submitLaw']> => {
      if (args.value.length === 0) return 'Law is empty'
      if (args.value.length > 280) return 'Law must be under 280 characters'
      this.state.laws.push(args.value)
    }
  }

  call<T extends keyof TheRadicalPartyMethods>(method: T, args: Parameters<TheRadicalPartyMethods[T]>[0]): ReturnType<TheRadicalPartyMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  onCall = async <T extends keyof TheRadicalPartyMethods>(method: T, args: Parameters<TheRadicalPartyMethods[T]>[0]): Promise<void> => {
    if (!this.mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
      this.mempool.push(args)
      this.openStar.sendMessage([ 'THERADICALPARTY', 'call', method, args ]).catch(console.error)
      await this.call(method, args)
    }
  }

  startupState = async (): Promise<State> => {
    // Example bootstrap logic
    let mostCommonState = undefined;
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
    }

    return mostCommonState
  }

  reputationChange = (reputation: { [peer: `0x${string}`]: number }, epochTime: number): void => {
    const blockYield = this.blockYield(epochTime)

    for (const _peer in reputation) {
      const peer = _peer as keyof PeerStates<State>
      const balance = BigInt(this.state.balances[peer] ?? `0x0`)
      if (reputation[peer]! > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.call('mint', { to: peer, amount: `0x${(balance ? BigInt(Math.floor(Number(balance)*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (reputation[peer]! < 0 && this.state.balances[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.call('burn', { to: peer, amount: `0x${((balance*9n)/10n).toString(16)}` })
      }
    }

    this.call('mint', { to: this.keyManager.getPublicKey(), amount: `0x${(this.state.balances[this.keyManager.getPublicKey()] ? BigInt(Math.floor(Number(this.state.balances[this.keyManager.getPublicKey()])*blockYield)) : parseEther('1')).toString(16)}` })
  }
}