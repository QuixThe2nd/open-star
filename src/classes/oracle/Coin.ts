import { recoverAddress, type Hex } from 'viem';
import { KeyManager } from "../KeyManager";

export type CoinState = { [pubKey: string]: bigint }
export type SerializedCoinState = { [pubKey: string]: `0x${string}` }
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
  private readonly coinMethods: CoinMethods = {

    mint: (args: Parameters<CoinMethods['mint']>[0]): ReturnType<CoinMethods['mint']> => {
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

  call<T extends keyof CoinMethods>(method: T, args: Parameters<CoinMethods[T]>[0]): ReturnType<CoinMethods[T]> {
    // @ts-expect-error:
    return this.coinMethods[method](args);
  }
}