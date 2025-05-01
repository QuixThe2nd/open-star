import { OpenStar, type KeyManager } from "../.."

let state = 0
const methods = {
  add: (args: { value: number, time: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state += args.value
  },
  subtract: (args: { value: number, time: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state -= args.value
  }
}

const startupState = (peerStates: typeof state[]) => peerStates.toSorted((a,b) => peerStates.filter(v => v===a).length - peerStates.filter(v => v===b).length).pop()
const transactionToID = <T extends keyof typeof methods>(operator: T, args: Parameters<typeof methods[T]>[0]) => `${operator}-${args.value}-${args.time}`;
function reputationChange(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state }}) {
  Object.values(peers).forEach(({ reputation }) => {
    if (reputation === null) return
    // else if (reputation > 0) {} // Reward good peers
    // else if (reputation < 0) {} // Punish bad peers
  })
  // Reward/Punish yourself the same way others would to you
}

const start = (keyManager: KeyManager) => new OpenStar('DEMO', { startupState, reputationChange, state, methods, keyManager, transactionToID, epochTime: 60_000 })
export default start
