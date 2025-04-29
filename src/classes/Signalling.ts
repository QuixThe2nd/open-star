import WebSocket, { type RawData } from 'ws'
import Peer, { type Instance as PeerInstance, type SignalData } from 'simple-peer'
import WebRTC from '@roamhq/wrtc'
import type { Hex } from 'viem';
import type { KeyManager } from './KeyManager';

type AnnounceMessage = { type: 'announce', from: Hex }
type InitializeMessage = { type: 'initialize', to: Hex, from: Hex, data: SignalData }
type FinalizeMessage = { type: 'finalize', to: Hex, from: Hex, data: SignalData }
type SignallingMessage = AnnounceMessage | InitializeMessage | FinalizeMessage

export class Signalling<Message> {
  private readonly ws: WebSocket
  private readonly peers = new Map<string, PeerInstance>();
  private readonly pendingCandidates = new Map<string, SignalData[]>();
  private readonly onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void
  private readonly onConnect: () => Promise<void>
  private readonly keyManager: KeyManager
  private readonly oracleName: string
  private readonly connectionAttempts = new Map<string, number>();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  constructor(oracle: { name: string, onMessage: (_data: Message, _from: Hex, _callback: (_message: Message) => void) => void, onConnect: () => Promise<void>, keyManager: KeyManager }) {
    this.onMessage = oracle.onMessage
    this.onConnect = oracle.onConnect
    this.keyManager = oracle.keyManager
    this.oracleName = oracle.name

    console.log(`[${this.oracleName}] Connecting...`)

    console.log(`wss://rooms.deno.dev/openstar-${oracle.name}`)
    this.ws = new WebSocket(`wss://rooms.deno.dev/openstar-${oracle.name}`);
    this.ws.on('message', (data) => this.onWsMessage(data));
    this.ws.on('open', () => {
      console.log(`[${this.oracleName}] WebSocket connected`)
      this.announce();
    });
    this.ws.on('error', (error) => console.error(`[${this.oracleName}] WebSocket error:`, error));
    this.ws.on('close', () => console.log(`[${this.oracleName}] WebSocket closed`));
  }

  private readonly onWsMessage = (data: RawData): void => {
    const message = JSON.parse(data as unknown as string) as SignallingMessage;

    if (message.from === this.keyManager.getPublicKey()) return;
    else if (message.type === 'announce' && message.from !== this.keyManager.getPublicKey()) this.handleAnnounce(message);
    else if (message.type === 'initialize' && message.to === this.keyManager.getPublicKey()) this.handleInitialize(message);
    else if (message.type === 'finalize' && message.to === this.keyManager.getPublicKey()) this.handleFinalize(message);
  }

  private readonly send = (message: SignallingMessage): void => {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private readonly shouldInitiate = (peerAddress: Hex): boolean => {
    return this.keyManager.getPublicKey().toLowerCase() < peerAddress.toLowerCase();
  }

  private readonly createPeer = (peerAddress: Hex, initiator: boolean): PeerInstance => {
    this.cleanupPeer(peerAddress);
    const effectiveInitiator = initiator && this.shouldInitiate(peerAddress);
    
    console.log(`[${this.oracleName}] Creating peer connection with ${peerAddress}, initiator: ${effectiveInitiator}`);
    
    const peerOptions: Peer.Options = {
      initiator: effectiveInitiator,
      wrtc: WebRTC,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ],
        iceTransportPolicy: 'all'
      }
    };
    
    const peer: PeerInstance = new Peer(peerOptions);
    this.peers.set(peerAddress, peer);
    
    // Initialize connection attempts counter if needed
    if (!this.connectionAttempts.has(peerAddress)) this.connectionAttempts.set(peerAddress, 0);

    peer.on('connect', () => {
      console.log(`[${this.oracleName}] Connected to ${peerAddress}`);
      this.connectionAttempts.set(peerAddress, 0);
      this.onConnect().catch(console.error);
    });

    peer.on('error', (err) => {
      console.log(`[${this.oracleName}] Connection error with ${peerAddress}:`, err);
      this.handlePeerError(peerAddress);
    });

    peer.on('close', () => {
      console.log(`[${this.oracleName}] Connection closed with ${peerAddress}`);
      this.cleanupPeer(peerAddress);
    });

    peer.on('signal', (data: SignalData) => {
      console.log(`[${this.oracleName}] Signaling to ${peerAddress}, data type: ${data.type || 'candidate'}`);
      this.send({ type: effectiveInitiator ? 'initialize' : 'finalize', to: peerAddress, from: this.keyManager.getPublicKey(), data });
    });

