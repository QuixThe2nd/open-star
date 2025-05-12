import { WebSocket as NodeWebSocket } from 'ws'
import type { SignallingMessage } from '../types/Signalling'
import { isHexAddress } from '../utils'
import type { KeyManager } from './KeyManager'
import { Peer } from './Peer'

const WebSocket: typeof NodeWebSocket | typeof window.WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket

export class Signalling<Message> {
	ws: NodeWebSocket | WebSocket
	peers: Record<`0x${string}`, Peer<Message>> = {}
	messageQueue: SignallingMessage[] = []
	connected = false
	private readonly onWebRTCMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
	private readonly connectionHandler: () => Promise<void>
	private readonly keyManager: KeyManager
	private readonly oracleName: string
	private readonly stunServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

	constructor(oracle: {
		name: string
		onWebRTCMessage: (_data: Message, _from: `0x${string}`, _callback: (_message: Message) => void) => void
		onConnect: () => Promise<void>
		keyManager: KeyManager
	}) {
		this.onWebRTCMessage = oracle.onWebRTCMessage
		this.connectionHandler = oracle.onConnect
		this.keyManager = oracle.keyManager
		this.oracleName = oracle.name

		this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`)

		this.ws.onopen = () => {
			console.log(`[${this.oracleName}] Announcing to ${this.ws.url}`)

			//   (async () => {
			//     const res = await fetch("https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_ipv4s.txt")
			//     const hosts = await res.text()
			// hosts.trim().split("\n").slice(0, 10).map(url => this.stunServers.push({ urls: `stun:${url}` }))
			this.sendWSMessage({
				announce: true,
				from: this.keyManager.address
			})
			//   })().catch(console.error)
		}

		this.ws.onmessage = (event: MessageEvent): void => {
			if (typeof event.data !== 'string') return console.error('WS message is not a string')
			const message: unknown = JSON.parse(event.data)
			if (typeof message !== 'object' || message === null) return console.error('Failed to decode WS message')
			if (!('from' in message) || !isHexAddress(message.from)) return console.error('Invalid from address')
			// if (message.from === this.keyManager.address) return console.error('Message is from self')
			if ('to' in message && message.to !== this.keyManager.address) return console.error('Message is for someone else', message)

			if ('announce' in message)
				this.peers[message.from] = new Peer<Message>(
					this.oracleName,
					this.keyManager,
					message.from,
					(message: SignallingMessage) => this.sendWSMessage(message),
					(data: Message, from: `0x${string}`, callback: (message: Message) => void) => this.onWebRTCMessage(data, from, callback),
					() => this.onConnect(),
					this.stunServers
				)
			else if ('description' in message) {
				const peer = (this.peers[message.from] ??= new Peer<Message>(
					this.oracleName,
					this.keyManager,
					message.from,
					(message: SignallingMessage) => this.sendWSMessage(message),
					(data: Message, from: `0x${string}`, callback: (message: Message) => void) => this.onWebRTCMessage(data, from, callback),
					() => this.onConnect(),
					this.stunServers
				))
				peer.setRemoteDescription(message.description as RTCSessionDescription).catch(console.error)
			} else if ('iceCandidate' in message) {
				const peerConn = this.peers[message.from]
				if (peerConn === undefined) return console.error('Peer not found')
				peerConn.addIceCandidate(message.iceCandidate as RTCIceCandidateInit).catch(console.error)
			}
		}

		this.ws.onerror = (error: Event) => console.error(`[${this.oracleName}] WebSocket error:`, error)
		this.ws.onclose = () => console.log(`[${this.oracleName}] WebSocket closed`)
	}

	private sendWSMessage(message: SignallingMessage): void {
		this.messageQueue.push(message)
		if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
		else this.ws.addEventListener('open', () => this.ws.send(JSON.stringify(message)))
	}

	private onConnect() {
		if (!this.connected) {
			this.connected = true
			this.connectionHandler().catch(console.error)
		}
	}

	public sendMessage(message: Message) {
		const payload = { message, signature: this.keyManager.sign(JSON.stringify(message)) }
		console.log(`[${this.oracleName}] Sending message:`, message[1], message[2])
		this.peers.forEach((_, peer) => peer.send(payload))
	}
}

export default Signalling
