import type { RTCSessionDescription } from '@roamhq/wrtc'
import WRTC from '@roamhq/wrtc'
import type { RTCObjectType, SignallingMessage } from '../types/Signalling'
import { isHexAddress } from '../utils'
import type { KeyManager } from './KeyManager'

const rtcObjects: RTCObjectType = typeof window === 'undefined' ? (WRTC as RTCObjectType) : { RTCPeerConnection: window.RTCPeerConnection }
const { RTCPeerConnection } = rtcObjects

export class Peer<Message> {
	private readonly conn: RTCPeerConnection
	private channel: RTCDataChannel
	private readonly keyManager: KeyManager
	private readonly peerAddress: `0x${string}`
	private readonly sendWSMessage: (message: SignallingMessage) => void
	private readonly onWebRTCMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
	private readonly oracleName: string

	constructor(oracleName: string, keyManager: KeyManager, peerAddress: `0x${string}`, sendWSMessage: typeof this.sendWSMessage, onWebRTCMessage: typeof this.onWebRTCMessage, onConnect: () => void, iceServers: { urls: string }[]) {
		this.sendWSMessage = sendWSMessage
		this.onWebRTCMessage = onWebRTCMessage
		this.keyManager = keyManager
		this.peerAddress = peerAddress
		this.oracleName = oracleName

		this.conn = new RTCPeerConnection({ iceServers })
		this.channel = this.conn.createDataChannel('chat', {
			negotiated: true,
			id: 0
		})

		this.conn.onnegotiationneeded = async () => {
			const offer = await this.conn.createOffer()
			if (this.conn.signalingState !== 'stable') return
			await this.conn.setLocalDescription(offer)
			if (!this.conn.localDescription) return console.error('Failed to fetch local description')
			sendWSMessage({
				description: this.conn.localDescription,
				to: peerAddress,
				from: this.keyManager.address
			})
		}
		this.conn.onicecandidate = (event) => {
			if (event.candidate !== null)
				sendWSMessage({
					iceCandidate: event.candidate,
					to: peerAddress,
					from: this.keyManager.address
				})
		}
		this.channel.onmessage = (e) => {
			if (typeof e.data !== 'string') return console.error('WebRTC Message not a string')
			const data: unknown = JSON.parse(e.data)
			if (typeof data !== 'object' || data === null || !('message' in data)) return console.error('WebRTC Message invalid 1')
			if (!('signature' in data)) return console.error('WebRTC Message invalid 2')
			if (!isHexAddress(data.signature)) return console.error('Signature is not hex')
			if (!keyManager.verify(data.signature, JSON.stringify(data.message), peerAddress)) return console.error('Invalid message signature')
			this.onWebRTCMessage(data.message as Message, peerAddress, (responseMessage: Message) => this.send({ message: responseMessage, signature: keyManager.sign(JSON.stringify(responseMessage)) }))
		}
		this.conn.oniceconnectionstatechange = () => {
			console.log(`[${this.oracleName}] ICE connection state: ${this.conn.iceConnectionState}`)
			if (this.conn.iceConnectionState === 'failed') this.conn.restartIce()
		}
		this.channel.onopen = () => onConnect()
		this.conn.onsignalingstatechange = () => console.log(`[${this.oracleName}] Signaling state changed: ${this.conn.signalingState}`)
		this.conn.onicegatheringstatechange = () => console.log(`[${this.oracleName}] ICE gathering state: ${this.conn.iceGatheringState}`)
		this.conn.onicecandidateerror = (e) => console.error(`[${this.oracleName}] ICE candidate error`, e.errorText)
		this.channel.onerror = (e) => console.error(`[${this.oracleName}] Data channel error:`, e)
		this.channel.onclose = () => {
			console.log(`[${this.oracleName}] Data channel closed`)
			// setTimeout(() => this.reconnect(), 1000)
		}
		this.channel.onbufferedamountlow = () => console.log(`[${this.oracleName}] Data channel bufferedamountlow`)
		this.channel.onclosing = () => console.log(`[${this.oracleName}] Data channel closing`)
		this.conn.onconnectionstatechange = () => console.log(`[${this.oracleName}] Connect state changed: ${this.conn.connectionState}`)
		this.conn.ondatachannel = () => console.log(`[${this.oracleName}] on datachannel`)
		this.conn.ontrack = () => console.log(`[${this.oracleName}] on track`)
	}

	setRemoteDescription = async (sdp: RTCSessionDescription): Promise<void> => {
		console.log(`[${this.oracleName}] Setting remote description, type: ${sdp.type}, current state: ${this.conn.signalingState}`)
		if (sdp.type === 'offer' && this.conn.signalingState !== 'stable') {
			if (this.peerAddress > this.keyManager.address) return
			await Promise.all([this.conn.setLocalDescription({ type: 'rollback' }), this.conn.setRemoteDescription(sdp)])
		} else await this.conn.setRemoteDescription(sdp)

		if (sdp.type === 'offer') {
			console.log(`[${this.oracleName}] Creating answer...`)
			await this.conn.setLocalDescription(await this.conn.createAnswer())
			const description = this.conn.localDescription
			if (!description) return console.error('[${this.oracleName}] Failed to fetch local description')
			this.sendWSMessage({
				description,
				from: this.keyManager.address,
				to: this.peerAddress
			})
		}
	}

	// reconnect = (): void => {
	//   console.log('Attempting to reconnect...')

	//   if (this.conn.connectionState !== 'closed' && this.conn.connectionState !== 'failed') {
	//     this.channel = this.conn.createDataChannel("chat", { negotiated: true, id: 0 })

	//     this.channel.onmessage = (e) => {
	//       if (typeof e.data !== 'string') return console.error('WebRTC Message not a string')
	//       const data: unknown = JSON.parse(e.data)
	//       if (typeof data !== 'object' || data === null || !('message' in data)) return console.error('WebRTC Message invalid 1')
	//       if (!('signature' in data)) return console.error('WebRTC Message invalid 2')
	//       if (!isHexAddress(data.signature)) return console.error('Signature is not hex')
	//       if (!(this.keyManager.verify(data.signature, JSON.stringify(data.message), this.peerAddress))) return console.error('Invalid message signature')
	//       console.log(`[${this.oracleName}] Received message`, data[1])
	//       this.onWebRTCMessage(data.message as Message, this.peerAddress, (responseMessage: Message) => this.send({ message: responseMessage, signature: this.keyManager.sign(JSON.stringify(responseMessage)) }))
	//     }
	//     this.channel.onerror = (e) => console.error('Data channel error:', e)
	//     this.channel.onclose = () => {
	//       console.log('Data channel closed')
	//       setTimeout(() => this.reconnect(), 5000)
	//     }
	//     this.channel.onbufferedamountlow = () => console.log('Data channel bufferedamountlow')
	//     this.channel.onclosing = () => console.log('Data channel closing')

	//     this.conn.restartIce()
	//   }
	// }

	addIceCandidate = async (iceCandidate: RTCIceCandidateInit): Promise<void> => this.conn.addIceCandidate(iceCandidate)
	send = (message: { message: Message; signature: `0x${string}` }) => {
		if (this.channel.readyState === 'open') this.channel.send(JSON.stringify(message))
		else console.warn(`[${this.oracleName}] Cannot send message, data channel not open (state: ${this.channel.readyState})`)
	}
}
