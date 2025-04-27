import { parseEther, type Hex } from "viem";
import { mode, sortObjectByKeys, type PeerStates, type Methods, OpenStar } from "../..";
import { KeyManager } from "../KeyManager";

type State = { [pubKey: Hex]: { hostnames: `${string}.star`[], balance: `0x${string}` } }
type Mempool = Parameters<NameServiceMethods['register']>[0][]
interface NameServiceMethods extends Methods {
  mint: (_args: { to: Hex, amount: `0x${string}` }) => void | string;
  burn: (_args: { to: Hex, amount: `0x${string}` }) => void | string;
  register: (_args: { from: Hex, hostname: `${string}.star`, signature: Hex }) => Promise<void | string>;
}


class NameServiceOracle {
  public state: State = {}
  public readonly peerStates: PeerStates<State> = {};
  public mempool: Mempool = []
  public openStar: OpenStar<'NAMESERVICE', State, NameServiceMethods, Mempool>
  public readonly keyManager: KeyManager

  constructor (keyManager: KeyManager) {
    this.keyManager = keyManager
    this.openStar = new OpenStar<'NAMESERVICE', State, NameServiceMethods, Mempool>('NAMESERVICE', this)
  }

  readonly methods: NameServiceMethods = {
    mint: (args: Parameters<NameServiceMethods['mint']>[0]): ReturnType<NameServiceMethods['mint']> => {
      const to = args.to
      const amount = args.amount

      this.state[to] ??= { hostnames: [], balance: `0x0` }
      this.state[to].balance = `0x${(BigInt(this.state[to].balance) + BigInt(amount)).toString(16)}`

      this.state = sortObjectByKeys(this.state)
    },
    burn: (args: Parameters<NameServiceMethods['burn']>[0]): ReturnType<NameServiceMethods['burn']> => {
      const to = args.to
      const amount = args.amount

      if (!this.state[to]) return 'Address does not exist'
      if (this.state[to].balance < amount) this.state[to].balance = `0x0`
      else this.state[to].balance = `0x${(BigInt(this.state[to].balance) - BigInt(amount)).toString(16)}`
    },
    register: async (args: Parameters<NameServiceMethods['register']>[0]): ReturnType<NameServiceMethods['register']> => {
      const from = args.from
      const hostname = args.hostname
      const signature = args.signature

      if (!this.state[from]) return 'No balance'
      if (BigInt(this.state[from].balance) < parseEther('1')) return 'Balance too low'
      if (!await this.keyManager.verify(signature, JSON.stringify({ from, hostname }), from)) return 'Invalid signature'

      for (const pubKey in this.state) {
        const hostnames = this.state[pubKey as keyof State]?.hostnames
        if (hostnames?.includes(hostname)) return 'Hostname taken'
      }

      this.state[from].balance = `0x${(BigInt(this.state[from].balance) - parseEther('0.1')).toString(16)}`
      this.state[from].hostnames.push(hostname)

      console.log(`[NAMESERVICE] Registered ${hostname} to ${from}`)
    }
  }

  blockYield(epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += BigInt(state[peer as keyof PeerStates<State>]!.balance)
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += BigInt(state[peer as keyof PeerStates<State>]?.balance ?? `0x0`)
    })

    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  public getState = (): State => {
    const obj: State = {}
    Object.entries(this.state).forEach(([key, value]) => {
      obj[key as keyof State] = value
    })
    return sortObjectByKeys(obj)
  };

  public reputationChange = (reputation: { [key: `0x${string}`]: number; }, epochTime: number): void => {
    const myState = this.state
    const blockYield = this.blockYield(epochTime)

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
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.onCall('mint', { to: peer, amount: `0x${(myState[peer]?.balance ? BigInt(Math.floor(Number(myState[peer].balance)*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (state.reputation < 0 && myState[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.onCall('burn', { to: peer, amount: `0x${((BigInt(myState[peer].balance)*9n)/10n).toString(16)}` })
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.onCall('mint', { to: this.keyManager.getPublicKey(), amount: `0x${(myState[this.keyManager.getPublicKey()]?.balance ? BigInt(Math.floor(Number(myState[this.keyManager.getPublicKey()]?.balance)*blockYield)) : parseEther('1')).toString(16)}` })
    
    this.mempool = []
  };
  private onCall<T extends keyof NameServiceMethods>(method: T, args: Parameters<NameServiceMethods[T]>[0]): ReturnType<NameServiceMethods[T]> {
    // @ts-expect-error: The TS linter is stupid
    return this.methods[method](args);
  }

  call<T extends keyof NameServiceMethods>(method: T, _args: Parameters<NameServiceMethods[T]>[0]): void {
    if (method === 'register') {
      const args = _args as Parameters<NameServiceMethods['register']>[0]
      if (!this.mempool.some(tx => tx.signature === args.signature)) {
        this.mempool.push(args)
        this.openStar.sendMessage([ 'NAMESERVICE', 'call', method, args ]).catch(console.error)
        this.onCall('register', args).catch(console.error)
      }
    }
  }
  
  startupState = async (): Promise<State> => {
    let mostCommonState = undefined
    while (mostCommonState == undefined) {
      await new Promise((res) => setTimeout(res, 100))
      mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
    }
    return mostCommonState
  }
}

const start = (keyManager: KeyManager): NameServiceOracle => {
  return new NameServiceOracle(keyManager)
}

export default start