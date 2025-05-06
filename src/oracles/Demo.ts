import { StateManager } from "../classes/StateManager"
import type { NonEmptyArray } from "../types/generic"
import type { Oracle } from "../types/Oracle"
import { mode } from "../utils"

const state = new StateManager(0)

const methods = {
  add: (args: { value: number, time: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state.value += args.value
  },
  subtract: (args: { value: number, time: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state.value -= args.value
  }
}

const methodDescriptions = {
  add: { value: 0, time: 0 },
  subtract: { value: 0, time: 0 },
}

const startupState = (peerStates: NonEmptyArray<typeof state.value>) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${args.value}-${args.time}`;
function reputationChange(_peers: Record<`0x${string}`, { reputation: number }>) {
  // Object.values(peers).forEach(({ reputation }) => {
  //   if (reputation > 0) {} // Reward good peers
  //   else if (reputation < 0) {} // Punish bad peers
  // })
  // Reward/Punish yourself the same way others would to you
}

const oracle: Oracle<'DEMO', typeof state.value, typeof methods> = { name: 'DEMO', startupState, reputationChange, state, methods, methodDescriptions, transactionToID, epochTime: 60_000 }
export default oracle
