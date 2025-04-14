import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";
import { CoinOracle } from './classes/oracle/Coin';
import { NameServiceOracle } from "./classes/oracle/NameService";

const keyManager = new KeyManager()

/** CONFIG START */
const oraclesDefinition = {
  coin: new CoinOracle(keyManager),
  nameService: new NameServiceOracle(keyManager)
}
/** CONFIG END */

export type MethodToTuple<Methods extends object> = { [MethodName in keyof Methods]: Methods[MethodName] extends (_args: infer Args) => unknown ? [MethodName, Args] : never }[keyof Methods]
type Oracles = typeof oraclesDefinition[keyof typeof oraclesDefinition]
type OracleNames = keyof typeof oraclesDefinition;
type MessageType<OracleName extends string, OracleMethods extends object, SerializedState extends object> = [OracleName, 'call', ...MethodToTuple<OracleMethods>] | [OracleName, 'state', SerializedState] | ['ping' | 'pong'];
export type Message = MessageType<OracleNames, Methods, Oracles extends { getState(): infer R } ? R : never>
export type Methods = { [key: string]: (_args: any ) => Promise<true | string> | true | string }

export interface Oracle<Message, Name extends string, State extends object, OracleMethods extends Methods> {
  name: Name
  getState: () => State
  onEpoch: (_signalling: Signalling<Message>, _epochTime: number) => void
  onCall: <T extends keyof Methods>(_method: T, _args: Parameters<OracleMethods[T]>[0], _signalling: Signalling<Message>) => void
  onConnect: (_signalling: Signalling<Message>) => Promise<void>
}

export const mode = <State>(arr: State[]): State | undefined => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

export function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj = {} as T;
  for (const key of (Object.keys(obj) as (keyof T)[]).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = obj[key];
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
      oracle.onConnect(this.signalling).catch(console.error)
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
        if(!oracle.peerStates[from]) oracle.peerStates[from] = { lastReceive: {}, lastSend: {}, reputation: 0 }
        oracle.peerStates[from].lastReceive = message[2]

        const state = oracle.getState()
        if (JSON.stringify(state) !== JSON.stringify(oracle.peerStates[from].lastSend)) {
          oracle.peerStates[from].lastSend = state
          callback([ message[0], 'state', state ])
        }

        if (oracle.peerStates[from].reputation === null) oracle.peerStates[from].reputation = 0
        if (JSON.stringify(oracle.peerStates[from].lastSend) === JSON.stringify(oracle.peerStates[from].lastReceive)) oracle.peerStates[from].reputation++ // TODO: stake weighted voting
        else if (this.epochCount <= 0) oracle.peerStates[from].reputation--
      } else if (message[1] === 'call') {
        oracle.onCall(message[2], message[3], this.signalling)
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

const oracleEntries = Object.entries(oraclesDefinition) as [OracleNames, typeof oraclesDefinition[OracleNames]][]
const oracles = new Map<OracleNames, Oracles>(oracleEntries)
const openStar = new OpenStar(keyManager, oracles)
console.log('[OPENSTAR]', openStar)