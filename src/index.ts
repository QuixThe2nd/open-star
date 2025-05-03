import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";
import type { MethodReturn } from "./types";

export type Methods<T extends Record<string, (arg: any) => MethodReturn>> = { [K in keyof T]: T[K] extends (arg: infer A) => MethodReturn ? (arg: A) => MethodReturn : never }
export type Message<OracleName extends string, OracleMethods extends Record<string, (arg: any) => MethodReturn>, SerializedState> = { [K in keyof OracleMethods]: [OracleName, 'call', K & string, Parameters<OracleMethods[K]>[0]] }[keyof OracleMethods] | [OracleName, 'state', SerializedState];
export type PeerStates<State> = { [from: `0x${string}`]: { lastSend: null | State; lastReceive: null | State; reputation: number | null } }
export type Oracle<OracleState, OracleMethods extends Record<string, (arg: any) => MethodReturn>> = {
  startupState: (_peerStates: OracleState[]) => Promise<OracleState> | OracleState,
  reputationChange: (_peer: { [key: `0x${string}`]: { reputation: number, state: OracleState }}, _epochTime: number) => Promise<void> | void,
  state: State<OracleState>,
  methods: OracleMethods
  methodDescriptions: { [K in keyof OracleMethods]: Parameters<OracleMethods[keyof OracleMethods]>[0] }
  keyManager: KeyManager
  epochTime: number
  transactionToID: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0]) => string
  ORC20?: {
    ticker: string
  }
}
export type PingPongMessage = ['ping' | 'pong'];
type MempoolItem<M extends Methods<any>> = { method: keyof M, args: Parameters<M[keyof M]>[0] }

export const mode = <State>(arr: State[]): State => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop()!;

export function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj = {} as T;
  for (const key of (Object.keys(obj) as (keyof T)[]).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = typeof obj[key] === 'object' ? sortObjectByKeys(obj[key] as T[keyof T] & object) : obj[key];
  }
  return sortedObj;
}

export class State<OracleState> {
  private _value: OracleState
  constructor(state: OracleState) {
    this._value = state
  }
  get value() {
    return this._value
  }
  set value(state: OracleState) {
    this._value = state
  }
}

export class OpenStar<OracleName extends string, OracleState, OracleMethods extends Record<string, (arg: any) => MethodReturn>> {
  public readonly signalling: Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>
  private epochCount = -1
  readonly keyManager: KeyManager
  private lastEpochState: string = ''
  connected = false
  readonly name: OracleName
  public readonly oracle: Oracle<OracleState, OracleMethods>
  private readonly _peerStates: PeerStates<OracleState> = {}
  private mempool: Record<string, MempoolItem<OracleMethods>> = {} as typeof this.mempool
  connectHandler?: () => void

  constructor(name: OracleName, oracle: Oracle<OracleState, OracleMethods>) {
    this.name = name
    this.keyManager = oracle.keyManager
    this.oracle = oracle
    this.signalling = new Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>(this)
  }

  get peerStates() {
    return this._peerStates
  }

  get peerCount() {
    return Object.keys(this._peerStates).length
  }

  public readonly onConnect = async (): Promise<void> => {
    if (!this.connected) {
      if(this.connectHandler) this.connectHandler()
      this.connected = true
      console.log(`[${this.name}] Connected`)
      this.sendState().catch(console.error)
      let peerStates: OracleState[] = []
      while (!peerStates.length) {
        await new Promise((res) => setTimeout(res, 100))
        peerStates = Object.values(this.peerStates).map(state => state.lastReceive).filter(state => state !== null)
      }
      this.oracle.state.value = await this.oracle.startupState(peerStates)
      this.sendState().catch(console.error)

      const startTime = +new Date();
      await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.oracle.epochTime) + 1) * this.oracle.epochTime - startTime))
      await this.epoch();
      setInterval(() => {
        this.epoch().catch(console.error)
      }, this.oracle.epochTime);
    }
  }

  public readonly onMessage = (message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage, from: `0x${string}`, callback: (_message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage) => void): void => {
    console.log(`[${message[0].toUpperCase()}] Received message: ${message[1]} from ${from.slice(0, 8)}...`)
    if (message[0] === 'ping') callback(['pong']);
    else if (message[0] === 'pong') console.log('pong')
    else if (message[0] === this.name) {
      if (message[1] === 'state') {
        this.peerStates[from] ??= { lastReceive: null, lastSend: null, reputation: 0 }
        this.peerStates[from].lastReceive = message[2]

        const state = this.oracle.state.value
        if (JSON.stringify(state) !== JSON.stringify(this.peerStates[from].lastSend)) {
          this.peerStates[from].lastSend = state
          callback([message[0], 'state', state])
        }

        this.peerStates[from].reputation ??= 0
        if (JSON.stringify(this.peerStates[from].lastSend) === JSON.stringify(this.peerStates[from].lastReceive)) this.peerStates[from].reputation++
        else if (this.epochCount <= 0 && Object.keys(this.peerStates[from].lastSend ?? '{}').length !== 0) this.peerStates[from].reputation--
      } else if (message[1] === 'call') {
        const id = this.oracle.transactionToID(message[2], message[3])
        if ('time' in message[3] && message[3].time < +new Date() - this.oracle.epochTime) return console.error('Transaction too old.')
        if (Object.keys(this.mempool).includes(id)) return console.error('Transaction already in mempool.')
        this.mempool[id] = { method: message[2], args: message[3] }
        this.sendMessage([ this.name, 'call', message[2], message[3] ]).catch(console.error)
        Promise.resolve(this.call(message[2], message[3])).then(() => console.log(this.oracle.state.value)).catch(console.error)
      }
    }
  }

  private readonly epoch = async (): Promise<void> => {
    console.log(`[${this.name}] Epoch:`, new Date().toISOString());
    this.epochCount++

    const state = this.oracle.state.value
    if (JSON.stringify(state) !== this.lastEpochState) {
      const peers: { [key: `0x${string}`]: { reputation: number, state: OracleState }} = {}
      let netReputation = 0;
      for (const _peer in this.peerStates) {
        const peer = _peer as keyof PeerStates<OracleState>
        const state = this.peerStates[peer]!
        if (state.reputation === null) {
          delete this.peerStates[peer]
          continue
        }
        if (state.lastReceive) peers[peer] = { reputation: state.reputation, state: state.lastReceive }
        netReputation += state.reputation;
        state.reputation = null
      }
      if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
      await this.oracle.reputationChange(peers, this.oracle.epochTime)
      this.mempool = {} as typeof this.mempool
      console.log(`[${this.name}]`, this.oracle.state.value)
      this.lastEpochState = JSON.stringify(this.oracle.state.value)
    }

    this.sendState().catch(console.error)
  }

  private readonly call = <T extends keyof typeof this.oracle.methods>(method: T, args: Parameters<typeof this.oracle.methods[T]>[0]): Promise<string | void> | string | void => this.oracle.methods[method]!(args)
  private readonly sendState = () => this.signalling.sendMessage([this.name, 'state', this.oracle.state.value]);
  public readonly sendMessage = (message: Message<OracleName, OracleMethods, OracleState>) => this.signalling.sendMessage(message);
}

export { KeyManager, Signalling }