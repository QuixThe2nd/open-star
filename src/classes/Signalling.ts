import { WebSocket as NodeWebSocket } from 'ws';
import WRTC from '@roamhq/wrtc'
import type { KeyManager } from './KeyManager';
import { isHexAddress } from '../utils';
import type { RTCObjectType, PeerConnections, SignallingMessage, PeerConnection } from '../types/Signalling';

const WebSocket: typeof NodeWebSocket | typeof window.WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

const rtcObjects: RTCObjectType = typeof window === 'undefined' ? WRTC as RTCObjectType : { RTCPeerConnection: window.RTCPeerConnection, RTCSessionDescription: window.RTCSessionDescription, RTCIceCandidate: window.RTCIceCandidate };

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = rtcObjects;

function lineLogger(log: string) {
  const err = new Error(log);
  console.log(err)
}

export class Signalling<Message> {
  ws: NodeWebSocket | WebSocket;
  peerConnections: PeerConnections = {}
  messageQueue: SignallingMessage[] = [];
  connected = false
  private readonly onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
  private readonly onConnect: () => Promise<void>
  private readonly keyManager: KeyManager
  private readonly oracleName: string

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
    this.onMessage = oracle.onMessage
    this.onConnect = oracle.onConnect
    this.keyManager = oracle.keyManager
    this.oracleName = oracle.name

