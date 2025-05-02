import { parseEther } from 'viem';
import { KeyManager, OpenStar, type Oracle, type PeerStates, mode } from '../..';
import type { ORC20State } from '../../types';

const state: ORC20State & { laws: string[] } = { laws: [], balances: {} }
const methods = {
  mint(args: { to: `0x${string}`, amount: `0x${string}` }) {
    state.balances[args.to] = `0x${(BigInt(state.balances[args.to] ?? 0) + BigInt(args.amount)).toString(16)}`
  },
  burn(args: { to: `0x${string}`, amount: `0x${string}` }): string | void {
    if (!state.balances[args.to]) return 'Address does not exist'
    if (BigInt(state.balances[args.to]!) < BigInt(args.amount)) state.balances[args.to] = `0x0`
    else state.balances[args.to] = `0x${(BigInt(state.balances[args.to] ?? 0) - BigInt(args.amount)).toString(16)}`
  },
  submitLaw: (args: { value: string, time: number }): string | void => {
    if (args.value.length === 0) return 'Law is empty'
    if (args.value.length > 280) return 'Law must be under 280 characters'
    state.laws.push(args.value)
  }
}
const startupState = (peerStates: typeof state[]) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`

function calculateBlockYield(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state }}, epochTime: number): number {
  let supply = 0n, coinsStaked = 0n
  for (const peer of Object.keys(state)) supply += BigInt(state.balances[peer as keyof PeerStates<typeof state>] ?? `0x0`)
  for (const peer of Object.keys(peers)) coinsStaked += BigInt(state.balances[peer as keyof PeerStates<typeof state>] ?? `0x0`)
  const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
  const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
  return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
}

export default function start(keyManager: KeyManager) {
  function reputationChange(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state }}, epochTime: number) {
    const blockYield = calculateBlockYield(peers, epochTime)
    for (const [peer, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
      if (reputation > 0) {
        console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
        methods.mint({ to: peer, amount: `0x${(state.balances[peer] ? BigInt(Math.floor(Number(state.balances[peer])*blockYield)).toString(16) : parseEther('1')).toString(16)}` });
      } else if (reputation < 0 && state.balances[peer]) {
        console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
        methods.burn({ to: peer, amount: `0x${((BigInt(state.balances[peer])*9n)/10n).toString(16)}` })
      }
    }
    methods.mint({ to: keyManager.getPublicKey(), amount: `0x${(state.balances[keyManager.getPublicKey()] ? BigInt(Math.floor(Number(state.balances[keyManager.getPublicKey()])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
  }
  const oracle: Oracle<typeof state, typeof methods> = { epochTime: 15_000, ORCs: [ 20 ], startupState, reputationChange, state, methods, keyManager, transactionToID }
  return new OpenStar('THERADICALPARTY', oracle)
}
