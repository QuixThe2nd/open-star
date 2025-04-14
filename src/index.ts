import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";
import { CoinOracle, type CoinMethods, type SerializedCoinState, serialize, deserialize, type CoinState } from './classes/oracle/Coin';

export type MethodToTuple<Methods extends object> = {
  [MethodName in keyof Methods]:
    Methods[MethodName] extends (_args: infer Args) => unknown ? [MethodName, Args] : never
}[keyof Methods]
type MessageType<
  OracleName extends string,
  OracleMethods extends object,
  SerializedState extends object
> = 
  | [OracleName, 'call', ...MethodToTuple<OracleMethods>]
  | [OracleName, 'state', SerializedState]
  | ['ping' | 'pong'];
type Message<OracleName extends string, OracleMethods extends object, SerializedState extends object> = MessageType<OracleName, OracleMethods, SerializedState>
type PeerStates<State> = { [from: Hex]: { lastSend: State, lastReceive: State, reputation: number | null } }

export interface Oracle<Message, Name extends string, State extends object> {
  name: Name
  getState: () => State
  setState: (_state: State) => void
  peerStates: PeerStates<State>
  onEpoch: (_peerStates: PeerStates<State>, _epochTime: number, _signalling: Signalling<Message>) => void
  onCall: <T extends keyof CoinMethods>(_method: T, _args: Parameters<CoinMethods[T]>[0], _signalling: Signalling<Message>) => void
}

const mode = <State>(arr: State[]): State | undefined => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

class OpenStar<Name extends 'coin'> {
  private readonly oracles: Map<Name, Oracle<Message<Name, CoinMethods, SerializedCoinState>, Name, CoinState>>;
  private readonly signalling: Signalling<Message<Name, CoinMethods, SerializedCoinState>>
  private readonly epochTime = 5_000
  private epochCount = -1

  constructor(keyManager: KeyManager, oracles: Map<Name, Oracle<Message<Name, CoinMethods, SerializedCoinState>, Name, CoinState>>) {
    this.oracles = oracles
    this.signalling = new Signalling<Message<Name, CoinMethods, SerializedCoinState>>(this.onMessage, this.onConnect, keyManager)
  }

  private readonly onConnect = async (): Promise<void> => {
    console.log('Connected')
    for (const [oracleName, oracle] of this.oracles) {
      this.signalling.sendMessage([ oracleName, 'state', serialize(oracle.getState()) ])

      let mostCommonState = undefined
      while (mostCommonState == undefined) {
        await new Promise((res) => setTimeout(res, 100))
        mostCommonState = mode(Object.values(oracle.peerStates).map(state => state.lastReceive))
      }
      console.log(mostCommonState)
      oracle.setState(mostCommonState)
      this.signalling.sendMessage([ oracle.name, 'state', serialize(mostCommonState) ])
    }

    const startTime = +new Date();
    await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.epochTime) + 1) * this.epochTime - startTime))
    this.epoch();
    setInterval(this.epoch, this.epochTime);
  }

  private readonly onMessage = (message: Message<Name, CoinMethods, SerializedCoinState>, from: Hex, callback: (_message: Message<Name, CoinMethods, SerializedCoinState>) => void): void => {
    console.log('Received message:', message[0], 'from', from.slice(0, 8) + '...')
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
        oracle.peerStates[from].lastReceive = deserialize(message[2])

        const state = oracle.getState()
        if (JSON.stringify(serialize(state)) !== JSON.stringify(serialize(oracle.peerStates[from].lastSend))) {
          oracle.peerStates[from].lastSend = state
          callback([ message[0], 'state', serialize(state) ])
        }

        if (oracle.peerStates[from].reputation === null) oracle.peerStates[from].reputation = 0
        if (JSON.stringify(serialize(oracle.peerStates[from].lastSend)) === JSON.stringify(serialize(oracle.peerStates[from].lastReceive))) oracle.peerStates[from].reputation++ // TODO: stake weighted voting
        else if (this.epochCount <= 0) oracle.peerStates[from].reputation--
      } else if (message[1] === 'call') {
        oracle.onCall(message[2], message[3], this.signalling)
      }
    }
  }

  private readonly epoch = (): void => {
    this.epochCount++
    for (const [oracleName, oracle] of this.oracles) {
      oracle.onEpoch(oracle.peerStates, this.epochTime, this.signalling)
      this.signalling.sendMessage([ oracleName, 'state', serialize(oracle.getState()) ])
    }
  }
}

const keyManager = await KeyManager.init()
const oracles = new Map()
oracles.set('coin', new CoinOracle(keyManager))
const openStar = new OpenStar<'coin'>(keyManager, oracles)
console.log(openStar)