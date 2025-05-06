import { StateManager } from "../classes/StateManager"
import type { ORC20Oracle } from "../oracle/ORC20"
import type { NonEmptyArray } from "../types/generic"
import type { Oracle } from "../types/Oracle"
import type { ORC20Methods, ORC20State } from "../types/ORC20"
import { mode, parseEther, sortObjectByKeys } from "../utils"

interface CoinMethods extends ORC20Methods {
  transfer: (args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }) => string | void
  mint: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
  burn: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
}

const state = new StateManager<ORC20State>({ balances: {} })

function calculateBlockYield(epochTime: number): number {
  const stakingRate = openStar.stakingRate()
  const stakingAPR = 0.05 * (1 - stakingRate * 0.5) / stakingRate

  const epochsPerYear = (365 * 24 * 60 * 60 * 1000) / epochTime
  const yieldPerEpoch = stakingAPR / epochsPerYear

  return yieldPerEpoch
}

const methods: CoinMethods = {
  transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }): string | void {
    const balance = state.value.balances[args.from]
    if (balance === undefined) return 'No balance'
    if (balance < args.amount) return 'Balance too low'
    state.value.balances[args.from] = (BigInt(balance) - BigInt(args.amount)).toHex()
    state.value.balances[args.to] = (BigInt(state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
    state.value = sortObjectByKeys(state.value)
    console.log(`[COIN] Transferred ${args.amount} from ${args.from} to ${args.to}`)
  },
  mint(args: { to: `0x${string}`, amount: `0x${string}` }) {
    console.log('MINTING')
    state.value.balances[args.to] = (BigInt(state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
    state.value = sortObjectByKeys(state.value)
  },
  burn(args: { to: `0x${string}`, amount: `0x${string}` }): string | void {
    const balance = state.value.balances[args.to]
    if (balance === undefined) return 'Address does not exist'
    if (balance < args.amount) state.value.balances[args.to] = `0x0`
    else state.value.balances[args.to] = (BigInt(balance) + BigInt(args.amount)).toHex()
  }
}
const methodDescriptions = {
  transfer: { from: `0x`, to: `0x`, amount: `0x`, time: 0, signature: `0x` },
  mint: { to: `0x`, amount: `0x` }, 
  burn: { to: `0x`, amount: `0x` }
}

const ORC20 = { ticker: 'STAR' }
const reputationChange = (peers: Record<`0x${string}`, { reputation: number }>, epochTime: number): Promise<void> | void => {
  const blockYield = calculateBlockYield(epochTime)
  peers.forEach((peer, { reputation }) => {
    if (reputation > 0) {
      console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
      methods.mint({ to: peer, amount: (state.value.balances[peer] !== undefined ? BigInt(Math.floor(Number(state.value.balances[peer])*blockYield)) : parseEther(100)).toHex() });
    } else if (reputation < 0 && state.value.balances[peer] !== undefined) {
      console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
      methods.burn({ to: peer, amount: ((BigInt(state.value.balances[peer])*9n)/10n).toHex() })
    }
  })
  console.log('[COIN] Rewarding self')
  methods.mint({ to: openStar.keyManager.address, amount: (state.value.balances[openStar.keyManager.address] !== undefined ? BigInt(Math.floor(Number(state.value.balances[openStar.keyManager.address])*blockYield)) : parseEther(100)).toHex() })
}
const transactionToID = <T extends keyof CoinMethods>(method: T, args: Parameters<CoinMethods[T]>[0]) => `${method}-${JSON.stringify(args)}`
const startupState = (peerStates: NonEmptyArray<ORC20State>) => mode(peerStates)

let openStar: ORC20Oracle<"COIN", ORC20State, CoinMethods>
const setOpenStar = (newOpenStar: ORC20Oracle<"COIN", ORC20State, CoinMethods>) => {
  openStar = newOpenStar
}

const oracle: Oracle<'COIN', typeof state.value, typeof methods> = {
  name: 'COIN',
  epochTime: 5_000,
  state,
  methods,
  methodDescriptions,
  ORC20,
  reputationChange,
  transactionToID,
  startupState,
  setOpenStar
}

export default oracle
