import { WebSocket as NodeWebSocket } from 'ws';
import type { KeyManager } from './KeyManager';
import { isHexAddress } from '../utils';
import type { SignallingMessage } from '../types/Signalling';
import { Peer } from './Peer';

const WebSocket: typeof NodeWebSocket | typeof window.WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

export class Signalling<Message> {
  ws: NodeWebSocket | WebSocket;
  peers: Record<`0x${string}`, Peer<Message>> = {}
  messageQueue: SignallingMessage[] = [];
  connected = false
  private readonly onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
  private readonly connectionHandler: () => Promise<void>
  private readonly keyManager: KeyManager
  private readonly oracleName: string

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
    this.onMessage = oracle.onMessage
    this.connectionHandler = oracle.onConnect
    this.keyManager = oracle.keyManager
    this.oracleName = oracle.name

    this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`);

    this.ws.onopen = () => {
      console.log(`Announcing to ${this.ws.url}`);
      this.sendWSMessage({ announce: true, from: this.keyManager.address });
    };

    this.ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== 'string') return console.error('WS message is not a string')
      const message: unknown = JSON.parse(event.data);
      if (typeof message !== 'object' || message === null) return console.error('Failed to decode WS message')
      if (!('from' in message) || !isHexAddress(message.from)) return console.error('Invalid from address')
      if (message.from === this.keyManager.address) return console.error('Message is from self')
      if ('to' in message && message.to !== this.keyManager.address) return console.error('Message is for someone else', message)

      if ('announce' in message) this.peers[message.from] = new Peer<Message>(this.keyManager.address, message.from, (message: SignallingMessage) => this.sendWSMessage(message), this.keyManager, (data: Message, from: `0x${string}`, callback: (message: Message) => void) => this.onMessage(data, from, callback), () => this.onConnect());
      else if ('description' in message) {
        const peer = this.peers[message.from] ??= new Peer<Message>(this.keyManager.address, message.from, (message: SignallingMessage) => this.sendWSMessage(message), this.keyManager, (data: Message, from: `0x${string}`, callback: (message: Message) => void) => this.onMessage(data, from, callback), () => this.onConnect());
        peer.setRemoteDescription(message.description as RTCSessionDescription).catch(console.error);
      } else if ('iceCandidate' in message) {
        const peerConn = this.peers[message.from]
        if (peerConn === undefined) return console.error('Peer not found');
        peerConn.addIceCandidate(message.iceCandidate as RTCIceCandidateInit).catch(console.error);
      }
    }
    
    this.ws.onerror = (error: Event) => console.error(`[${this.oracleName}] WebSocket error:`, error)
    this.ws.onclose = () => console.log(`[${this.oracleName}] WebSocket closed`);
  }

  private sendWSMessage(message: SignallingMessage): void {
    this.messageQueue.push(message);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    else this.ws.addEventListener("open", () => this.ws.send(JSON.stringify(message)));
  }

  private onConnect() {
    if (!this.connected) {
      this.connected = true;
      this.connectionHandler().catch(console.error);
    }
  }

  public async sendMessage(message: Message): Promise<void> {
    const signature = await this.keyManager.sign(JSON.stringify(message));
    this.peers.forEach((_, peer) => peer.send({ message, signature }))
  }
}

export default Signalling;