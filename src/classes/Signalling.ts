import WebSocket from 'ws'
import WRTC from '@roamhq/wrtc'
import type { Hex } from 'viem';
import type { KeyManager } from './KeyManager';

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = WRTC

type SignallingMessage = { announce: true; from: `0x${string}` } | { offer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { answer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { iceCandidate: RTCIceCandidate; from: `0x${string}`; to: `0x${string}` };
type PeerConnection = { conn: RTCPeerConnection; channel: RTCDataChannel; iceCandidates: RTCIceCandidate[] };
type PeerConnections = { [address: `0x${string}`]: { offered?: PeerConnection; answered?: PeerConnection } };

export class Signalling<Message> {
  ws: WebSocket;
  peerConnections: PeerConnections = {}
  messageQueue: SignallingMessage[] = [];
  connected = false
  private readonly onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void
  private readonly onConnect: () => Promise<void>
  private readonly keyManager: KeyManager
  private readonly oracleName: string

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
    this.onMessage = oracle.onMessage
    this.onConnect = oracle.onConnect
    this.keyManager = oracle.keyManager
    this.oracleName = oracle.name

    console.log(`[${this.oracleName}] Connecting...`)
    this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`);

    this.ws.onopen = () => {
      console.log(`(1/10) Announcing to ${this.ws.url}`);
      this.sendWSMessage({ announce: true, from: this.keyManager.getPublicKey() });
    };

    this.ws.onmessage = (event): void => {
      const message = JSON.parse(event.data as unknown as string) as SignallingMessage;

      (async () => {
        if ("announce" in message) {
          if (this.peerConnections[message.from]) return;
          console.log(`(2/10) ${message.from} Received announce`);
          await this.handleAnnounce(message.from);
        } else if ("offer" in message) {
          if (typeof message.offer.sdp === "undefined" || message.to !== this.keyManager.getPublicKey()) return;
          console.log(`(4/10) ${message.from} Received offer`);
          await this.handleOffer(message.from, message.offer.sdp);
        } else if ("answer" in message) {
          if (!this.peerConnections[message.from]?.offered || message.to !== this.keyManager.getPublicKey()) return;
          console.log(`(7/10) ${message.from} Received answer`);
          await this.peerConnections[message.from]!.offered!.conn.setRemoteDescription(new RTCSessionDescription({ sdp: message.answer.sdp, type: 'answer' }));
        } else if ("iceCandidate" in message) {
          if (message.to !== this.keyManager.getPublicKey()) return;
          
          if (this.peerConnections[message.from]?.offered) {
            console.log(`(8/10) ${message.from} Received ICE candidate for offered connection`);
            await this.peerConnections[message.from]!.offered!.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate));
          } else if (this.peerConnections[message.from]?.answered) {
            console.log(`(8/10) ${message.from} Received ICE candidate for answered connection`);
            await this.peerConnections[message.from]!.answered!.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate));
          }
        } else console.error('Unexpected Message:', message)
      })().catch(console.error)
    };

    this.ws.on('error', (error) => console.error(`[${this.oracleName}] WebSocket error:`, error));
    this.ws.on('close', () => console.log(`[${this.oracleName}] WebSocket closed`));
  }

  private sendWSMessage(message: SignallingMessage): void {
    this.messageQueue.push(message);
    if (this.ws.readyState) this.ws.send(JSON.stringify(message));
    else {
      this.ws.addEventListener("open", () => {
        this.ws.send(JSON.stringify(message));
      });
    }
  }

  private createPeerConnection(from: `0x${string}`, role: 'offered' | 'answered'): PeerConnection {
    const conn = new RTCPeerConnection();
    const channel = conn.createDataChannel("chat", { negotiated: true, id: 0 });
    const iceCandidates: RTCIceCandidate[] = [];

    channel.onopen = () => {
      if (!this.connected) {
        this.connected = true;
        this.onConnect().catch(console.error);
      }
    };

    channel.onmessage = (e) => {
      console.log(`(10/10) Received WebRTC message`);
      const data = JSON.parse(e.data as string) as { message: Message, from: `0x${string}`, signature: `0x${string}` };
      if (data.message && data.signature) {
        const from = channel === this.peerConnections[data.from]?.offered?.channel ? data.from : Object.keys(this.peerConnections).find(addr => channel === this.peerConnections[addr as `0x${string}`]?.offered?.channel || channel === this.peerConnections[addr as `0x${string}`]?.answered?.channel) as Hex;
        
        const sendResponse = (responseMessage: Message) => {
          channel.send(JSON.stringify({ 
            message: responseMessage, 
            signature: this.keyManager.sign(JSON.stringify(responseMessage))
          }));
        };
        
        this.onMessage(data.message, from, sendResponse);
      }
    };

    conn.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate);
        console.log(`(6/10) ${from} Sending ICE candidate for ${role} connection`);
        this.sendWSMessage({ 
          iceCandidate: event.candidate, 
          to: from, 
          from: this.keyManager.getPublicKey() 
        });
      }
    };

    return { conn, channel, iceCandidates };
  }

  private async handleAnnounce(from: `0x${string}`): Promise<void> {
    const conn = this.createPeerConnection(from, 'offered');
    this.peerConnections[from] = { offered: conn };
    const offer = new RTCSessionDescription(await conn.conn.createOffer());
    await conn.conn.setLocalDescription(offer);
    console.log(`(3/10) ${from} Sending offer`);
    this.sendWSMessage({ offer, to: from, from: this.keyManager.getPublicKey() });
  }

  private async handleOffer(from: `0x${string}`, sdp: string): Promise<void> {
    const remoteDesc = new RTCSessionDescription({ type: 'offer', sdp });
    if (!this.peerConnections[from]) this.peerConnections[from] = {};
    this.peerConnections[from].answered = this.createPeerConnection(from, 'answered');
    if (!this.peerConnections[from].answered) throw new Error("Unreachable code reached");
    await this.peerConnections[from].answered.conn.setRemoteDescription(remoteDesc);
    const answer = new RTCSessionDescription(await this.peerConnections[from].answered.conn.createAnswer());
    await this.peerConnections[from].answered.conn.setLocalDescription(answer);
    console.log(`(5/10) ${from} Announcing answer`);
    this.sendWSMessage({ answer, to: from, from: this.keyManager.getPublicKey() });
  }

  public async sendMessage(message: Message): Promise<void> {
    const signature = await this.keyManager.sign(JSON.stringify(message));
    const addresses = Object.keys(this.peerConnections) as (keyof PeerConnections)[];
    for (let i = 0; i < addresses.length; i++) {
      const peer = addresses[i]!
      const peerConnection = this.peerConnections[peer]!;
      const channel = peerConnection.offered?.channel || peerConnection.answered?.channel;
      
      if (!channel) continue;
      
      if (channel.readyState === 'connecting') {
        channel.addEventListener('open', () => {
          channel.send(JSON.stringify({ message, signature }));
        });
      } else if (channel.readyState === 'open') {
        channel.send(JSON.stringify({ message, signature }));
      }
    }
  }
}

export default Signalling;