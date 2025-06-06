# Open Star

Open Star is a ledger-free consensus mechanism inspired by oracles. It aims to achieve the same functionality of classic blockchains without the overhead. Open Star can be used as a decentralized database.

## How it works

Open Star is a framework that allows for consensus to be achieved around any form of information using any consensus rules. It is fully customizable, and can be as decentralized (or centralized) as you need.

Open Star has a few demo oracles included in this repo. You can find these oracles at `./src/oracles/*.ts`. Each oracle has been written in a different style to demonstrate some ways you can create an oracle.

## Running

To run the Open Star examples, first install dependencies using `npm install`, `bun install`, etc.

Then execute the code:

```sh
npx tsx src/client.ts
```

To build, use:

```sh
bun run build
```

If the script stalls at `Announcing`, run a second node. This happens when no peers are online.

## Library

Open Star can be imported using `npm install QuixThe2nd/open-star` and used like `src/client.ts` to import and run oracles.

### Usage

To use an oracle, import Open Star and the oracle:

```ts
import { start } from "open-star";
import oracle from "./oracles/oracle_Demo";
```

Then run it:

```ts
start(oracle);
```

Open Star will then run your oracle.

## Creating an Oracle

Here we will create the Demo oracle. This oracle will give peers the ability to add or subtract to a number that is shared between all peers.

To create an Oracle, you need to first import `QuixThe2nd/open-star`.

### State

Define your state. This variable is shared between all nodes. Open Star's primary job is to ensure that you and all other nodes keep in sync with this variable. It can be any data type including objects, as long as it can be serialized to JSON.

```ts
import { StateManager } from "open-star";
const state = new StateManager({ number: 0 });
```

Here, state is initialized with a value of `0`. This default value is passed into Open Star's state manager. The state manager is used to ensure the state is only ever passed by reference. You can optionally call `state.subscribe()` to add an event listener onChange. This can optionally be used to reactify the state.

### Methods

Now you need to define the methods available to mutate the shared state (add and subtract). This is the only part of your code that should update the `state`.

```ts
const methods = {
  add: (args: { value: number }): string | void => {
    if (args.value <= 0) return "Value must be positive";
    state.set({ number: Number(state.value.number) + Number(args.value) });
  },
  subtract: (args: { value: number }): string | void => {
    if (args.value <= 0) return "Value must be positive";
    state.set({ number: state.value.number - args.value });
  },
};
```

Never call your methods directly when implementing your oracle. You should call Open Star's call function, so all P2P and mempool tasks are handled. Behind the scenes, Open Star adds `time` to the arguments to handle critical features such a de-duplication. You can optionally reference this time in your method, but this is completely optionally.

You also need to define a description for your methods. This should be an object containing all methods, and example arguments.

```ts
const methodDescriptions = {
  add: { value: 0 },
  subtract: { value: 0 },
};
```

### Oracle Object

Now you need to declare your Oracle object. This is what will be passed to Open Star, specifying how your oracle should be executed.

```ts
import { mode, type Oracle } from "open-star";
const oracle: Oracle<typeof state.value, typeof methods> = {
  name: "DEMO",
  epochTime: 5_000,
  state,
  methods,
  methodDescriptions,
  startupState: (peerStates) => mode(peerStates),
};
export default oracle;
```

Your Open Star client will handle the rest. You can check `src/client.ts` to see how your oracle is passed to Open Star. The full example is available at `./src/oracles/Demo.ts`.

## Creating an ORC20 Coin

Open Star has a token standard (ORC20). When creating a coin, it is recommended you comply with the token standard.

### Balance Sheet

Similar to the demo oracle, ORC20s need a state manager. However for ORC20s, your state must comply with `ORC20State`, meaning your state must be an object containing a balances object.

```ts
import { StateManager, ORC20State } from "open-star";
const state = new StateManager<ORC20State>({ balances: {} });
```

### Yield

When rewarding good peers, we need a function to decide their yield. ORC20s are able to access Open Star's `stakingRate` function, which returns the percentage of coins that are being staked. We will use this to determine the staking yield, so the more coins that are staked, the lower the yield goes:

```ts
function calculateAPR(): number {
  const stakingRate = openStar.stakingRate();
  return (0.05 * (1 - stakingRate * 0.5)) / stakingRate;
}
```

For a rough idea on the yield that formula dictates:
|% Staked|APR %|Inflation %|
|---|---|---|
|100%|2.5%|2.5%|
|80%|3.75%|3%|
|50%|7.5%|3.75%|
|20%|22.5%|4.5%|
|10%|47.5%|4.75%|

### Reputation Change

Now lets actually reward and punish peers:

```ts
const reputationChange = (peer: `0x${string}`, reputation: number): void => {
  const epochYield = calculateAPR() / (365 * 24 * 60 * 60 * 1000) / 5_000;
  if (reputation > 0) {
    console.log("[COIN] Rewarding", peer.slice(0, 8) + "...");
    openStar.mint({
      to: peer,
      amount: (state.value.balances[peer] !== undefined
        ? BigInt(Math.floor(Number(state.value.balances[peer]) * epochYield))
        : parseEther(100)
      ).toHex().value,
    });
  } else if (reputation < 0 && state.value.balances[peer] !== undefined) {
    console.log("[COIN] Slashing", peer.slice(0, 8) + "...");
    openStar.burn({
      to: peer,
      amount: ((BigInt(state.value.balances[peer] ?? `0x0`) * 9n) / 10n).toHex()
        .value,
    });
  }
};
```

Open Star ORC20s have access to the native `mint` and `burn` functions. You can choose to either use them or create your own methods for issuance and burning.

### Open Star Setter

In `calculateEpochYield`, we called Open Star's `stakingRate` function. To access Open Star, we need to define a setter that Open Star calls on run.

```ts
let openStar: ORC20Oracle<ORC20State, Record<string, never>>;
const setOpenStar = (
  newOpenStar: ORC20Oracle<ORC20State, Record<string, never>>,
) => {
  openStar = newOpenStar;
};
```

### Export Oracle

Finally export your oracle

```ts
const oracle: Oracle<typeof state.value, Record<string, never>> = {
  name: "COIN",
  epochTime: 5_000,
  ORC20: { ticker: "STAR", calculateAPR },
  transactionToID: (method, args) => `${method}-${JSON.stringify(args)}`,
  startupState: (peerStates) => mode(peerStates),
  state,
  reputationChange,
  setOpenStar,
};
export default oracle;
```

ORC20s have a `openStar.transfer()` function that is called to handle balance transfer.

## For Decentralization Nerds

### Forks

Oracles can fork, just like blockchains and similar consensus mechanisms. This can happen for many reasons, some malicious (e.g. 51% attacks), some accidental (e.g. peers go out of sync), and some from community division.

When building your oracle, remember to implement logic to handle malicious and accidental forks. For community forks, it is advised that you change the oracle name to prevent conflict between the oracles (e.g. slashing if any).

### x Improvement Proposals (xIP) & DAOs

I recommend you implement an xIP standard. DAOs are useful to give freedom over many issues, but without an \*IP standard, the odds of an oracle-fork becomes astronomical.

### Consensus

Open Star handles majority of the primitives required to achieve consensus, core consensus rules must be decided and configured by you. This includes; how you handle startup sync, how you punish/rewards other stakes, and how you decide if you're out of sync with other nodes.
