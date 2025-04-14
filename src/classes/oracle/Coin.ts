import { recoverAddress, type Hex } from 'viem';
import { KeyManager } from "../KeyManager";
import type { Signalling } from '../Signalling';

export type CoinState = { [pubKey: string]: bigint }
export type SerializedCoinState = { [pubKey: string]: `0x${string}` }
type PeerState = { lastSend: CoinState, lastReceive: CoinState, reputation: number | null }
type PeerStates = { [from: Hex]: PeerState }

export interface CoinMethods {
  mint: (args: { to: Hex, amount: bigint }) => true | string;
  burn: (args: { to: Hex, amount: bigint }) => true | string;
  transfer: (args: { from: Hex, to: Hex, amount: bigint, time: number, signature: Hex | { r: Hex; s: Hex; v: bigint; yParity: number }, hash?: Hex }) => Promise<true | string>;
}

export function serialize(state: CoinState) {
  const serializedObj: SerializedCoinState = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key] = `0x${value.toString(16)}`
  })
  return serializedObj
}

export function deserialize(state: SerializedCoinState) {
  const serializedObj: CoinState = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key] = BigInt(value)
  })
  return serializedObj
}

function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj = {} as T;
  for (const key of (Object.keys(obj) as (keyof T)[]).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = obj[key];
  }
  return sortedObj;
}


export class CoinOracle {
  private state: CoinState = {}
  private readonly keyManager: KeyManager
  private readonly decimalMultiplier = BigInt("1".padEnd(19, '0'))
  private mempool: Parameters<CoinMethods['transfer']>[0][] = []
  private readonly coinMethods: CoinMethods = {

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

      if(!this.state[to]) this.state[to] = 0n
      this.state[to] -= amount

      return true
    },
    transfer: async (args: Parameters<CoinMethods['transfer']>[0]): ReturnType<CoinMethods['transfer']> => {
      const from = args.from
      const to = args.to
      const amount = args.amount
      const time = args.time
      const signature = args.signature
      const hash = args.hash

      if (!this.state[from]) return 'No balance'
      if (this.state[from] < amount) return 'Balance too low'
      if (time + 5_000 < +new Date()) return 'Transaction from past epoch'
      if (!(typeof signature === 'string' && await this.keyManager.verify(signature, JSON.stringify({ from, to, amount, time }), from)) && !(hash && await recoverAddress({ signature, hash }))) return 'Invalid signature'

      this.state[from] -= amount
      if(!this.state[to]) this.state[to] = 0n
      this.state[to] += amount

      console.log(`Transferred ${amount} from ${from} to ${to}`)
      return true
    }
  }

  constructor (keyManager: KeyManager) {
    this.keyManager = keyManager
  }

  getState() {
    const obj: CoinState = {}
    Object.entries(this.state).forEach(([key, value]) => {
      obj[key] = value
    })
    return sortObjectByKeys(obj)
  }

  getBalance(address: Hex) {
    const lowercaseAddress = address.toLowerCase()
    const realAddress = Object.keys(this.state).find(key => key.toLowerCase() === lowercaseAddress)
    return realAddress ? this.state[realAddress]! : 0n
  }

  setState(state: CoinState) {
    this.state = state
  }

  blockYield(peerStates: PeerStates, epochTime: number) {
    const state = this.getState()
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += state[peer as keyof PeerStates]!
    })
    let coinsStaked = 0n
    Object.keys(peerStates).forEach(peer => {
      coinsStaked += state[peer as keyof PeerStates] ?? 0n
    })

    const stakingRate = Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  onEpoch(peerStates: PeerStates, epochTime: number, signalling: Signalling<CoinMethods, SerializedCoinState>) {
    console.log('Epoch:', new Date().toISOString());
    const myState = this.getState()

    const blockYield = this.blockYield(peerStates, epochTime)

    let netReputation = 0;
    (Object.keys(peerStates) as (keyof PeerStates)[]).forEach((peer) => {
      const state = peerStates[peer]!
      if (state.reputation === null) return delete peerStates[peer]
      netReputation += state.reputation;
      if (state.reputation > 0) {
        console.log('Rewarding', peer.slice(0, 8) + '...')
        this.call('mint', { to: peer, amount: myState[peer] ? BigInt(Math.floor(Number(myState[peer])*blockYield)) : this.decimalMultiplier })
        state.reputation = 0
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('Slashing', peer.slice(0, 8) + '...')
        this.call('burn', { to: peer, amount: (myState[peer]*9n)/10n })
        state.reputation = 0
      }
    })
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.call('mint', { to: signalling.address, amount: myState[signalling.address] ? BigInt(Math.floor(Number(myState[signalling.address])*blockYield)) : this.decimalMultiplier })
    
    this.mempool = []
    console.log(this.getState())
  }

  call<T extends keyof CoinMethods>(method: T, args: Parameters<CoinMethods[T]>[0]): ReturnType<CoinMethods[T]> {
    // @ts-expect-error:
    return this.coinMethods[method](args);
  }

  onCall<T extends keyof CoinMethods>(method: T, _args: Parameters<CoinMethods[T]>[0], signalling: Signalling<CoinMethods, SerializedCoinState>) {
    if (method === 'transfer') {
      const args = _args as Parameters<CoinMethods['transfer']>[0]
      if (!this.mempool.some(tx => tx.signature === args.signature)) {
        this.mempool.push(args)
        signalling.sendMessage([ 'call', method, args ])
        this.call('transfer', args)
      }
    }
  }
}