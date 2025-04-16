import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";
import { CoinOracle } from './classes/oracle/Coin';
import { NameServiceOracle } from "./classes/oracle/NameService";
import { DemoOracle } from "./classes/oracle/Demo";

const keyManager = new KeyManager()

/** CONFIG START */
const oraclesDefinition = {
  coin: new CoinOracle(keyManager),
  nameService: new NameServiceOracle(keyManager),
  demo: new DemoOracle(),
}
/** CONFIG END */

export type MethodToTuple<Methods extends object> = { [MethodName in keyof Methods]: Methods[MethodName] extends (_args: infer Args) => unknown ? [MethodName, Args] : never }[keyof Methods]
type MessageType<OracleName extends string, OracleMethods extends object, SerializedState extends object> = [OracleName, 'call', ...MethodToTuple<OracleMethods>] | [OracleName, 'state', SerializedState] | ['ping' | 'pong'];
export type Message = MessageType<keyof typeof oraclesDefinition, Methods, typeof oraclesDefinition[keyof typeof oraclesDefinition] extends { getState(): infer R } ? R : never>
export type Methods = { [key: string]: (_args: any ) => Promise<true | string> | true | string }
export type PeerStates<State> = { [from: `0x${string}`]: { lastSend: State; lastReceive: State; reputation: number | null } }

export interface Oracle<Message extends unknown[], State extends object, OracleMethods extends Methods> {
  getState: () => State
  onEpoch: (_signalling: Signalling<Message>, _epochTime: number) => void
  onCall: <T extends keyof Methods & string>(_method: T, _args: Parameters<OracleMethods[T]>[0], _signalling: Signalling<Message>) => Promise<void> | void
  onConnect: (_signalling: Signalling<Message>) => Promise<void> | void
  boilerplateState: State
  peerStates: PeerStates<State>
}

export const mode = <State>(arr: State[]): State | undefined => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

export function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj = {} as T;
  for (const key of (Object.keys(obj) as (keyof T)[]).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = typeof obj[key] === 'object' ? sortObjectByKeys(obj[key] as T[keyof T] & object) : obj[key];
  }
  return sortedObj;
}

class OpenStar {
  private readonly oracles: typeof oracles;
  private readonly signalling: Signalling<Message>
  private readonly epochTime = 5_000
  private epochCount = -1

  constructor(keyManager: KeyManager, newOracles: typeof oracles) {
    this.oracles = newOracles
    this.signalling = new Signalling<Message>(this.onMessage, this.onConnect, keyManager)
  }

  private readonly onConnect = async (): Promise<void> => {
    console.log('[OPENSTAR] Connected')
    for (const oracle of this.oracles.values()) {
      await oracle.onConnect(this.signalling)
    }

    const startTime = +new Date();
    await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.epochTime) + 1) * this.epochTime - startTime))
    this.epoch();
    setInterval(this.epoch, this.epochTime);
  }

  private readonly onMessage = (message: Message, from: Hex, callback: (_message: Message) => void): void => {
    console.log(`[${message[0].toUpperCase()}] Received message: ${message[1]} from ${from.slice(0, 8)}...`)
    if (message[0] === 'ping') callback([ 'pong' ])
    else if (message[0] === 'pong') console.log('pong')
    else {
      const oracleName = message[0]
      const oracle = this.oracles.get(oracleName)
      if (!oracle) {
        console.error('Unknown Oracle')
        return
      }
      if (message[1] === 'state') {
        // @ts-expect-error: TS linter is stupid
        oracle.peerStates[from] ??= { lastReceive: oracle.boilerplateState, lastSend: oracle.boilerplateState, reputation: 0 }
        oracle.peerStates[from]!.lastReceive = message[2]

        const state = oracle.getState()
        if (JSON.stringify(state) !== JSON.stringify(oracle.peerStates[from]!.lastSend)) {
          oracle.peerStates[from]!.lastSend = state
          callback([ message[0], 'state', state ])
        }

        oracle.peerStates[from]!.reputation ??= 0
        if (JSON.stringify(oracle.peerStates[from]!.lastSend) === JSON.stringify(oracle.peerStates[from]!.lastReceive)) oracle.peerStates[from]!.reputation++ // TODO: stake weighted voting
        else if (this.epochCount <= 0) oracle.peerStates[from]!.reputation--
      } else if (message[1] === 'call') {
        Promise.resolve(oracle.onCall(message[2], message[3], this.signalling)).catch(console.error)
      }
    }
  }

  private readonly epoch = (): void => {
    console.log('[OPENSTAR] Epoch:', new Date().toISOString());
    this.epochCount++
    for (const [oracleName, oracle] of this.oracles) {
      oracle.onEpoch(this.signalling, this.epochTime)
      this.signalling.sendMessage([ oracleName, 'state', oracle.getState() ]).catch(console.error)
    }
  }
}

const oracleEntries = Object.entries(oraclesDefinition) as [keyof typeof oraclesDefinition, typeof oraclesDefinition[keyof typeof oraclesDefinition]][]
const oracles = new Map<keyof typeof oraclesDefinition, typeof oraclesDefinition[keyof typeof oraclesDefinition]>(oracleEntries)
const openStar = new OpenStar(keyManager, oracles)
console.log('[OPENSTAR]', openStar)