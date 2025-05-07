export type RTCObjectType = {
  RTCPeerConnection: typeof globalThis.RTCPeerConnection;
  RTCSessionDescription: typeof globalThis.RTCSessionDescription;
  RTCIceCandidate: typeof globalThis.RTCIceCandidate;
}

export type SignallingMessage = { announce: true; from: `0x${string}` } | { offer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { answer: RTCSessionDescription; from: `0x${string}`; to: `0x${string}` } | { iceCandidate: RTCIceCandidate; from: `0x${string}`; to: `0x${string}` };
export type PeerConnection = { conn: RTCPeerConnection; channel: RTCDataChannel; iceCandidates: RTCIceCandidate[]; remoteDescriptionSet: boolean }
export type PeerConnections = Record<`0x${string}`, { offered?: PeerConnection; answered?: PeerConnection }>;
