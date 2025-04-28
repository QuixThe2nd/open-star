import { type PeerStates, KeyManager, OpenStar } from '../..';

const state = { value: 0 }
const peerStates: PeerStates<typeof state> = {}
const mempool: { value: number, method: 'add' | 'subtract' }[] = []
const epochTime = 60_000

const methods = {
  add: (args: { value: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state.value += args.value
  },
  subtract: (args: { value: number }): string | void => {
    if (args.value <= 0) return 'Value must be positive'
    state.value -= args.value
  }
}

const startupState = async (): Promise<typeof state> => {
  let mostCommonState
  while (!mostCommonState) {
    await new Promise((res) => setTimeout(res, 100))
    const states = Object.values(peerStates).map(state => state.lastReceive)
    mostCommonState = states.toSorted((a,b) => states.filter(v => v===a).length - states.filter(v => v===b).length).pop()
  }
  return mostCommonState
}

const reputationChange = (reputation: { [key: `0x${string}`]: number }): void => {
  for (const _peer in reputation) {
    const peer = _peer as keyof typeof peerStates
    const state = peerStates[peer]!
    if (state.reputation === null) continue
    // else if (state.reputation > 0) {} // Reward good peers
    // else if (state.reputation < 0) {} // Punish bad peers
  }
  // Reward/Punish yourself the same way others would to you
}

const call = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]): void => {
  if (!mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
    mempool.push({ ...args, method })
    openStar.sendMessage([ 'DEMO', 'call', method, args ]).catch(console.error)
    methods[method](args)
  }
}

let openStar: OpenStar<'DEMO', typeof state, typeof methods, typeof mempool>
const start = (keyManager: KeyManager): OpenStar<'DEMO', typeof state, typeof methods, typeof mempool> => {
  openStar = new OpenStar<'DEMO', typeof state, typeof methods, typeof mempool>('DEMO', { startupState, reputationChange, state, peerStates, call, mempool, methods, keyManager, epochTime })
  return openStar
}

export default start
