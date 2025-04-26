import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";

export type MessageType<OracleName extends string, OracleMethods extends MethodsType, SerializedState, K extends keyof OracleMethods = keyof OracleMethods> = PingPongMessage | [OracleName, 'call', K, Parameters<OracleMethods[K]>[0]] | [OracleName, 'state', SerializedState];
export type MethodsType = { [key: string]: (_args: any ) => Promise<true | string> | true | string }
export type PeerStates<State> = { [from: `0x${string}`]: { lastSend: null | State; lastReceive: State; reputation: number | null } }

export interface OracleType<OracleName extends string, OracleMessage extends unknown[], OracleState extends object, OracleMethods extends MethodsType> {
  getState: () => OracleState
  onEpoch: (_signalling: Signalling<OracleMessage>, _epochTime: number) => Promise<void> | void
  call: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0], _signalling: Signalling<OracleMessage>) => Promise<void> | void
  onConnect: (_signalling: Signalling<OracleMessage>) => Promise<void> | void
  boilerplateState: OracleState
  peerStates: PeerStates<OracleState>
  name: OracleName
  methods: OracleMethods
}

export const mode = <State>(arr: State[]): State | undefined => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

export function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj = {} as T;
  for (const key of (Object.keys(obj) as (keyof T)[]).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = typeof obj[key] === 'object' ? sortObjectByKeys(obj[key] as T[keyof T] & object) : obj[key];
  }
  return sortedObj;
}

export type PingPongMessage = ['ping' | 'pong'];

export class OpenStar<OracleName extends string, OracleState extends object, OracleMethods extends MethodsType, Oracle extends OracleType<OracleName, MessageType<OracleName, OracleMethods, OracleState>, OracleState, OracleMethods>> {
  private readonly oracle: Oracle;
  public readonly signalling: Signalling<PingPongMessage | MessageType<OracleName, OracleMethods, OracleState>>
  private readonly epochTime = 5_000
  private epochCount = -1
  readonly keyManager: KeyManager
  connected = false

  constructor(oracle: Oracle, keyManager?: KeyManager) {
    this.keyManager = keyManager ?? new KeyManager()
    this.oracle = oracle
    this.signalling = new Signalling<PingPongMessage | MessageType<OracleName, OracleMethods, OracleState>>(oracle.name, this.onMessage, this.onConnect, this.keyManager)
  }

  private readonly onConnect = async (): Promise<void> => {
    if (!this.connected) {
      this.connected = true
      console.log(`[${this.oracle.name.toUpperCase()}] Connected`)
      await this.oracle.onConnect(this.signalling)

      const startTime = +new Date();
      await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.epochTime) + 1) * this.epochTime - startTime))
      await this.epoch();
      setInterval(() => {
        this.epoch().catch(console.error)
      }, this.epochTime);
    }
  }

  private readonly onMessage = (message: PingPongMessage | MessageType<OracleName, OracleMethods, OracleState>, from: Hex, callback: (_message: PingPongMessage | MessageType<OracleName, OracleMethods, OracleState>) => void): void => {
    console.log(`[${message[0].toUpperCase()}] Received message: ${message[1]} from ${from.slice(0, 8)}...`)
    if (message[0] === 'ping') callback(['pong']);
    else if (message[0] === 'pong') console.log('pong')
    else if (message[0] === this.oracle.name) {
      const oracle = this.oracle
      if (message[1] === 'state') {
        oracle.peerStates[from] ??= { lastReceive: oracle.boilerplateState, lastSend: null, reputation: 0 }
        oracle.peerStates[from].lastReceive = message[2]

        const state = oracle.getState()
        if (JSON.stringify(state) !== JSON.stringify(oracle.peerStates[from].lastSend)) {
          oracle.peerStates[from].lastSend = state
          const stateMessage: [typeof message[0], 'state', typeof state] = [message[0], 'state', state];
          callback(stateMessage);
        }

        oracle.peerStates[from].reputation ??= 0
        if (JSON.stringify(oracle.peerStates[from].lastSend) === JSON.stringify(oracle.peerStates[from].lastReceive)) oracle.peerStates[from].reputation++
        else if (this.epochCount <= 0) {
          if (Object.keys(oracle.peerStates[from].lastSend ?? '{}').length !== 0) oracle.peerStates[from].reputation--
        }
      } else if (message[1] === 'call') {
        Promise.resolve(oracle.call(message[2], message[3], this.signalling)).catch(console.error)
      }
    }
  }

  private readonly epoch = async (): Promise<void> => {
    console.log(`[${this.oracle.name.toUpperCase()}] Epoch:`, new Date().toISOString());
    this.epochCount++
    await this.oracle.onEpoch(this.signalling, this.epochTime)
    console.log(`[${this.oracle.name.toUpperCase()}]`, this.oracle.getState())

    this.signalling.sendMessage([this.oracle.name, 'state', this.oracle.getState()]).catch(console.error)
  }
}