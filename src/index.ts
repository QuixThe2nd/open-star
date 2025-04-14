import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling, type MessageType } from "./classes/Signalling";
import { CoinOracle, type CoinMethods, type CoinState, type SerializedCoinState, serialize, deserialize } from './classes/oracle/Coin';

type PeerState = { lastSend: CoinState, lastReceive: CoinState, reputation: number | null }
type PeerStates = { [from: Hex]: PeerState }

const mode = <T>(arr: T[]) => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

class OpenStar {
  private readonly coinOracle: CoinOracle
  private readonly signalling: Signalling<CoinMethods, SerializedCoinState>
  private readonly peerStates: PeerStates = {}
  private readonly epochTime = 5_000
  private epochCount = -1

  constructor(keyManager: KeyManager) {
    this.coinOracle = new CoinOracle(keyManager)
    this.signalling = new Signalling<CoinMethods, SerializedCoinState>(this.onMessage, this.onConnect, keyManager)
  }

  private readonly onConnect = async () => {
    console.log('Connected')
    this.signalling.sendMessage([ 'state', serialize(this.coinOracle.getState()) ])

    let mostCommonState = undefined
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
    }
    console.log(mostCommonState)
    this.coinOracle.setState(mostCommonState)
    this.signalling.sendMessage([ 'state', serialize(mostCommonState) ])

    const startTime = +new Date();
    await new Promise((res) => setTimeout(res, (Math.floor(startTime / this.epochTime) + 1) * this.epochTime - startTime))
    this.epoch();
    setInterval(this.epoch, this.epochTime);
  }

  private readonly onMessage = (message: MessageType<CoinMethods, SerializedCoinState>, from: Hex, callback: (message: MessageType<CoinMethods, SerializedCoinState>) => void) => {
    console.log('Received message:', message[0], 'from', from.slice(0, 8) + '...')
    if (message[0] === 'ping') callback([ 'pong' ])
    else if (message[0] === 'state') {
      if(!this.peerStates[from]) this.peerStates[from] = { lastReceive: {}, lastSend: {}, reputation: 0 }
      this.peerStates[from].lastReceive = deserialize(message[1])

      const state = this.coinOracle.getState()
      if (JSON.stringify(serialize(state)) !== JSON.stringify(serialize(this.peerStates[from].lastSend))) {
        this.peerStates[from].lastSend = state
        callback([ 'state', serialize(state) ])
      }

      if (this.peerStates[from].reputation === null) this.peerStates[from].reputation = 0
      if (JSON.stringify(serialize(this.peerStates[from].lastSend)) === JSON.stringify(serialize(this.peerStates[from].lastReceive))) this.peerStates[from].reputation++ // TODO: stake weighted voting
      else if (this.epochCount <= 0) this.peerStates[from].reputation--
    } else if (message[0] === 'call') {
      this.coinOracle.onCall(message[1], message[2], this.signalling)
    }
  }

  private readonly epoch = () => {
    this.epochCount++
    this.coinOracle.onEpoch(this.peerStates, this.epochTime, this.signalling)
    this.signalling.sendMessage([ 'state', serialize(this.coinOracle.getState()) ])
  }
}

const openStar = new OpenStar(await KeyManager.init())