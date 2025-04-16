import { parseEther, type Hex } from "viem";
import { mode, sortObjectByKeys, type Message, type Methods, type Oracle, type PeerStates } from "../..";
import type { Signalling } from "../Signalling";
import type { KeyManager } from "../KeyManager";

type State = { [pubKey: Hex]: { hostnames: `${string}.star`[], balance: bigint } }
type SerializedState = { [pubKey: Hex]: { hostnames: `${string}.star`[], balance: Hex } }
interface NameServiceMethods extends Methods {
  mint: (_args: { to: Hex, amount: bigint }) => true | string;
  burn: (_args: { to: Hex, amount: bigint }) => true | string;
  register: (_args: { from: Hex, hostname: `${string}.star`, signature: Hex }) => Promise<true | string>;
}

function serialize(state: State): SerializedState {
  const serializedObj: SerializedState = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key as keyof State] = {
      hostnames: value.hostnames,
      balance: `0x${value.balance.toString(16)}`
    }
  })
  return serializedObj
}

function deserialize(state: SerializedState): State {
  const serializedObj: State = {}
  Object.entries(state).forEach(([key, value]) => {
    serializedObj[key as keyof State] = {
      hostnames: value.hostnames,
      balance: BigInt(value.balance)
    }
  })
  return serializedObj
}

export class NameServiceOracle implements Oracle<Message, SerializedState, NameServiceMethods> {
  public readonly name = "nameService";
  private state: State = {}
  public readonly peerStates: PeerStates<SerializedState> = {};
  private readonly keyManager: KeyManager
  private mempool: Parameters<NameServiceMethods['register']>[0][] = []
  public readonly boilerplateState: SerializedState = {}

  constructor (keyManager: KeyManager) {
    this.keyManager = keyManager
  }

  private readonly methods: NameServiceMethods = {
    mint: (args: Parameters<NameServiceMethods['mint']>[0]): ReturnType<NameServiceMethods['mint']> => {
      const to = args.to
      const amount = args.amount

      this.state[to] ??= { hostnames: [], balance: 0n }
      this.state[to].balance += amount

      return true
    },
    burn: (args: Parameters<NameServiceMethods['burn']>[0]): ReturnType<NameServiceMethods['burn']> => {
      const to = args.to
      const amount = args.amount

      if (!this.state[to]) return 'Address does not exist'
      if (this.state[to].balance < amount) this.state[to].balance = 0n
      else this.state[to].balance -= amount

      return true
    },
    register: async (args: Parameters<NameServiceMethods['register']>[0]): ReturnType<NameServiceMethods['register']> => {
      const from = args.from
      const hostname = args.hostname
      const signature = args.signature

      if (!this.state[from]) return 'No balance'
      if (this.state[from].balance < parseEther('1')) return 'Balance too low'
      if (!await this.keyManager.verify(signature, JSON.stringify({ from, hostname }), from)) return 'Invalid signature'

      for (const pubKey in this.state) {
        const hostnames = this.state[pubKey as keyof State]?.hostnames
        if (hostnames?.includes(hostname)) return 'Hostname taken'
      }

      this.state[from].balance -= parseEther('0.1')
      this.state[from].hostnames.push(hostname)

      console.log(`[NAMESERVICE] Registered ${hostname} to ${from}`)

      return true
    }
  }

  blockYield(epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += state[peer as keyof PeerStates<SerializedState>]!.balance
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += state[peer as keyof PeerStates<SerializedState>]?.balance ?? 0n
    })

    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  public getState = (): SerializedState => {
    const obj: State = {}
    Object.entries(this.state).forEach(([key, value]) => {
      obj[key as keyof State] = value
    })
    return serialize(sortObjectByKeys(obj))
  };

  public onEpoch = (signalling: Signalling<Message>, epochTime: number): void => {
    const myState = this.state
    const blockYield = this.blockYield(epochTime)

    let netReputation = 0;
    for (const _peer in this.peerStates) {
      const peer = _peer as keyof PeerStates<SerializedState>
      const state = this.peerStates[peer]!
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      netReputation += state.reputation;
      if (state.reputation > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.call('mint', { to: peer, amount: myState[peer]?.balance ? BigInt(Math.floor(Number(myState[peer].balance)*blockYield)) : parseEther('1') })
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.call('burn', { to: peer, amount: (myState[peer].balance*9n)/10n })
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.call('mint', { to: signalling.address, amount: myState[signalling.address]?.balance ? BigInt(Math.floor(Number(myState[signalling.address]?.balance)*blockYield)) : parseEther('1') })
    
    this.mempool = []
    console.log('[NAMESERVICE]', this.getState())
  };
  call<T extends keyof NameServiceMethods>(method: T, args: Parameters<NameServiceMethods[T]>[0]): ReturnType<NameServiceMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  onCall<T extends keyof NameServiceMethods & string>(method: T, _args: Parameters<NameServiceMethods[T]>[0], signalling: Signalling<Message>): void {
    if (method === 'register') {
      const args = _args as Parameters<NameServiceMethods['register']>[0]
      if (!this.mempool.some(tx => tx.signature === args.signature)) {
        this.mempool.push(args)
        signalling.sendMessage([ 'nameService', 'call', method, args ]).catch(console.error)
        this.call('register', args).catch(console.error)
      }
    }
  }
  
  onConnect = async (signalling: Signalling<Message>): Promise<void> => {
    signalling.sendMessage([ this.name, 'state', this.getState() ]).catch(console.error)

    let mostCommonState = undefined
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
    }
    this.state = deserialize(mostCommonState)
    signalling.sendMessage([ this.name, 'state', mostCommonState ]).catch(console.error)
  }
}