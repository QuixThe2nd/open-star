import { parseEther, type Hex } from 'viem';
import { KeyManager } from "../KeyManager";
import type { Signalling } from '../Signalling';
import { mode, sortObjectByKeys, type MessageType, type MethodsType, type OracleType, type PeerStates } from '../..';

interface CoinMethods extends MethodsType {
  mint: (_args: { to: Hex, amount: `0x${string}` }) => true | string;
  burn: (_args: { to: Hex, amount: `0x${string}` }) => true | string;
  transfer: (_args: { from: Hex, to: Hex, amount: `0x${string}`, time: number, signature: Hex }) => Promise<true | string>;
}

type State = { [pubKey: string]: Hex }

type Message = MessageType<'coin', CoinMethods, State>
export class CoinOracle implements OracleType<'coin', Message, State, CoinMethods> {
  private state: State = {}
  private readonly keyManager: KeyManager
  private mempool: Parameters<CoinMethods['transfer']>[0][] = []
  public readonly name = 'coin'
  public readonly peerStates: PeerStates<State> = {}
  public readonly boilerplateState: State = {}

  constructor (keyManager: KeyManager) {
    this.keyManager = keyManager
  }
  readonly methods: CoinMethods = {
    mint: (args: Parameters<CoinMethods['mint']>[0]): ReturnType<CoinMethods['mint']> => { // TODO: Temporary PoW challenge to get coins, only for initial distribution
      const to = args.to
      const amount = args.amount

      this.state[to] ??= `0x0`
      this.state[to] = `0x${(BigInt(this.state[to]) + BigInt(amount)).toString(16)}`

      return true
    },

    burn: (args: Parameters<CoinMethods['burn']>[0]): ReturnType<CoinMethods['burn']> => {
      const to = args.to
      const amount = args.amount

      if (!this.state[to]) return 'Address does not exist'
      if (this.state[to] < amount) this.state[to] = `0x0`
      else this.state[to] = `0x${(BigInt(this.state[to]) + BigInt(amount)).toString(16)}`

      return true
    },
    transfer: async (args: Parameters<CoinMethods['transfer']>[0]): ReturnType<CoinMethods['transfer']> => {
      const from = args.from
      const to = args.to
      const amount = args.amount
      const time = args.time
      const signature = args.signature

      if (!this.state[from]) return 'No balance'
      if (this.state[from] < amount) return 'Balance too low'
      if (time + 5_000 < +new Date()) return 'Transaction from past epoch'
      if (!await this.keyManager.verify(signature, JSON.stringify({ from, to, amount, time }), from)) return 'Invalid signature'

      this.state[from] = `0x${(BigInt(this.state[from]) - BigInt(amount)).toString(16)}`
      this.state[to] ??= `0x0`
      this.state[to] += amount

      console.log(`[COIN] Transferred ${amount} from ${from} to ${to}`)
      return true
    }
  }

  getState(): State {
    return sortObjectByKeys(this.state)
  }

  blockYield(epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += BigInt(state[peer as keyof PeerStates<State>]!)
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += BigInt(state[peer as keyof PeerStates<State>] ?? '0x0')
    })

    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  onEpoch(signalling: Signalling<Message>, epochTime: number): void {
    const myState = this.state
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
      if (state.reputation > 0) {
        console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
        this.onCall('mint', { to: peer, amount: `0x${(myState[peer] ? BigInt(Math.floor(Number(myState[peer])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
        this.onCall('burn', { to: peer, amount: `0x${((BigInt(myState[peer])*9n)/10n).toString(16)}` })
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.onCall('mint', { to: signalling.address, amount: `0x${(myState[signalling.address] ? BigInt(Math.floor(Number(myState[signalling.address])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
    
    this.mempool = []
  }

  private onCall<T extends keyof CoinMethods>(method: T, args: Parameters<CoinMethods[T]>[0]): ReturnType<CoinMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  call<T extends keyof CoinMethods>(method: T, _args: Parameters<CoinMethods[T]>[0], signalling: Signalling<Message>): void {
    if (method === 'transfer') {
      const args = _args as Parameters<CoinMethods['transfer']>[0]
      if (!this.mempool.some(tx => tx.signature === args.signature)) {
        this.mempool.push(args)
        signalling.sendMessage([ 'coin', 'call', method, args ]).catch(console.error)
        this.onCall('transfer', args).catch(console.error)
      }
    }
  }

  onConnect = async (signalling: Signalling<Message>): Promise<void> => {
    signalling.sendMessage([ this.name, 'state', this.getState() ]).catch(console.error)

    let mostCommonState = undefined
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
    }
    this.state = mostCommonState
    signalling.sendMessage([ this.name, 'state', mostCommonState ]).catch(console.error)
  }
}