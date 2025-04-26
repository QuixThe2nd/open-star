# Open Star
Open Star is a ledger-free consensus mechanism inspired by oracles. It aims to achieve the same functionality of classic blockchains without the overhead.

## How it works
Open Star is a framework that allows for consensus to be achieved around arbitrary information. By default, Open Star has 3 oracles, which are included in this repository, a `coin`, `nameService`, and `demo` oracle. You can find these oracles at `./src/classes/oracle/*.ts`. Oracles can form consensus around any form of information, using any consensus rules. It is fully customizable, and can be as decentralized (or centralized) as you need.

## Running
To run Open Star, execute:
```sh
npx tsx src/client.ts
```

If the script stalls at `Announcing`, run a second node. This happens when no peers are online.

## Creating an Oracle
To create an oracle, create a file at `./src/classes/oracle/Demo.ts`, then define the type your state follows:
```ts
type State = { value: number }
```

Then define the methods available to mutate the state:
```ts
import { type Methods } from '../..';

interface DemoMethods extends Methods {
  add: (_args: { value: number }) => true | string;
  subtract: (_args: { value: number }) => true | string;
}
```

Now create your Oracle class, implementing these values:

```ts
import { type Message, type Oracle } from '../..';

export class DemoOracle implements Oracle<Message, State, DemoMethods> {
  public readonly name = 'demo' // Note that the name must be unique and not used by other oracles
}
```

Import the PeerStates type:
```ts
import { type PeerStates } from '../..';
```

Inside your oracle class, define your state with a getter as well as a variable to keep track of other peers' states:
```ts
private state: State = { value: 0 }
public readonly peerStates: PeerStates<State> = {}

getState = (): State => this.state;
```

Now write your startup function. This will run when you first connect to the network and should be used to sync to the current state:
```ts
import type { Signalling } from '../Signalling';

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
```

Then implement the methods you defined earlier and define a function to call the methods:
```ts
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
```

Now you need to define the function that processes calls received from peers as well as a mempool to prevent duplicates
```ts
private mempool: Parameters<DemoMethods['add' | 'subtract']>[0][] = []

onCall = async <T extends keyof Methods & string>(method: T, args: Parameters<DemoMethods[T]>[0], signalling: Signalling<Message>): Promise<void> => {
  if (!this.mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
    this.mempool.push(args)
    signalling.sendMessage([ this.name, 'call', method, args ]).catch(console.error)
    await this.call(method, args)
  }
}
```

Finally define a function that runs on each epoch (every 5 seconds, similar to a blockchain's onBlock), this should handle yield/slashing:
```ts
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
```

Once you've made your oracle, import it in `index.ts` and add it to the oracles definition at the top. Like so:

```ts
import { DemoOracle } from "./classes/oracle/Demo";

const oraclesDefinition = {
  demo: new DemoOracle()
}
```

Open Star will handle the rest. Just start it up and your node will connect to other peers and partake in consensus. The full example is available at `./src/classes/oracle/Demo.ts`.

## Linting
```
npx eslint . --fix
npx tsc --project tsconfig.json
```