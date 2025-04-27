import { type Methods, type PeerStates, KeyManager, OpenStar } from '../..';

type State = { value: number }
interface DemoMethods extends Methods {
  add: (_args: { value: number }) => void | string;
  subtract: (_args: { value: number }) => void | string;
}
type Mempool = Parameters<DemoMethods['add' | 'subtract']>[0][]

const state: State = { value: 0 }
const peerStates: PeerStates<State> = {}
const mempool: Mempool = []

const methods: DemoMethods = {
  add: (args: Parameters<DemoMethods['add']>[0]): ReturnType<DemoMethods['add']> => {
    if (args.value <= 0) return 'Value must be positive'
    state.value += args.value
  },
  subtract: (args: Parameters<DemoMethods['subtract']>[0]): ReturnType<DemoMethods['subtract']> => {
    if (args.value <= 0) return 'Value must be positive'
    state.value -= args.value
  }
}

const startupState = async (): Promise<State> => {
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
    const peer = _peer as keyof PeerStates<State>
    const state = peerStates[peer]!
    if (state.reputation === null) continue
    // else if (state.reputation > 0) {} // Reward good peers
    // else if (state.reputation < 0) {} // Punish bad peers
  }
  // Reward/Punish yourself the same way others would to you
}

const start = (keyManager: KeyManager): OpenStar<'DEMO', State, DemoMethods, Mempool> => {
  const call = async <T extends keyof DemoMethods>(method: T, args: Parameters<DemoMethods[T]>[0]): Promise<void> => {
    if (!mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
      mempool.push(args)
      openStar.sendMessage([ 'DEMO', 'call', method, args ]).catch(console.error)
      await methods[method]!(args)
    }
  }

  const openStar = new OpenStar<'DEMO', State, DemoMethods, Mempool>('DEMO', { startupState, reputationChange, state, peerStates, call, mempool, methods, keyManager })
  return openStar
}

export default start