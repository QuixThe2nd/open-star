import { type Methods, type Message, type Oracle, type PeerStates } from '../..';
import type { Signalling } from '../Signalling';

type State = { value: number }

interface DemoMethods extends Methods {
  add: (_args: { value: number }) => true | string;
  subtract: (_args: { value: number }) => true | string;
}

export class DemoOracle implements Oracle<Message, State, DemoMethods> {
  public readonly name = 'demo' // Note that the name must be unique and not used by other oracles
  private state: State = { value: 0 }
  public readonly peerStates: PeerStates<State> = {}
  private mempool: Parameters<DemoMethods['add' | 'subtract']>[0][] = []
  public readonly boilerplateState: State = { value: 0 }

  getState = (): State => this.state;

  onConnect = async (signalling: Signalling<Message>): Promise<void> => {
    signalling.sendMessage([ this.name, 'state', this.getState() ]).catch(console.error)

    // Example bootstrap logic
    let mostCommonState
    while (!mostCommonState) {
      await new Promise((res) => setTimeout(res, 100))
      const peerStates = Object.values(this.peerStates).map(state => state.lastReceive)
      mostCommonState = peerStates.toSorted((a,b) => peerStates.filter(v => v===a).length - peerStates.filter(v => v===b).length).pop()
    }

    this.state = mostCommonState
    signalling.sendMessage([ this.name, 'state', mostCommonState ]).catch(console.error)
  }

  onEpoch = (): void => {
    let netReputation = 0;
    for (const _peer in this.peerStates) {
      const peer = _peer as keyof PeerStates<State>
      const state = this.peerStates[peer]!
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      netReputation += state.reputation;
      if (state.reputation > 0) {
        // Reward good peers
      } else if (state.reputation < 0) {
        // Punish bad peers
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')

    // Remember to reward/punish yourself the same way others would to you

    this.mempool = []
  }

  private readonly methods: DemoMethods = {
    add: (args: Parameters<DemoMethods['add']>[0]): ReturnType<DemoMethods['add']> => {
      if (args.value <= 0) return 'Value must be positive'
      this.state.value += args.value
      return true
    },
    subtract: (args: Parameters<DemoMethods['subtract']>[0]): ReturnType<DemoMethods['subtract']> => {
      if (args.value <= 0) return 'Value must be positive'
      this.state.value -= args.value
      return true
    }
  }

  call<T extends keyof DemoMethods>(method: T, args: Parameters<DemoMethods[T]>[0]): ReturnType<DemoMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  onCall = async <T extends keyof Methods & string>(method: T, args: Parameters<DemoMethods[T]>[0], signalling: Signalling<Message>): Promise<void> => {
    if (!this.mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
      this.mempool.push(args)
      signalling.sendMessage([ this.name, 'call', method, args ]).catch(console.error)
      await this.call(method, args)
    }
  }
}