# Open Star
Open Star is a ledger-free consensus mechanism inspired by oracles. It aims to achieve the same functionality of classic blockchains without the overhead. Open Star can be used as a decentralized database.

## How it works
Open Star is a framework that allows for consensus to be achieved around any form of information using any consensus rules. It is fully customizable, and can be as decentralized (or centralized) as you need.

By default, Open Star has 3 oracles, which are included in this repository, a `COIN`, `NAMESERVICE`, and `DEMO` oracle. You can find these oracles at `./src/classes/oracle/*.ts`. Each oracle has been written in a different style to demonstrate some ways you can create an oracle. `DEMO` is written functionally, `NAMESERVICE` is written as a class, and `COIN` is written in a single object.

## Running
To run the 3 Open Star examples, execute:
```sh
npx tsx src/client.ts
```

If the script stalls at `Announcing`, run a second node. This happens when no peers are online.

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
Here we will create the Demo oracle. This oracle will give peers the ability to add or subtract to a number that is shared between all peers.

To create an Oracle, you need to first import `QuixThe2nd/open-star`.

### State
First, define your state and it's schema:
```ts
import { type PeerStates } from 'open-star';

const state = { value: 0 }
const peerStates: PeerStates<typeof state> = {}
```

### Methods
Then define the methods available to mutate the shared state (add and subtract):
```ts
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
```

### Startup State
Write a function that fetches the shared state and returns it on run:
```ts
const startupState = async (): Promise<typeof state> => {
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
This function is only called once each run, and is used by Open Star to define the current state.

### Reputation Manager
Next you need to set the reputation handler:
```ts
const reputationChange = (reputation: { [key: `0x${string}`]: number }): void => {
  for (const _peer in reputation) {
    const peer = _peer as keyof typeof peerStates
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
Open Star will call your reputation handler with a list of peers and their reputation. You can configure how to treat good/bad actors. Reputation is calculated as number of times the peer has sent you a valid or invalid state.

### Mempool
Define your mempool:
```ts
const mempool: Parameters<DemoMethods['add' | 'subtract']>[0][] = []
```
The mempool variable is used to keep track of pending state changes that occurred in the last epoch, and automatically cleared each epoch by Open Star.

### Epoch Time
Set the epoch time (similar to block time):
```ts
const epochTime = 60_000
```
### Call Handler
Add a function that handles method calls inside your start function:
```ts
const call = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]): void => {
  if (!mempool.some(tx => JSON.stringify(tx) === JSON.stringify(args))) { // This should be done via signatures or something similar
    mempool.push({ ...args, method })
    openStar.sendMessage([ 'DEMO', 'call', method, args ]).catch(console.error)
    methods[method](args)
  }
}
```

### Start Function
Finally define and export your start function:
```ts
let openStar: OpenStar<'DEMO', typeof state, typeof methods, typeof mempool>
const start = (keyManager: KeyManager): OpenStar<'DEMO', typeof state, typeof methods, typeof mempool> => {
  openStar = new OpenStar<'DEMO', typeof state, typeof methods, typeof mempool>('DEMO', { startupState, reputationChange, state, peerStates, call, mempool, methods, keyManager, epochTime })
  return openStar
}

export default start
```
This is the function you call to start your Oracle.


Open Star will handle the rest. Just call `start()` and you'll connect to other peers and partake in consensus. The full example is available at `./src/classes/oracle/Demo.ts`.

## Linting
```
npx eslint . --fix
npx tsc --project tsconfig.json
```
