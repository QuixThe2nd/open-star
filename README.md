# Open Star
Open Star is a ledger-free consensus mechanism inspired by oracles. It aims to achieve the same functionality of classic blockchains without the overhead.

## How it works
Open Star is a framework that allows for consensus to be achieved around arbitrary information. By default, Open Star has 2 oracles, which are included in this repository, a `coin` oracle and a `nameService` oracle. You can find these oracles at `./src/classes/oracle/*.ts`. You can create your own oracle by copying either of these. Oracles can form consensus around any form of information, using any consensus rules. It is fully customizable, and can be as decentralized (or centralized) as you need.

Once you've made your oracle, import it in `index.ts` and add it to the oracles definition at the top. Like so:

```ts
import { NameServiceOracle } from "./classes/oracle/NameService";

const oraclesDefinition = {
  nameService: new NameServiceOracle(keyManager)
}
```

Open Star will handle the rest. Just start it up and your node will connect to other peers and partake in consensus.

## Running
To run Open Star, execute:
```sh
npx tsx src/index.ts
```

## Linting
```
npx eslint . --fix
npx tsc --project tsconfig.json
```