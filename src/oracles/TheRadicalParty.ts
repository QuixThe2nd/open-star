import { StateManager } from "../classes/StateManager"
import type { ORC20Oracle } from "../oracle/ORC20"
import type { NonEmptyArray } from "../types/generic"
import type { Oracle } from "../types/Oracle"
import type { ORC20State } from "../types/ORC20"
import { mode, parseEther } from "../utils"

const state = new StateManager<ORC20State & { laws: string[] }>({ laws: [], balances: {} })
const methods = {
  submitLaw(args: { value: string, time: number }): string | void {
    if (args.value.length === 0) return 'Law is empty'
    if (args.value.length > 280) return 'Law must be under 280 characters'
    state.value.laws.push(args.value)
  }
}
const methodDescriptions: { [K in keyof typeof methods]: Parameters<typeof methods[keyof typeof methods]>[0] } = {
  submitLaw: { value: '', time: 0 }
}
const startupState = (peerStates: NonEmptyArray<typeof state.value>) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
const ORC20 = { ticker: "RAD", calculateAPR }

function calculateAPR(): number {
  const stakingRate = openStar.stakingRate()
  return 0.05 * (1 - stakingRate * 0.5) / stakingRate
}

function reputationChange(peer: `0x${string}`, reputation: number) {
  const blockYield = calculateAPR() / (365 * 24 * 60 * 60 * 1000) / 5_000
  const balance = state.value.balances[peer]
  if (reputation > 0) {
    console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
    openStar.mint({ to: peer, amount: (balance !== undefined ? BigInt(Math.floor(Number(balance)*blockYield)) : parseEther(1)).toHex().value });
  } else if (reputation < 0 && balance !== undefined) {
    console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
    openStar.burn({ to: peer, amount: ((BigInt(balance)*9n)/10n).toHex().value })
  }
}


let openStar: ORC20Oracle<typeof state.value, typeof methods>
const setOpenStar = (newOpenStar: ORC20Oracle<typeof state.value, typeof methods>) => {
  openStar = newOpenStar
}

const oracle: Oracle<typeof state.value, typeof methods> = { name: 'THERADICALPARTY', epochTime: 15_000, ORC20, startupState, reputationChange, state, methods, methodDescriptions, transactionToID, setOpenStar }
export default oracle
