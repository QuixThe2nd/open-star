import { parseEther } from '/Users/parsa/GitHub/viem/src';
import { KeyManager, mode, OpenStar, sortObjectByKeys, type PeerStates } from '../..';

type State = { [pubKey: string]: `0x${string}` }

function calculateBlockYield(epochTime: number, state: State, peers: { [key: `0x${string}`]: { reputation: number }}): number {
  let supply = 0n
  Object.keys(state).forEach(peer => {
    supply += BigInt(state[peer as keyof PeerStates<State>]!)
  })
  let coinsStaked = 0n
  Object.keys(peers).forEach(peer => {
    coinsStaked += BigInt(state[peer as keyof PeerStates<State>] ?? '0x0')
  })
  const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
  const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
  return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
}

const start = (keyManager: KeyManager) => {
  const methods = {
    mint(args: { to: `0x${string}`, amount: `0x${string}` }) {
      openStar.oracle.state[args.to] ??= `0x0`
      openStar.oracle.state[args.to] = `0x${(BigInt(openStar.oracle.state[args.to]!) + BigInt(args.amount)).toString(16)}`
      openStar.oracle.state = sortObjectByKeys(openStar.oracle.state)
    },
    burn(args: { to: `0x${string}`, amount: `0x${string}` }): string | void {
      if (!openStar.oracle.state[args.to]) return 'Address does not exist'
      if (openStar.oracle.state[args.to]! < args.amount) openStar.oracle.state[args.to] = `0x0`
      else openStar.oracle.state[args.to] = `0x${(BigInt(openStar.oracle.state[args.to]!) + BigInt(args.amount)).toString(16)}`
    },
    async transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, time: number, signature: `0x${string}` }): Promise<string | void> {
      if (!openStar.oracle.state[args.from]) return 'No balance'
      if (openStar.oracle.state[args.from]! < args.amount) return 'Balance too low'
      if (args.time + 5_000 < +new Date()) return 'Transaction from past epoch'
      if (!await keyManager.verify(args.signature, JSON.stringify({ from: args.from, to: args.to, amount: args.amount, time: args.time }), args.from)) return 'Invalid signature'
      openStar.oracle.state[args.from] = `0x${(BigInt(openStar.oracle.state[args.from]!) - BigInt(args.amount)).toString(16)}`
      openStar.oracle.state[args.to] ??= `0x0`
      openStar.oracle.state[args.to] += args.amount
      openStar.oracle.state = sortObjectByKeys(openStar.oracle.state)
      console.log(`[COIN] Transferred ${args.amount} from ${args.from} to ${args.to}`)
    }
  }

  const openStar = new OpenStar('COIN', {
    keyManager,
    epochTime: 5_000,
    state: {},
    methods,
    reputationChange: (peers: { [key: `0x${string}`]: { reputation: number, state: State }}, epochTime: number): Promise<void> | void => {
      const blockYield = calculateBlockYield(epochTime, openStar.oracle.state, peers)
      for (const [peer, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
        if (reputation > 0) {
          console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
          openStar.oracle.methods.mint({ to: peer, amount: `0x${(openStar.oracle.state[peer] ? BigInt(Math.floor(Number(openStar.oracle.state[peer])*blockYield)).toString(16) : parseEther('1')).toString(16)}` });
        } else if (reputation < 0 && openStar.oracle.state[peer]) {
          console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
          openStar.oracle.methods.burn({ to: peer, amount: `0x${((BigInt(openStar.oracle.state[peer])*9n)/10n).toString(16)}` })
        }
      }
      openStar.oracle.methods.mint({ to: keyManager.getPublicKey(), amount: `0x${(openStar.oracle.state[keyManager.getPublicKey()] ? BigInt(Math.floor(Number(openStar.oracle.state[keyManager.getPublicKey()])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
    },
    transactionToID: <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`,
    startupState: (peerStates: State[]) => mode(peerStates),
  })
  return openStar
}
export default start
