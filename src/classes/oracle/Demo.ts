import { OpenStar, State, type KeyManager } from "../.."

const state = new State(0)

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

const startupState = (peerStates: typeof state.value[]) => peerStates.toSorted((a,b) => peerStates.filter(v => v===a).length - peerStates.filter(v => v===b).length).pop()!
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${args.value}-${args.time}`;
function reputationChange(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state.value }}) {
  Object.values(peers).forEach(({ reputation }) => {
    if (reputation === null) return
    // else if (reputation > 0) {} // Reward good peers
    // else if (reputation < 0) {} // Punish bad peers
  })
  // Reward/Punish yourself the same way others would to you
}

const start = (keyManager: KeyManager) => new OpenStar('DEMO', { startupState, reputationChange, state, methods, methodDescriptions, keyManager, transactionToID, epochTime: 60_000 })
export default start
