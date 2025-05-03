import { parseEther } from 'viem';
import { KeyManager, OpenStar, type PeerStates, State, mode } from '../..';
import type { ORC20State } from '../../types';

const state = new State<ORC20State & { laws: string[] }>({ laws: [], balances: {} })
const methods = {
  mint(args: { to: `0x${string}`, amount: `0x${string}` }) {
    state.value.balances[args.to] = `0x${(BigInt(state.value.balances[args.to] ?? 0) + BigInt(args.amount)).toString(16)}`
  },
  burn(args: { to: `0x${string}`, amount: `0x${string}` }): string | void {
    if (!state.value.balances[args.to]) return 'Address does not exist'
    if (BigInt(state.value.balances[args.to]!) < BigInt(args.amount)) state.value.balances[args.to] = `0x0`
    else state.value.balances[args.to] = `0x${(BigInt(state.value.balances[args.to] ?? 0) - BigInt(args.amount)).toString(16)}`
  },
  submitLaw(args: { value: string, time: number }): string | void {
    if (args.value.length === 0) return 'Law is empty'
    if (args.value.length > 280) return 'Law must be under 280 characters'
    state.value.laws.push(args.value)
  }
}
const methodDescriptions: { [K in keyof typeof methods]: Parameters<typeof methods[keyof typeof methods]>[0] } = {
  mint: { to: `0x`, amount: `0x` },
  burn: { to: `0x`, amount: `0x` },
  submitLaw: { value: '', time: 0 }
}
const startupState = (peerStates: typeof state.value[]) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
const ORC20 = { ticker: "RAD" }

function calculateBlockYield(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state.value }}, epochTime: number): number {
  let supply = 0n, coinsStaked = 0n
  for (const peer of Object.keys(state.value)) supply += BigInt(state.value.balances[peer as keyof PeerStates<typeof state.value>] ?? `0x0`)
  for (const peer of Object.keys(peers)) coinsStaked += BigInt(state.value.balances[peer as keyof PeerStates<typeof state.value>] ?? `0x0`)
  const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
  const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
  return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
}

export default function start(keyManager: KeyManager) {
  function reputationChange(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state.value }}, epochTime: number) {
    const blockYield = calculateBlockYield(peers, epochTime)
    for (const [peer, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
      if (reputation > 0) {
        console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
        methods.mint({ to: peer, amount: `0x${(state.value.balances[peer] ? BigInt(Math.floor(Number(state.value.balances[peer])*blockYield)).toString(16) : parseEther('1')).toString(16)}` });
      } else if (reputation < 0 && state.value.balances[peer]) {
        console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
        methods.burn({ to: peer, amount: `0x${((BigInt(state.value.balances[peer])*9n)/10n).toString(16)}` })
      }
    }
    methods.mint({ to: keyManager.getPublicKey(), amount: `0x${(state.value.balances[keyManager.getPublicKey()] ? BigInt(Math.floor(Number(state.value.balances[keyManager.getPublicKey()])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
  }
  return new OpenStar('THERADICALPARTY', { epochTime: 15_000, ORC20, startupState, reputationChange, state, methods, methodDescriptions, keyManager, transactionToID })
}
