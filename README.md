# Open Star
Open Star is a ledger-free consensus mechanism inspired by oracles. It aims to achieve the same functionality of classic blockchains without the overhead. Open Star can be used as a decentralized database.

## How it works
Open Star is a framework that allows for consensus to be achieved around arbitrary information. By default, Open Star has 3 oracles, which are included in this repository, a `COIN`, `NAMESERVICE`, and `DEMO` oracle. You can find these oracles at `./src/classes/oracle/*.ts`. Each oracle has been written in a different style to demonstrate some ways you can create an oracle. `DEMO` is written functionally, `NAMESERVICE` is written as a class, and `COIN` is written in a single object.

Oracles can form consensus around any form of information, using any consensus rules. It is fully customizable, and can be as decentralized (or centralized) as you need.

## Running
To run the 3 Open Star examples, execute:
```sh
npx tsx src/client.ts
```

If the script stalls at `Announcing`, run a second node. This happens when no peers are online. Avoid starting up 2 nodes at the same time, there is a bug where they are unable to connect.

## Library
Open Star can be imported using `npm install QuixThe2nd/open-star` and used like `src/client.ts` to import and run oracles.

### Usage
To use an oracle, import it's start function:
```ts
import start from "open-star/classes/oracle/Demo"
```

Then run it:
```ts
start()
```

Open Star will then run your oracle.

## Creating an Oracle
To create an oracle, import `QuixThe2nd/open-star`, then define your state and it's schema:
```ts
import { type PeerStates } from 'open-star';

type State = { value: number }

const state: State = { value: 0 }
const peerStates: PeerStates<State> = {}
```

Then define the methods available to mutate the state:
```ts
import { type Methods } from 'open-star';

interface DemoMethods extends Methods {
  add: (_args: { value: number }) => void | string;
  subtract: (_args: { value: number }) => void | string;
}

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
```

Now write your startup function that sets the initial state on run:
```ts
const startupState = async (): Promise<State> => {
  let mostCommonState

  // Example bootstrap logic
  while (!mostCommonState) {
    await new Promise((res) => setTimeout(res, 100))
    const states = Object.values(peerStates).map(state => state.lastReceive)
    mostCommonState = states.toSorted((a,b) => states.filter(v => v===a).length - states.filter(v => v===b).length).pop()
  }

  return mostCommonState
}
```

Next you need to set the reputation handler:
```ts
const reputationChange = (reputation: { [key: `0x${string}`]: number }): void => {
  for (const _peer in reputation) {
    const peer = _peer as keyof PeerStates<State>
    const state = peerStates[peer]!
    if (state.reputation === null) continue
    else if (state.reputation > 0) {
      // Reward good peers
    }
    else if (state.reputation < 0) {
      // Punish bad peers
    }
  }
  // Reward/Punish yourself the same way others would to you
}
```

Now you need to define the function that processes calls received from peers as well as a mempool to prevent duplicates
```ts
private mempool: Parameters<DemoMethods['add' | 'subtract']>[0][] = []

call = async <T extends keyof DemoMethods>(method: T, args: Parameters<DemoMethods[T]>[0], signalling: Signalling<Message>): Promise<void> => {
  if (!this.mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
    this.mempool.push(args)
    signalling.sendMessage([ this.name, 'call', method, args ]).catch(console.error)
    await this.onCall(method, args)
  }
}
```

Define your mempool:
```ts
type Mempool = Parameters<DemoMethods['add' | 'subtract']>[0][]
const mempool: Mempool = []
```

Now set the epoch time (similar to block time):
```ts
const epochTime = 60_000
```

Next define and export your start function:
```ts
const start = (keyManager: KeyManager): OpenStar<'DEMO', State, DemoMethods, Mempool> => {
  const openStar = new OpenStar<'DEMO', State, DemoMethods, Mempool>('DEMO', { startupState, reputationChange, state, peerStates, call, mempool, methods, keyManager, epochTime })
  return openStar
}

export default start
```

And finally add a function that handles method calls inside your start function:
```ts
const call = async <T extends keyof DemoMethods>(method: T, args: Parameters<DemoMethods[T]>[0]): Promise<void> => {
  if (!mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
    mempool.push(args)
    openStar.sendMessage([ 'DEMO', 'call', method, args ]).catch(console.error)
    await methods[method]!(args)
  }
}

```

Open Star will handle the rest. Just call `start()` and you'll connect to other peers and partake in consensus. The full example is available at `./src/classes/oracle/Demo.ts`.

## Linting
```
npx eslint . --fix
npx tsc --project tsconfig.json
```
