import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";

export type Message<OracleName extends string, OracleMethods extends Methods, SerializedState, K extends keyof OracleMethods = keyof OracleMethods> = [OracleName, 'call', K, Parameters<OracleMethods[K]>[0]] | [OracleName, 'state', SerializedState];
export type Methods = { [key: string]: (_args: any ) => Promise<void | string> | void | string }
export type PeerStates<State> = { [from: `0x${string}`]: { lastSend: null | State; lastReceive: null | State; reputation: number | null } }

type Oracle<OracleState extends object, OracleMethods extends Methods, OracleMempool extends unknown[]> = {
  startupState: () => Promise<OracleState> | OracleState,
  reputationChange: (_reputation: { [key: `0x${string}`]: number }, _epochTime: number) => Promise<void> | void,
  state: OracleState,
  peerStates: PeerStates<OracleState>,
  call: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0]) => Promise<void> | void
  mempool: OracleMempool
  methods: OracleMethods
  keyManager: KeyManager
  epochTime: number
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

export class OpenStar<OracleName extends string, OracleState extends object, OracleMethods extends Methods, OracleMempool extends unknown[]> {
  public readonly signalling: Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>
  private epochCount = -1
  readonly keyManager: KeyManager
  private lastEpochState: string = ''
  connected = false
  readonly name: OracleName
  public readonly oracle: Oracle<OracleState, OracleMethods, OracleMempool>

  constructor(name: string, oracle: Oracle<OracleState, OracleMethods, OracleMempool>) {
    this.name = name as OracleName
    this.keyManager = oracle.keyManager
    this.oracle = oracle
    this.signalling = new Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>(this)
  }

  public readonly onConnect = async (): Promise<void> => {
    if (!this.connected) {
      this.connected = true
      console.log(`[${this.name}] Connected`)
      this.sendState().catch(console.error)
      await this.oracle.startupState()
      this.sendState().catch(console.error)

      const startTime = +new Date();
      await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.oracle.epochTime) + 1) * this.oracle.epochTime - startTime))
      await this.epoch();
      setInterval(() => {
        this.epoch().catch(console.error)
      }, this.oracle.epochTime);
    }
  }

  public readonly onMessage = (message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage, from: Hex, callback: (_message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage) => void): void => {
    console.log(`[${message[0].toUpperCase()}] Received message: ${message[1]} from ${from.slice(0, 8)}...`)
    if (message[0] === 'ping') callback(['pong']);
    else if (message[0] === 'pong') console.log('pong')
    else if (message[0] === this.name) {
      if (message[1] === 'state') {
        this.oracle.peerStates[from] ??= { lastReceive: null, lastSend: null, reputation: 0 }
        this.oracle.peerStates[from].lastReceive = message[2]

        const state = this.oracle.state
        if (JSON.stringify(state) !== JSON.stringify(this.oracle.peerStates[from].lastSend)) {
          this.oracle.peerStates[from].lastSend = state
          callback([message[0], 'state', state]);
        }

        this.oracle.peerStates[from].reputation ??= 0
        if (JSON.stringify(this.oracle.peerStates[from].lastSend) === JSON.stringify(this.oracle.peerStates[from].lastReceive)) this.oracle.peerStates[from].reputation++
        else if (this.epochCount <= 0) {
          if (Object.keys(this.oracle.peerStates[from].lastSend ?? '{}').length !== 0) this.oracle.peerStates[from].reputation--
        }
      } else if (message[1] === 'call') {
        Promise.resolve(this.oracle.call(message[2], message[3])).catch(console.error)
      }
    }
  }

  private readonly epoch = async (): Promise<void> => {
    console.log(`[${this.name}] Epoch:`, new Date().toISOString());
    this.epochCount++

    const state = this.oracle.state
    if (JSON.stringify(state) !== this.lastEpochState) {
      const reputation: { [key: `0x${string}`]: number } = {}
      let netReputation = 0;
      for (const _peer in this.oracle.peerStates) {
        const peer = _peer as keyof PeerStates<OracleState>
        const state = this.oracle.peerStates[peer]!
        if (state.reputation === null) {
          delete this.oracle.peerStates[peer]
          continue
        }
        reputation[peer] = state.reputation
        netReputation += state.reputation;
        state.reputation = null
      }
      if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
      await this.oracle.reputationChange(reputation, this.oracle.epochTime)
      this.oracle.mempool = [] as unknown[] as OracleMempool
      console.log(`[${this.name}]`, this.oracle.state)
      this.lastEpochState = JSON.stringify(this.oracle.state)
    }

    this.sendState().catch(console.error)
  }

  private readonly sendState = (): Promise<number> => {
    return this.signalling.sendMessage([this.name, 'state', this.oracle.state]);
  };

  readonly sendMessage = (message: Message<OracleName, OracleMethods, OracleState>): Promise<number> => {
    return this.signalling.sendMessage(message);
  };
}

export { KeyManager, Signalling }
