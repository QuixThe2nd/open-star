import type { Hex } from "viem";
import { KeyManager } from "./classes/KeyManager";
import { Signalling } from "./classes/Signalling";
import { CoinOracle, type CoinMethods, type CoinState, type SerializedCoinState, serialize, deserialize } from './classes/oracle/Coin';

type MethodToTuple<T> = { [K in keyof T]: T[K] extends (args: infer Args) => any ? [K, Args] : never }[keyof T]
type MessageTypes<T extends object> = MethodToTuple<T> | [ 'state', SerializedCoinState ] | [ 'ping' | 'pong' ]
type PeerState = { lastSend: CoinState, lastReceive: CoinState, reputation: number | null }
type PeerStates = { [from: Hex]: PeerState }

const mode = <T>(arr: T[]) => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop();

// Usage example - uncomment to use directly
// (async () => {
//   const keyManager = await KeyManager.init();
//   const coinOracle = new CoinOracle(keyManager);
//   const rpcServer = new RpcServer(keyManager, coinOracle);
//   rpcServer.start();
// })();

class OpenStar {
  private readonly coinOracle: CoinOracle
  private readonly blockYield: number
  private readonly signalling: Signalling<MessageTypes<CoinMethods>>
  private readonly peerStates: PeerStates = {}
  private readonly epochTime = 5_000
  private readonly apy = 1.2
  private readonly decimalMultiplier = BigInt("1".padEnd(19, '0'))
  private epochCount = -1
  private transactions: Parameters<CoinMethods['transfer']>[0][] = []

  constructor(keyManager: KeyManager) {
    this.blockYield = Math.pow(this.apy, 1 / ((365 * 24 * 60 * 60 * 1000) / this.epochTime)) - 1;
    this.coinOracle = new CoinOracle(keyManager)
    this.signalling = new Signalling<MessageTypes<CoinMethods>>(this.onMessage, this.onConnect, keyManager)
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

  private readonly onMessage = (message: MessageTypes<CoinMethods>, from: Hex, callback: (message: MessageTypes<CoinMethods>) => void) => {
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
    } else if (message[0] === 'transfer' && !this.transactions.some(tx => tx.signature === message[1].signature)) {
      this.transactions.push(message[1])
      this.signalling.sendMessage(message)
      this.coinOracle.call('transfer', message[1])
    }
  }

  private readonly epoch = () => {
    this.epochCount++
    console.log('Epoch:', new Date().toISOString());
    const myState = this.coinOracle.getState()

    let netReputation = 0;
    (Object.keys(this.peerStates) as (keyof PeerStates)[]).forEach((peer) => {
      const state = this.peerStates[peer]!
      if (state.reputation === null) return delete this.peerStates[peer]
      netReputation += state.reputation;
      if (state.reputation > 0) {
        console.log('Rewarding', peer.slice(0, 8) + '...')
        this.coinOracle.call('mint', { to: peer, amount: myState[peer] ? BigInt(Math.floor(Number(myState[peer])*this.blockYield)) : this.decimalMultiplier })
        state.reputation = 0
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('Slashing', peer.slice(0, 8) + '...')
        this.coinOracle.call('burn', { to: peer, amount: (myState[peer]*9n)/10n })
        state.reputation = 0
      }
    })
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.coinOracle.call('mint', { to: this.signalling.address, amount: myState[this.signalling.address] ? BigInt(Math.floor(Number(myState[this.signalling.address])*this.blockYield)) : this.decimalMultiplier })

    this.signalling.sendMessage([ 'state', serialize(this.coinOracle.getState()) ])

    this.transactions = []
    
    console.log(this.coinOracle.getState())
  }
}

const openStar = new OpenStar(await KeyManager.init())