    peer.on('data', (data: string): void => {
      const { signature, message } = JSON.parse(data) as { signature: Hex, message: Message };
      this.keyManager.verify(signature, JSON.stringify(message), peerAddress)
        .then(async (status) => {
          if (!status) return console.warn(`[${this.oracleName}] Signature verification failed for message from ${peerAddress}`);
          const signature = await this.keyManager.sign(JSON.stringify(message));
          this.onMessage(message, peerAddress, (response) => {
            if (peer.connected) peer.send(JSON.stringify({ message: response, signature }));
          });
        })
        .catch(console.error);
    });

    const pendingCandidates = this.pendingCandidates.get(peerAddress);
    if (pendingCandidates && pendingCandidates.length > 0) {
      console.log(`[${this.oracleName}] Applying ${pendingCandidates.length} pending candidates for ${peerAddress}`);
      pendingCandidates.forEach(candidate => peer.signal(candidate));
      this.pendingCandidates.delete(peerAddress);
    }

    return peer;
  }

  private readonly cleanupPeer = (peerAddress: Hex): void => {
    const existingPeer = this.peers.get(peerAddress);
    if (existingPeer) {
      existingPeer.removeAllListeners();
      existingPeer.destroy();
      this.peers.delete(peerAddress);
    }
  }

  private readonly handlePeerError = (peerAddress: Hex): void => {
    this.cleanupPeer(peerAddress);

    const attempts = (this.connectionAttempts.get(peerAddress) || 0) + 1;
    this.connectionAttempts.set(peerAddress, attempts);
    
    if (attempts <= this.MAX_RECONNECT_ATTEMPTS) {
      console.log(`[${this.oracleName}] Retrying connection to ${peerAddress}, attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
      setTimeout(() => this.announce(), 1000 * attempts); // Backoff with each attempt
    } else {
      console.log(`[${this.oracleName}] Max reconnection attempts reached for ${peerAddress}`);
      this.connectionAttempts.delete(peerAddress);
      this.pendingCandidates.delete(peerAddress);
    }
  }

  private readonly announce = (): void => {
    console.log(`[${this.oracleName}] 1. Announcing presence`);
    this.send({ type: 'announce', from: this.keyManager.getPublicKey() });
  }

  private readonly handleAnnounce = (message: AnnounceMessage): void => {
    const peerAddress = message.from;
    console.log(`[${this.oracleName}] 2. Received announce from ${peerAddress}`);
    
    if (!this.shouldInitiate(peerAddress)) return console.log(`[${this.oracleName}] 2b. We should NOT be the initiator for ${peerAddress}, waiting for initialize`)
    console.log(`[${this.oracleName}] 2a. We should be the initiator for ${peerAddress}, creating peer`);
    this.createPeer(peerAddress, true);
  }

  private readonly handleInitialize = (message: InitializeMessage): void => {
    const peerAddress = message.from;
    console.log(`[${this.oracleName}] 3. Received initialize (offer) from ${peerAddress}`);

    if (this.shouldInitiate(peerAddress)) console.log(`[${this.oracleName}] Warning: Received initialize but we should be the initiator for ${peerAddress}`);
    
    let peer = this.peers.get(peerAddress);
    if (!peer) {
      console.log(`[${this.oracleName}] 3a. Creating non-initiator peer for ${peerAddress}`);
      peer = this.createPeer(peerAddress, false);
    }

    console.log(`[${this.oracleName}] 3b. Applying offer from ${peerAddress}`);
    peer.signal(message.data);
  }

  private readonly handleFinalize = (message: FinalizeMessage): void => {
    const peerAddress = message.from;
    const dataType = message.data.type || 'candidate';
    console.log(`[${this.oracleName}] 4. Received finalize (${dataType}) from ${peerAddress}`);
    
    const peer = this.peers.get(peerAddress);
    if (peer) peer.signal(message.data);
    else {
      console.log(`[${this.oracleName}] 4a. Storing ${dataType} for future peer ${peerAddress}`);
      if (!this.pendingCandidates.has(peerAddress)) this.pendingCandidates.set(peerAddress, []);
      this.pendingCandidates.get(peerAddress)!.push(message.data);
    }
  }

  public readonly sendMessage = async (message: Message): Promise<number> => {
    const signature = await this.keyManager.sign(JSON.stringify(message));
    
    let sentCount = 0;
    this.peers.forEach((peer, address) => {
      if (!peer.connected) return console.warn(`[${this.oracleName}] Peer ${address} not connected, message not sent`);
      else {
        peer.send(JSON.stringify({ message, signature }));
        sentCount++;
      }
    });
    return sentCount;
  }
}