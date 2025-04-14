import WebSocket from 'ws'
import Peer, { type Instance as PeerInstance } from 'simple-peer'
import WebRTC from '@roamhq/wrtc'
import type { Hex } from 'viem';
import type { KeyManager } from './KeyManager';

type AnnounceMessage = { type: 'announce', from: Hex }
type InitializeMessage = { type: 'initialize', to: Hex, from: Hex, data: string }
type FinalizeMessage = { type: 'finalize', to: Hex, from: Hex, data: string }
type Message = AnnounceMessage | InitializeMessage | FinalizeMessage
type MethodToTuple<T extends object> = [ 'call', ...{ [K in keyof T]: T[K] extends (_args: infer Args) => unknown ? [K, Args] : never }[keyof T] ]
export type MessageType<T extends object, S extends object> = MethodToTuple<T> | [ 'state', S ] | [ 'ping' | 'pong' ]

export class Signalling<T extends object, S extends object> {
  private readonly ws: WebSocket
  private readonly peers = new Map<string, PeerInstance>();
  private readonly onMessage: (_data: MessageType<T, S>, _from: Hex, _callback: (_message: MessageType<T, S>) => void) => void
  private readonly onConnect: () => void
  private connected = false
  private readonly keyManager: KeyManager

  constructor(onMessage: (_data: MessageType<T, S>, _from: Hex, _callback: (_message: MessageType<T, S>) => void) => void, onConnect: () => void, keyManager: KeyManager) {
    this.onMessage = onMessage
    this.onConnect = onConnect
    this.keyManager = keyManager

    console.log('Connecting...')

    this.ws = new WebSocket('wss://rooms.deno.dev/openstar-devnet');
    this.ws.on('open', this.announce);
    this.ws.on('message', this.onWsMessage);
  }

  private readonly onWsMessage = (data: string): void => {
    const message = JSON.parse(data) as Message;

    if (message.from === this.keyManager.getPublicKey()) return;
    else if (message.type === 'announce' && message.from !== this.keyManager.getPublicKey()) this.initialize(message)
    else if (message.type === 'initialize' && message.to === this.keyManager.getPublicKey()) this.finalize(message)
    else if (message.type === 'finalize' && message.to === this.keyManager.getPublicKey()) this.signal(message)
  }

  private readonly send = (message: Message): void => this.ws.send(JSON.stringify(message))

  private readonly createPeer = (from: Hex, initiator: boolean): Peer.Instance => {
    if (this.peers.has(from)) return this.peers.get(from)!
    const peer: PeerInstance = new Peer({ initiator, wrtc: WebRTC })
    this.peers.set(from, peer);
    
    peer.on('connect', () => {
      if (!this.connected) {
        this.onConnect()
        this.connected = true
      }
    });
    peer.on('data', async (data) => {
      const { signature, message } = JSON.parse(data)
      if (await this.keyManager.verify(signature, JSON.stringify(message), from)) {
        const msg = JSON.stringify(message)
        const signature = await this.keyManager.sign(msg)
        this.onMessage(message, from, (msg) => peer.send(JSON.stringify({ message: msg, signature })))
      }
    });
    peer.on('error', () => this.peers.delete(from));
    peer.on('close', () => this.peers.delete(from));
    peer.on('signal', signalData => this.send({ type: initiator ? 'initialize' : 'finalize', to: from, from: this.keyManager.getPublicKey(), data: signalData }));

    return peer;
  }

  /******* Handshake - START */
  // Step 1. Announce self to room
  private readonly announce = (): void => {
    console.log('1. Announcing')
    this.send({ type: 'announce', from: this.keyManager.getPublicKey() })
  }
  // Step 2. Send candidate to peer
  private readonly initialize = (message: AnnounceMessage): Peer.Instance => {
    console.log('2. Sending candidates')
    return this.createPeer(message.from, true)
  }
  // Step 3. Save candidates and send candidates back
  private readonly finalize = (message: InitializeMessage): void => {
    console.log('3. Saving & sending candidates')
    this.createPeer(message.from, false).signal(message.data);
  }
  // Step 4. Save candidates
  private readonly signal = (message: FinalizeMessage): void => {
    console.log('4. Saving candidates')
    this.peers.get(message.from)?.signal(message.data);
  }
  /******* Handshake - END */

  public readonly sendMessage = async (message: MessageType<T, S>): Promise<number> => {
    const signature = await this.keyManager.sign(JSON.stringify(message))

    let i = 0
    this.peers.forEach(peer => {
      try {
        if (peer.connected) {
          peer.send(JSON.stringify({ message, signature }))
          i++
        }
      } catch(e) {
        console.error(e)
      }
    })
    return i
  }

  get address(): Hex {
    return this.keyManager.getPublicKey()
  }
}