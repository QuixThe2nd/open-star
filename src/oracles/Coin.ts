import { StateManager } from "../classes/StateManager"
import type { ORC20Oracle } from "../oracle/ORC20"
import type { Oracle } from "../types/Oracle"
import type { ORC20Methods, ORC20State } from "../types/ORC20"
import { mode, parseEther } from "../utils"

const state = new StateManager<ORC20State>({ balances: {} })

interface CoinMethods extends ORC20Methods {
  transfer: (args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }) => string | void
}

const methodDescriptions = {
  transfer: { from: `0x`, to: `0x`, amount: `0x`, time: 0, signature: `0x` },
}

const methods: CoinMethods = {
  transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }): string | void {
    const balance = state.value.balances[args.from]
    if (balance === undefined) return 'No balance'
    if (balance < args.amount) return 'Balance too low'
    state.value.balances[args.from] = (BigInt(balance) - BigInt(args.amount)).toHex()
    state.value.balances[args.to] = (BigInt(state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
  }
}

function calculateEpochYield(epochTime: number): number {
  const stakingRate = openStar.stakingRate()
  const stakingAPR = 0.05 * (1 - stakingRate * 0.5) / stakingRate
  const epochsPerYear = (365 * 24 * 60 * 60 * 1000) / epochTime
  return stakingAPR / epochsPerYear
}

const reputationChange = (peer: `0x${string}`, reputation: number): void => {
  const blockYield = calculateEpochYield(5_000)
  if (reputation > 0) {
    console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
    openStar.mint({ to: peer, amount: (state.value.balances[peer] !== undefined ? BigInt(Math.floor(Number(state.value.balances[peer])*blockYield)) : parseEther(100)).toHex() });
  } else if (reputation < 0 && state.value.balances[peer] !== undefined) {
    console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
    openStar.burn({ to: peer, amount: ((BigInt(state.value.balances[peer])*9n)/10n).toHex() })
  }
}

let openStar: ORC20Oracle<ORC20State, typeof methods>
const setOpenStar = (newOpenStar: ORC20Oracle<ORC20State, typeof methods>) => {
  openStar = newOpenStar
}

const oracle: Oracle<typeof state.value, typeof methods> = {
  name: 'COIN',
  epochTime: 5_000,
  ORC20: { ticker: 'STAR' },
  transactionToID: (method, args) => `${method}-${JSON.stringify(args)}`,
  startupState: (peerStates) => mode(peerStates),
  state,
  methods,
  methodDescriptions,
  reputationChange,
  setOpenStar
}
export default oracle
