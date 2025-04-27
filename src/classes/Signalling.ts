import WebSocket, { type RawData } from 'ws'
import Peer, { type Instance as PeerInstance } from 'simple-peer'
import WebRTC from '@roamhq/wrtc'
import type { Hex } from 'viem';
import type { KeyManager } from './KeyManager';

type AnnounceMessage = { type: 'announce', from: Hex }
type InitializeMessage = { type: 'initialize', to: Hex, from: Hex, data: object }
type FinalizeMessage = { type: 'finalize', to: Hex, from: Hex, data: object }
type SignallingMessage = AnnounceMessage | InitializeMessage | FinalizeMessage

export class Signalling<Message> {
  private readonly ws: WebSocket
  private readonly peers = new Map<string, PeerInstance>();
  private readonly onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void
  private readonly onConnect: () => Promise<void>
  private readonly keyManager: KeyManager

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
    this.onMessage = oracle.onMessage
    this.onConnect = oracle.onConnect
    this.keyManager = oracle.keyManager

    console.log('Connecting...')

    console.log(`wss://rooms.deno.dev/openstar-${oracle.name}`)
    this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`);
    this.ws.on('message', (data) => this.onWsMessage(data));
    this.ws.on('open', () => this.announce());
  }

  private readonly onWsMessage = (data: RawData): void => {
    const message = JSON.parse(data as unknown as string) as SignallingMessage;

    if (message.from === this.keyManager.getPublicKey()) return;
    else if (message.type === 'announce' && message.from !== this.keyManager.getPublicKey()) this.initialize(message)
    else if (message.type === 'initialize' && message.to === this.keyManager.getPublicKey()) this.finalize(message)
    else if (message.type === 'finalize' && message.to === this.keyManager.getPublicKey()) this.signal(message)
  }

  private readonly send = (message: SignallingMessage): void => this.ws.send(JSON.stringify(message))

  private readonly createPeer = (from: Hex, initiator: boolean): Peer.Instance => {
    if (this.peers.has(from)) this.peers.delete(from)
    const peer: PeerInstance = new Peer({ initiator, wrtc: WebRTC })
    this.peers.set(from, peer);

    peer.on('connect', () => {
      this.onConnect().catch(console.error)
    });
    peer.on('error', (e) => {
      console.log(`Connection error - ${from}`, e)
      this.peers.delete(from)
    });
    peer.on('close', () => this.peers.delete(from));
    peer.on('signal', (data: object) => this.send({ type: initiator ? 'initialize' : 'finalize', to: from, from: this.keyManager.getPublicKey(), data: data }));
    peer.on('data', (data: string): void => {
      const { signature, message } = JSON.parse(data) as { signature: Hex, message: Message }
      this.keyManager.verify(signature, JSON.stringify(message), from).then(async status => {
        if (status) {
          const msg = JSON.stringify(message)
          const signature = await this.keyManager.sign(msg)
          this.onMessage(message, from, (msg) => peer.send(JSON.stringify({ message: msg, signature })))
        }
      }).catch(console.error)
    });

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
    console.log('3. Sending candidate')
    this.createPeer(message.from, false).signal(message.data.toString());
  }
  // Step 4. Save candidates
  private readonly signal = (message: FinalizeMessage): void => {
    console.log('4. Saving candidate')
    this.peers.get(message.from)?.signal(message.data.toString());
  }
  /******* Handshake - END */

  public readonly sendMessage = async (message: Message): Promise<number> => {
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