import { StateManager } from "../classes/StateManager"
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

const oracle: Oracle<typeof state.value, typeof methods> = { name: 'DEMO', epochTime: 60_000, state, methods, methodDescriptions, startupState: (peerStates) => mode(peerStates) }
export default oracle
