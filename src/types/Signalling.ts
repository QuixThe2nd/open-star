export type RTCObjectType = {
	RTCPeerConnection: typeof globalThis.RTCPeerConnection
}

export type SignallingMessage =
	| { announce: true; from: `0x${string}` }
	| {
			description: RTCSessionDescription
			from: `0x${string}`
			to: `0x${string}`
	  }
	| { iceCandidate: RTCIceCandidate; from: `0x${string}`; to: `0x${string}` }
