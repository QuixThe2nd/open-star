import { WebSocket as NodeWebSocket } from 'ws';
import WRTC from '@roamhq/wrtc'
import type { KeyManager } from './KeyManager';

const WebSocket: typeof NodeWebSocket | typeof window.WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

type RTCObjectType = {
  RTCPeerConnection: typeof globalThis.RTCPeerConnection;
  RTCSessionDescription: typeof globalThis.RTCSessionDescription;
  RTCIceCandidate: typeof globalThis.RTCIceCandidate;
};

const rtcObjects: RTCObjectType = typeof window === 'undefined' 
  ? WRTC as RTCObjectType 
  : { 
      RTCPeerConnection: window.RTCPeerConnection,
      RTCSessionDescription: window.RTCSessionDescription,
      RTCIceCandidate: window.RTCIceCandidate
    };

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = rtcObjects;

type SignallingMessage = { announce: true; from: `0x${string}` } | { offer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { answer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { iceCandidate: RTCIceCandidate; from: `0x${string}`; to: `0x${string}` };
type PeerConnection = { conn: RTCPeerConnection; channel: RTCDataChannel; iceCandidates: RTCIceCandidate[]; remoteDescriptionSet: boolean };
type PeerConnections = { [address: `0x${string}`]: { offered?: PeerConnection; answered?: PeerConnection } };

export class Signalling<Message> {
  ws: NodeWebSocket | WebSocket;
  peerConnections: PeerConnections = {}
  messageQueue: SignallingMessage[] = [];
  connected = false
  private readonly onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
  private readonly onConnect: () => Promise<void>
  private readonly keyManager: KeyManager
  private readonly oracleName: string
  private processedMessages = new Set<string>();

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
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

    this.ws.onmessage = (event: MessageEvent): void => {
      const message = JSON.parse(event.data as unknown as string) as SignallingMessage;
      const messageId = this.getMessageId(message);
      
      if (this.processedMessages.has(messageId)) {
        return;
      }
      
      this.processedMessages.add(messageId);

      (async () => {
        if ("announce" in message) {
          if (this.peerConnections[message.from] || message.from === this.keyManager.getPublicKey()) return;
          console.log(`(2/10) ${message.from} Received announce`);
          await this.handleAnnounce(message.from);
        } else if ("offer" in message) {
          if (typeof message.offer.sdp === "undefined" || message.to !== this.keyManager.getPublicKey()) return;
          console.log(`(4/10) ${message.from} Received offer`);
          await this.handleOffer(message.from, message.offer);
        } else if ("answer" in message) {
          if (!this.peerConnections[message.from]?.offered || message.to !== this.keyManager.getPublicKey()) return;
          console.log(`(7/10) ${message.from} Received answer`);
          
          const connection = this.peerConnections[message.from]!.offered!;
          if (connection.remoteDescriptionSet) {
            console.log(`Ignoring duplicate answer from ${message.from}`);
            return;
          }
          
          await connection.conn.setRemoteDescription(new RTCSessionDescription({ sdp: message.answer.sdp, type: 'answer' }));
          connection.remoteDescriptionSet = true;
        } else if ("iceCandidate" in message) {
          if (message.to !== this.keyManager.getPublicKey()) return;
          
          if (this.peerConnections[message.from]?.offered) {
            console.log(`(8/10) ${message.from} Received ICE candidate for offered connection`);
            await this.peerConnections[message.from]!.offered!.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate));
          } else if (this.peerConnections[message.from]?.answered) {
            console.log(`(9/10) ${message.from} Received ICE candidate for answered connection`);
            await this.peerConnections[message.from]!.answered!.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate));
          }
        } else console.error('Unexpected Message:', message)
      })().catch(console.error)
    }

    
    this.ws.onerror = (error) => console.error(`[${this.oracleName}] WebSocket error:`, error);
    this.ws.onclose = () => console.log(`[${this.oracleName}] WebSocket closed`);
  }

  private getMessageId(message: SignallingMessage): string {
    if ("announce" in message) {
      return `announce:${message.from}`;
    } else if ("offer" in message) {
      return `offer:${message.from}:${message.to}:${message.offer.sdp}`;
    } else if ("answer" in message) {
      return `answer:${message.from}:${message.to}:${message.answer.sdp}`;
    } else if ("iceCandidate" in message) {
      return `ice:${message.from}:${message.to}:${JSON.stringify(message.iceCandidate)}`;
    }
    return "";
  }

  private sendWSMessage(message: SignallingMessage): void {
    this.messageQueue.push(message);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
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
        const from = channel === this.peerConnections[data.from]?.offered?.channel ? data.from : Object.keys(this.peerConnections).find(addr => channel === this.peerConnections[addr as `0x${string}`]?.offered?.channel || channel === this.peerConnections[addr as `0x${string}`]?.answered?.channel) as `0x${string}`;
        
        const sendResponse = (responseMessage: Message) => {
          channel.send(JSON.stringify({ 
            message: responseMessage, 
            signature: this.keyManager.sign(JSON.stringify(responseMessage))
          }));
        };
        
        this.onMessage(data.message, from, sendResponse);
      }
    };

    channel.onerror = (error) => console.error('Data channel error:', error);
    channel.onclose = () => console.log('Data channel closed');

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

    conn.onicecandidateerror = (e) => console.error('Ice candidate error', e)

    conn.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${conn.iceConnectionState}`);
      if (conn.iceConnectionState === 'failed') conn.restartIce();
    };
    conn.onnegotiationneeded = () => console.log(`Negotiation needed`);
    conn.onsignalingstatechange = () => console.log(`Signaling state changed: ${conn.signalingState}`);
    conn.onicegatheringstatechange = () => console.log(`ICE gathering state: ${conn.iceGatheringState}`);

    return { conn, channel, iceCandidates, remoteDescriptionSet: false };
  }

  private async handleAnnounce(from: `0x${string}`): Promise<void> {
    if (this.peerConnections[from]?.offered) return; // Already handled this announce
    
    const conn = this.createPeerConnection(from, 'offered');
    this.peerConnections[from] = { offered: conn };
    const offer = new RTCSessionDescription(await conn.conn.createOffer());
    await conn.conn.setLocalDescription(offer);
    console.log(`(3/10) ${from} Sending offer`);
    this.sendWSMessage({ offer, to: from, from: this.keyManager.getPublicKey() });
  }

  private async handleOffer(from: `0x${string}`, sdp: RTCSessionDescription): Promise<void> {
    if (this.peerConnections[from]?.answered) return; // Already handled this offer
    
    if (!this.peerConnections[from]) this.peerConnections[from] = {};
    this.peerConnections[from].answered = this.createPeerConnection(from, 'answered');
    if (!this.peerConnections[from].answered) throw new Error("Unreachable code reached");
    
    await this.peerConnections[from].answered.conn.setRemoteDescription(new RTCSessionDescription({ sdp: sdp.sdp, type: 'offer' }));
    const answer = new RTCSessionDescription(await this.peerConnections[from].answered.conn.createAnswer());
    await this.peerConnections[from].answered.conn.setLocalDescription(answer);
    console.log(`(5/10) ${from} Announcing answer`);
    this.sendWSMessage({ answer, to: from, from: this.keyManager.getPublicKey() });
  }

  public async sendMessage(message: Message): Promise<void> {
    console.log('sending message', message)
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