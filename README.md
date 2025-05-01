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
First, define your state. This variable is shared between all nodes. Open Star's primary job is to ensure that you and all other nodes keep in sync with this variable. It can be any data type including objects, as long as it can be serialized to JSON.
```ts
let state = 0
```

### Methods
Then define the methods available to mutate the shared state (add and subtract). This is the only part of your code that should update `state`.
```ts
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
```
Never call your methods directly when implementing your oracle. You should call Open Star's call function, so all P2P are mempool tasks are handled. It is also recommended you include a `time` argument as Open star uses it as a critical feature to de-duplicate transactions.

### Startup State
Write a function that returns the current state. This is called when nodes first connect to the network.
```ts
const startupState = (peerStates: typeof state[]) => {
  return peerStates.toSorted((a,b) => peerStates.filter(v => v===a).length - peerStates.filter(v => v===b).length).pop()!
}
```

### Reputation Manager
Next you need to set the reputation handler:
```ts
function reputationChange(peers: { [key: `0x${string}`]: { reputation: number, state: typeof state }}) {
  Object.values(peers).forEach(({ reputation }) => {
    if (reputation === null) return
    else if (reputation > 0) {
      // Reward good peers
    } else if (reputation < 0) {
      // Punish bad peers
    }
  })
  // Reward/Punish yourself the same way others would to you
}
```
Open Star will call your reputation handler with a list of peers and their reputation. You can configure how to treat good/bad actors. Reputation is calculated as number of times the peer has sent you a valid or invalid state. This function is the only acceptable place to change state or to call methods.

### Transaction IDs
Transactions (`method` calls) need to be identified. Define a function the takes a method call and serializes it into a 
```ts
const transactionToID = <T extends keyof typeof methods>(operator: T, args: Parameters<typeof methods[T]>[0]) => `${operator}-${args.value}-${args.time}`;
```

### Start Function
Finally write a start function that calls runs Open Star and passes in your oracle.
```ts
import { OpenStar, type KeyManager } from "open-star"
const start = (keyManager: KeyManager) => new OpenStar('DEMO', { startupState, reputationChange, state, methods, keyManager, transactionToID, epochTime: 60_000 })
export default start
```
This is the function you call to start your Oracle.

Open Star will handle the rest. Just call `start()` and you'll connect to other peers and partake in consensus. The full example is available at `./src/classes/oracle/Demo.ts`.

## For Decentralization Nerds
### Forks
Oracles can fork, just like blockchains and similar consensus mechanisms. This can happen for many reasons, some malicious (e,g, 51% attacks), some accidental (e.g. peers go out of sync), and some from community division.

When building your oracle, remember to implement logic to handle malicious and accidental forks. For community forks, it is advised that you change the oracle name to prevent conflict between the oracles (e.g. slashing if any).
### x Improvement Proposals (xIP) & DAOs
I recommend you implement an xIP standard. DAOs are useful to give freedom over many issues, but without an *IP standard, the odds of an oracle-fork becomes astronomical.
### Consensus
Open Star handles majority of the primitives required to achieve consensus, core consensus rules must be decided and configured by you. This includes; how you handle startup sync, how you punish/rewards other stakes, and how you decide if you're out of sync with other nodes.

## Linting
```
npx eslint . --fix
npx tsc --project tsconfig.json
```
