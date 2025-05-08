import { Signalling } from "../classes/Signalling";
import type { KeyManager } from "../classes/KeyManager";
import type { NonEmptyArray } from "../types/generic";
import type { MethodReturn, PingPongMessage, Oracle, PeerStates, MempoolItem, Message } from "../types/Oracle";
import { isHexAddress } from "../utils";

export class OpenStar<OracleState extends Record<string, unknown> = Record<string, unknown>, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>, OracleName extends string = string> {
  public readonly signalling: Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>
  private epochCount = -1
  readonly keyManager: KeyManager
  private lastEpochState = ''
  connected = false
  readonly name: OracleName
  public readonly oracle: Oracle<OracleState, OracleMethods, OracleName>
  public readonly _peerStates: PeerStates<OracleState> = {}
  private mempool: Record<string, MempoolItem<OracleMethods>> = {}
  connectHandler?: () => void

  constructor(oracle: Oracle<OracleState, OracleMethods, OracleName>, keyManager: KeyManager) {
    this.name = oracle.name
    this.keyManager = keyManager
    this.oracle = oracle
    this.signalling = new Signalling<Message<OracleName, OracleMethods, OracleState> | PingPongMessage>(this)
    if ('setOpenStar' in oracle) this.initializeExtended()
  }

  protected initializeExtended(): void {
    if (this.oracle.setOpenStar) this.oracle.setOpenStar(this)
  }

  get peerStates() {
    return this._peerStates
  }

  get peerCount() {
    return Object.keys(this._peerStates).length
  }

  public readonly onConnect = async (): Promise<void> => {
    if (!this.connected) {
      if (this.connectHandler !== undefined) this.connectHandler()
      this.connected = true
      console.log(`[${this.name}] Connected`)
      this.sendState().catch(console.error)
      let peerStates: OracleState[] = []
      while (peerStates.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        peerStates = Object.values(this.peerStates).map(state => state.lastReceive).filter(state => state !== null)
      }
      this.oracle.state.set(await this.oracle.startupState(peerStates as NonEmptyArray<OracleState>))
      this.sendState().catch(console.error)

      const startTime = +new Date();
      await new Promise((resolve) => setTimeout(resolve, (Math.floor(startTime / this.oracle.epochTime) + 1) * this.oracle.epochTime - startTime))
      this.epoch();
      setInterval(() => this.epoch(), this.oracle.epochTime);
    }
  }

  public readonly onMessage = async (message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage, from: `0x${string}`, callback: (_message: Message<OracleName, OracleMethods, OracleState> | PingPongMessage) => void): Promise<void> => {
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
        if (JSON.stringify(this.peerStates[from].lastSend) === JSON.stringify(this.oracle.state.value)) this.peerStates[from].reputation++
        else if (this.epochCount <= 0 && Object.keys(this.peerStates[from].lastSend ?? '{}').length !== 0) this.peerStates[from].reputation--
      } else if (message[1] === 'call') {
        const id = this.oracle.transactionToID ? this.oracle.transactionToID(message[2], message[3]) : JSON.stringify({ method: message[2], args: message[3] })
        if ('time' in message[3] && message[3].time < +new Date() - this.oracle.epochTime) return console.error('Transaction too old.')

        if ('signature' in message[3]) {
          const { signature, ...args } = message[3]
          if (!isHexAddress(signature)) return console.error('Invalid signature')
          if (!isHexAddress(args['from'])) return console.error('Invalid signature')
          if (!await this.keyManager.verify(signature, JSON.stringify(args), args['from'])) return console.error('Invalid signature')
        }

        if (Object.keys(this.mempool).includes(id)) return console.error('Transaction already in mempool.')
        this.mempool[id] = { method: message[2], args: message[3] }
        this.sendMessage([ this.name, 'call', message[2], message[3] ]).catch(console.error)
        Promise.resolve(this.call(message[2], message[3])).then(() => console.log(this.oracle.state.value)).catch(console.error)
      }
    }
  }

  private readonly epoch = (): void => {
    console.log(`[${this.name}] Epoch:`, new Date().toISOString());
    this.epochCount++

    let netReputation = 0;
    this.peerStates.forEach(peer => {
      const state = this.peerStates[peer]
      if (state === undefined) return
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      if (state.lastReceive !== null && this.oracle.reputationChange) this.oracle.reputationChange(peer, state.reputation)
      netReputation += state.reputation;
      state.reputation = null
      if (this.peerStates[peer]) this.peerStates[peer].reputation = null
    })
    if (this.oracle.reputationChange) this.oracle.reputationChange(this.keyManager.address, 1)
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.mempool = {}

    if (JSON.stringify(this.oracle.state.value) !== this.lastEpochState) {
      console.log(`[${this.name}]`, this.oracle.state.value)
      this.lastEpochState = JSON.stringify(this.oracle.state.value)
    }

    this.sendState().catch(console.error)
  }

  private readonly call = async <T extends keyof OracleMethods>(method: T, args: Parameters<OracleMethods[T]>[0]): Promise<string | void> => {
    if ('methods' in this.oracle) await this.oracle.methods[method]?.(args)
  }
  private readonly sendState = async () => this.signalling.sendMessage([this.name, 'state', this.oracle.state.value]);
  public readonly sendMessage = async (message: Message<OracleName, OracleMethods, OracleState>) => this.signalling.sendMessage(message);
}
