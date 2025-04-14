import { parseEther, type Hex } from 'viem';
import { KeyManager } from "../KeyManager";
import type { Signalling } from '../Signalling';
import { mode, sortObjectByKeys, type Message, type Methods, type Oracle } from '../..';

interface CoinMethods extends Methods {
  mint: (_args: { to: Hex, amount: bigint }) => true | string;
  burn: (_args: { to: Hex, amount: bigint }) => true | string;
  transfer: (_args: { from: Hex, to: Hex, amount: bigint, time: number, signature: Hex }) => Promise<true | string>;
}

type State = { [pubKey: string]: bigint }
type SerializedState = { [pubKey: string]: Hex }
type PeerStates = { [from: Hex]: { lastSend: SerializedState, lastReceive: SerializedState, reputation: number } }

function serialize(state: State): SerializedState {
  const serializedObj: SerializedState = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key] = `0x${value.toString(16)}`
  })
  return serializedObj
}

function deserialize(state: SerializedState): State {
  const serializedObj: State = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key] = BigInt(value)
  })
  return serializedObj
}

export class CoinOracle implements Oracle<Message, SerializedState, CoinMethods> {
  private state: State = {}
  private readonly keyManager: KeyManager
  private mempool: Parameters<CoinMethods['transfer']>[0][] = []
  public readonly name = 'coin'
  public readonly peerStates: PeerStates = {}

  constructor (keyManager: KeyManager) {
    this.keyManager = keyManager
  }
  private readonly methods: CoinMethods = {
    mint: (args: Parameters<CoinMethods['mint']>[0]): ReturnType<CoinMethods['mint']> => { // TODO: Temporary PoW challenge to get coins, only for initial distribution
      const to = args.to
      const amount = args.amount

      if(!this.state[to]) this.state[to] = 0n
      this.state[to] += amount

      return true
    },

    burn: (args: Parameters<CoinMethods['burn']>[0]): ReturnType<CoinMethods['burn']> => {
      const to = args.to
      const amount = args.amount

      if (!this.state[to]) return 'Address does not exist'
      if (this.state[to] < amount) this.state[to] = 0n
      else this.state[to] -= amount

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

      this.state[from] -= amount
      if(!this.state[to]) this.state[to] = 0n
      this.state[to] += amount

      console.log(`[COIN] Transferred ${amount} from ${from} to ${to}`)
      return true
    }
  }

  getState(): SerializedState {
    const obj: State = {}
    Object.entries(this.state).forEach(([key, value]) => {
      obj[key] = value
    })
    return serialize(sortObjectByKeys(obj))
  }

  blockYield(epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += state[peer as keyof PeerStates]!
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += state[peer as keyof PeerStates] ?? 0n
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
      const peer = _peer as keyof PeerStates
      const state = this.peerStates[peer]!
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      netReputation += state.reputation;
      if (state.reputation > 0) {
        console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
        this.call('mint', { to: peer, amount: myState[peer] ? BigInt(Math.floor(Number(myState[peer])*blockYield)) : parseEther('1') })
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
        this.call('burn', { to: peer, amount: (myState[peer]*9n)/10n })
      }
      state.reputation = 0
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.call('mint', { to: signalling.address, amount: myState[signalling.address] ? BigInt(Math.floor(Number(myState[signalling.address])*blockYield)) : parseEther('1') })
    
    this.mempool = []
    console.log('[COIN]', this.getState())
  }

  call<T extends keyof CoinMethods>(method: T, args: Parameters<CoinMethods[T]>[0]): ReturnType<CoinMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  onCall<T extends keyof CoinMethods & string>(method: T, _args: Parameters<CoinMethods[T]>[0], signalling: Signalling<Message>): void {
    if (method === 'transfer') {
      const args = _args as Parameters<CoinMethods['transfer']>[0]
      if (!this.mempool.some(tx => tx.signature === args.signature)) {
        this.mempool.push(args)
        signalling.sendMessage([ 'coin', 'call', method, args ]).catch(console.error)
        this.call('transfer', args).catch(console.error)
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
    console.log(mostCommonState)
    this.state = deserialize(mostCommonState)
    signalling.sendMessage([ this.name, 'state', mostCommonState ]).catch(console.error)
  }
}