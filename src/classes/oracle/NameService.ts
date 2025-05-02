import { parseEther } from "viem";
import { mode, sortObjectByKeys, type PeerStates, OpenStar } from "../..";
import { KeyManager } from "../KeyManager";

type State = { [pubKey: `0x${string}`]: { hostnames: `${string}.star`[], balance: `0x${string}` } }


class NameServiceOracle {
  public state: State = {}
  public openStar: OpenStar<'NAMESERVICE', State, typeof this.methods>

  constructor (keyManager: KeyManager) {
    this.openStar = new OpenStar('NAMESERVICE', { ...this, keyManager, epochTime: 30_000 })
  }

  readonly methods = {
    mint: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      this.state[args.to] ??= { hostnames: [], balance: `0x0` }
      this.state[args.to]!.balance = `0x${(BigInt(this.state[args.to]!.balance) + BigInt(args.amount)).toString(16)}`
      this.state = sortObjectByKeys(this.state)
    },
    burn: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      if (!this.state[args.to]) return 'Address does not exist'
      if (this.state[args.to]!.balance < args.amount) this.state[args.to]!.balance = `0x0`
      else this.state[args.to]!.balance = `0x${(BigInt(this.state[args.to]!.balance) - BigInt(args.amount)).toString(16)}`
    },
    register: async (args: { from: `0x${string}`, hostname: `${string}.star`, signature: `0x${string}`, time: number }): Promise<void | string> => {
      if (!this.state[args.from]) return 'No balance'
      if (BigInt(this.state[args.from]!.balance) < parseEther('1')) return 'Balance too low'
      if (!await this.openStar.keyManager.verify(args.signature, JSON.stringify({ from: args.from, hostname: args.hostname }), args.from)) return 'Invalid signature'
      for (const pubKey in this.state) {
        if (this.state[pubKey as keyof State]?.hostnames.includes(args.hostname)) return 'Hostname taken'
      }
      this.state[args.from]!.balance = `0x${(BigInt(this.state[args.from]!.balance) - parseEther('0.1')).toString(16)}`
      this.state[args.from]!.hostnames.push(args.hostname)
      console.log(`[NAMESERVICE] Registered ${args.hostname} to ${args.from}`)
    }
  }

  blockYield(peers: { [key: `0x${string}`]: { reputation: number, state: State }}, epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += BigInt(state[peer as keyof PeerStates<State>]!.balance)
    })
    let coinsStaked = 0n
    Object.keys(peers).forEach(peer => {
      coinsStaked += BigInt(state[peer as keyof PeerStates<State>]?.balance ?? `0x0`)
    })
    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  public readonly reputationChange = (peers: { [key: `0x${string}`]: { reputation: number, state: State }}, epochTime: number): Promise<void> | void => {
    const blockYield = this.blockYield(peers, epochTime)
    for (const [peer, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
      if (reputation > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.methods.mint({ to: peer, amount: `0x${(this.state[peer]?.balance ? BigInt(Math.floor(Number(this.state[peer].balance)*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (reputation < 0 && this.state[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.methods.burn({ to: peer, amount: `0x${((BigInt(this.state[peer].balance)*9n)/10n).toString(16)}` })
      }
    }
    this.methods.mint({ to: this.openStar.keyManager.getPublicKey(), amount: `0x${(this.state[this.openStar.keyManager.getPublicKey()]?.balance ? BigInt(Math.floor(Number(this.state[this.openStar.keyManager.getPublicKey()]?.balance)*blockYield)) : parseEther('1')).toString(16)}` })
  }

  readonly transactionToID = <T extends keyof typeof this.methods>(method: T, args: Parameters<typeof this.methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
  readonly startupState = (peerStates: State[]) => mode(peerStates)
}

const start = (keyManager: KeyManager) => new NameServiceOracle(keyManager)
export default start