    console.log(`[${this.oracleName}] Connecting...`)
    this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`);

    this.ws.onopen = () => {
      console.log(`[${this.oracleName}] (1/10) Announcing to ${this.ws.url}`);
      this.sendWSMessage({ announce: true, from: this.keyManager.address });
    };

    this.ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== 'string') return lineLogger('Invalid WS Message')
      const message: unknown = JSON.parse(event.data);
      if (typeof message !== 'object' || message === null) return lineLogger('Invalid WS Message')
      if (!('from' in message) || !isHexAddress(message.from)) return lineLogger('Invalid WS Message')
      if ('to' in message && !isHexAddress(message.to)) return lineLogger('Invalid WS Message')

      if ('announce' in message) {
        if (message.from === this.keyManager.address) return lineLogger('Invalid WS Message');
        console.log(`[${this.oracleName}] (2/10) ${message.from} Received announce`);
        this.handleAnnounce(message.from).catch(console.error);
      } else if ('offer' in message) {
        if (!('to' in message)) return lineLogger('Invalid WS Message')
        if (typeof message.offer !== 'object' || message.offer === null || !('sdp' in message.offer) || message.to !== this.keyManager.address) return lineLogger('Invalid WS Message');
        console.log(`[${this.oracleName}] (4/10) ${message.from} Received offer`);
        if (typeof message.offer !== 'object') console.error('Invalid offer type')
        if (!('type' in message.offer) || message.offer.type !== 'offer') return console.error('Missing or invalid type on received offer')
        if (!('sdp' in message.offer) || typeof message.offer.sdp !== 'string') return console.error('Missing or invalid SDP')
        this.handleOffer(message.from, new RTCSessionDescription({ type: message.offer.type, sdp: message.offer.sdp })).catch(console.error);
      } else if ('answer' in message) {
        if (!('to' in message)) return lineLogger('Invalid WS Message')
        if (typeof message.answer !== 'object' || message.answer === null || !('sdp' in message.answer) || typeof message.answer.sdp !== 'string') return lineLogger('Invalid WS Message')
        const peerConn = this.peerConnections[message.from]
        if (peerConn?.offered === undefined || message.to !== this.keyManager.address) return lineLogger('Invalid WS Message');
        console.log(`[${this.oracleName}] (7/10) ${message.from} Received answer`);
        if (peerConn.offered.remoteDescriptionSet) return console.log(`Ignoring duplicate answer from ${message.from}`);
        peerConn.offered.conn.setRemoteDescription(new RTCSessionDescription({ sdp: message.answer.sdp, type: 'answer' })).catch(console.error);
        peerConn.offered.remoteDescriptionSet = true;
      } else if ('iceCandidate' in message) {
        if (!('to' in message) || typeof message.iceCandidate !== 'object' || message.iceCandidate === null) return lineLogger('Invalid WS Message')
        const peerConn = this.peerConnections[message.from]
        if (message.to !== this.keyManager.address || peerConn === undefined) return lineLogger('Invalid WS Message');
        if (peerConn.offered !== undefined) {
          console.log(`[${this.oracleName}] (8/10) ${message.from} Received ICE candidate for offered connection`);
          peerConn.offered.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate)).catch(console.error);
        } else if (peerConn.answered !== undefined) {
          console.log(`[${this.oracleName}] (9/10) ${message.from} Received ICE candidate for answered connection`);
          peerConn.answered.conn.addIceCandidate(new RTCIceCandidate(message.iceCandidate)).catch(console.error);
        }
      } else return console.error('Unexpected Message:', message)
    }
    
    this.ws.onerror = (error: Event) => console.error(`[${this.oracleName}] WebSocket error:`, error)
    this.ws.onclose = () => console.log(`[${this.oracleName}] WebSocket closed`);
  }

  private sendWSMessage(message: SignallingMessage): void {
    this.messageQueue.push(message);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    else this.ws.addEventListener("open", () => this.ws.send(JSON.stringify(message)));
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
      if (typeof e.data !== 'string') return console.error('WebRTC Message not a string')
      const data: unknown = JSON.parse(e.data)
      console.log(`[${this.oracleName}] (10/10) Received WebRTC message`, data);
      if (typeof data !== 'object' || data === null || !('message' in data)) return console.error('WebRTC Message invalid 1')
      if (!('signature' in data)) return console.error('WebRTC Message invalid 2')
      this.onMessage(data.message, from, (responseMessage: Message) => channel.send(JSON.stringify({ message: responseMessage, signature: this.keyManager.sign(JSON.stringify(responseMessage)) })));
    };

    channel.onerror = (error) => console.error('Data channel error:', error);
    // channel.onclose = () => console.log('Data channel closed');

    conn.onicecandidate = (event) => {
      if (event.candidate !== null) {
        iceCandidates.push(event.candidate);
        console.log(`[${this.oracleName}] (6/10) ${from} Sending ICE candidate for ${role} connection`);
        this.sendWSMessage({ 
          iceCandidate: event.candidate, 
          to: from, 
          from: this.keyManager.address 
        });
      }
    };

    conn.onicecandidateerror = (e) => console.error('Ice candidate error', e)

    conn.oniceconnectionstatechange = () => {
      console.log(`[${this.oracleName}] ICE connection state: ${conn.iceConnectionState}`);
      if (conn.iceConnectionState === 'failed') conn.restartIce();
    };
    conn.onnegotiationneeded = () => console.log(`Negotiation needed`);
    conn.onsignalingstatechange = () => console.log(`Signaling state changed: ${conn.signalingState}`);
    conn.onicegatheringstatechange = () => console.log(`ICE gathering state: ${conn.iceGatheringState}`);

    return { conn, channel, iceCandidates, remoteDescriptionSet: false };
  }

  private async handleAnnounce(from: `0x${string}`): Promise<void> {
  if (this.peerConnections[from]?.offered !== undefined) {
    const existingConn = this.peerConnections[from].offered;
    if (existingConn.conn.connectionState !== 'closed') existingConn.conn.close();
    if (existingConn.channel.readyState !== 'closed') existingConn.channel.close();
    delete this.peerConnections[from];
  }
    
    const conn = this.createPeerConnection(from, 'offered');
    this.peerConnections[from] = { offered: conn };
    const offer = new RTCSessionDescription(await conn.conn.createOffer());
    await conn.conn.setLocalDescription(offer);
    console.log(`[${this.oracleName}] (3/10) ${from} Sending offer`);
    this.sendWSMessage({ offer, to: from, from: this.keyManager.address });
  }

  private async handleOffer(from: `0x${string}`, sdp: RTCSessionDescription): Promise<void> {
    if (this.peerConnections[from]?.answered !== undefined) return; // Already handled this offer
    
    this.peerConnections[from] ??= {};
    this.peerConnections[from].answered = this.createPeerConnection(from, 'answered');
    
    await this.peerConnections[from].answered.conn.setRemoteDescription(new RTCSessionDescription({ sdp: sdp.sdp, type: 'offer' }));
    const answer = new RTCSessionDescription(await this.peerConnections[from].answered.conn.createAnswer());
    await this.peerConnections[from].answered.conn.setLocalDescription(answer);
    console.log(`[${this.oracleName}] (5/10) ${from} Announcing answer`);
    this.sendWSMessage({ answer, to: from, from: this.keyManager.address });
  }

  public async sendMessage(message: Message): Promise<void> {
    const signature = await this.keyManager.sign(JSON.stringify(message));
    this.peerConnections.forEach(peer => {
      const peerConnection = this.peerConnections[peer];
      if (peerConnection === undefined) return
      const channel = peerConnection.offered?.channel ?? peerConnection.answered?.channel;
      
      if (channel === undefined) return;
      
      if (channel.readyState === 'connecting') channel.addEventListener('open', () => channel.send(JSON.stringify({ message, signature })));
      else if (channel.readyState === 'open') channel.send(JSON.stringify({ message, signature }));
    })
  }
}

export default Signalling;