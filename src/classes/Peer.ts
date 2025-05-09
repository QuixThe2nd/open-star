import type { RTCSessionDescription } from "@roamhq/wrtc";
import type { RTCObjectType, SignallingMessage } from "../types/Signalling";
import WRTC from '@roamhq/wrtc'
import type { KeyManager } from "./KeyManager";

const rtcObjects: RTCObjectType = typeof window === 'undefined' ? WRTC as RTCObjectType : { RTCPeerConnection: window.RTCPeerConnection };
const { RTCPeerConnection } = rtcObjects;

export class Peer<Message> {
  private readonly conn: RTCPeerConnection
  private readonly channel: RTCDataChannel
  private readonly selfAddress: `0x${string}`
  private readonly peerAddress: `0x${string}`
  private readonly sendWSMessage: (message: SignallingMessage) => void
  private readonly onMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void

  constructor(selfAddress: `0x${string}`, peerAddress: `0x${string}`, sendWSMessage: typeof this.sendWSMessage, keyManager: KeyManager, onMessage: typeof this.onMessage, onConnect: () => void) {
    this.sendWSMessage = sendWSMessage
    this.onMessage = onMessage
    this.selfAddress = selfAddress
    this.peerAddress = peerAddress
    this.conn = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    this.channel = this.conn.createDataChannel("chat", { negotiated: true, id: 0 });

    this.conn.onnegotiationneeded = async () => {
      const offer = await this.conn.createOffer();
      if (this.conn.signalingState !== "stable") return;
      await this.conn.setLocalDescription(offer);
      if (!this.conn.localDescription) return console.error('Failed to fetch local description')
      sendWSMessage({ description: this.conn.localDescription, to: peerAddress, from: selfAddress });
    }
    this.conn.onicecandidate = (event) => {
      if (event.candidate !== null) sendWSMessage({ iceCandidate: event.candidate, to: peerAddress, from: selfAddress });
    };
    this.channel.onmessage = (e) => {
      if (typeof e.data !== 'string') return console.error('WebRTC Message not a string')
      const data: unknown = JSON.parse(e.data)
      console.log(`Received WebRTC message`, data);
      if (typeof data !== 'object' || data === null || !('message' in data)) return console.error('WebRTC Message invalid 1')
      if (!('signature' in data)) return console.error('WebRTC Message invalid 2')
      this.onMessage(data.message as Message, peerAddress, (responseMessage: Message) => this.channel.send(JSON.stringify({ message: responseMessage, signature: keyManager.sign(JSON.stringify(responseMessage)) })));
    };
    this.conn.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${this.conn.iceConnectionState}`);
      if (this.conn.iceConnectionState === 'failed') this.conn.restartIce();
    };
    this.channel.onopen = () => onConnect()
    this.conn.onsignalingstatechange = () => console.log(`Signaling state changed: ${this.conn.signalingState}`);
    this.conn.onicegatheringstatechange = () => console.log(`ICE gathering state: ${this.conn.iceGatheringState}`);
    this.conn.onicecandidateerror = (e) => console.error('Ice candidate error', e)
    this.channel.onerror = (e) => console.error('Data channel error:', e);
    this.channel.onclose = () => console.log('Data channel closed');
    this.channel.onbufferedamountlow = () => console.log('Data channel bufferedamountlow')
    this.channel.onclosing = () => console.log('Data channel closing')
    this.conn.onconnectionstatechange = () => console.log('on connectionstatechange')
    this.conn.ondatachannel = () => console.log('on datachannel')
    this.conn.ontrack = () => console.log('on track')
  }

  setRemoteDescription = async (sdp: RTCSessionDescription): Promise<void> => {
    console.log(`Setting remote description, type: ${sdp.type}, current state: ${this.conn.signalingState}`);
    if (sdp.type === "offer" && this.conn.signalingState !== "stable") {
      if (this.peerAddress > this.selfAddress) return;
      await Promise.all([ this.conn.setLocalDescription({type: "rollback"}), this.conn.setRemoteDescription(sdp) ]);
    } else await this.conn.setRemoteDescription(sdp);
    
    if (sdp.type === "offer") {
      console.log("Creating answer...");
      await this.conn.setLocalDescription(await this.conn.createAnswer());
      const description = this.conn.localDescription;
      if (!description) return console.error('Failed to fetch local description');
      this.sendWSMessage({ description, from: this.selfAddress, to: this.peerAddress });
    }
  }
  
  addIceCandidate = async (iceCandidate: RTCIceCandidateInit): Promise<void> => this.conn.addIceCandidate(iceCandidate);
  send = (message: { message: Message, signature: `0x${string}` }) => this.channel.send(JSON.stringify(message))
}