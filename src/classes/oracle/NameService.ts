import { parseEther } from "viem";
import { mode, sortObjectByKeys, type PeerStates, OpenStar, KeyManager, State } from "../..";
import type { ORC20State } from "../../types";

type StateType = ORC20State & { hostnames: { [hostname: `${string}.star`]: `0x${string}` } }

class NameServiceOracle {
  public state = new State<StateType>({ balances: {}, hostnames: {} })
  public openStar: OpenStar<'NAMESERVICE', StateType, typeof this.methods>
  public readonly ORC20 = {
    ticker: 'NS'
  }

  constructor (keyManager: KeyManager) {
    this.openStar = new OpenStar('NAMESERVICE', { ...this, keyManager, epochTime: 30_000 })
  }

  readonly methods = {
    register: async (args: { from: `0x${string}`, hostname: `${string}.star`, signature: `0x${string}` }): Promise<void | string> => {
      if (!this.state.value.balances[args.from]) return 'No balance'
      if (this.state.value.hostnames[args.hostname]) return 'Hostname unavailable'
      if (BigInt(this.state.value.balances[args.from]!) < parseEther('1')) return 'Balance too low'
      if (!await this.openStar.keyManager.verify(args.signature, JSON.stringify({ from: args.from, hostname: args.hostname }), args.from)) return 'Invalid signature'
      this.state.value.balances[args.from] = `0x${(BigInt(this.state.value.balances[args.from]!) - parseEther('0.1')).toString(16)}`

      this.state.value.hostnames[args.hostname] = args.from
      console.log(`[NAMESERVICE] Registered ${args.hostname} to ${args.from}`)
    },
    mint: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      this.state.value.balances[args.to] ??= `0x0`
      this.state.value.balances[args.to] = `0x${(BigInt(this.state.value.balances[args.to]!) + BigInt(args.amount)).toString(16)}`
      this.state.value = sortObjectByKeys(this.state.value)
    },
    burn: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      if (!this.state.value.balances[args.to]) return 'Address does not exist'
      if (this.state.value.balances[args.to]! < args.amount) this.state.value.balances[args.to] = `0x0`
      else this.state.value.balances[args.to] = `0x${(BigInt(this.state.value.balances[args.to]!) - BigInt(args.amount)).toString(16)}`
    },
  }

  readonly methodDescriptions: { [K in keyof typeof this.methods]: Parameters<typeof this.methods[keyof typeof this.methods]>[0] } = {
    register: { from: `0x`, hostname: `.star`, signature: `0x` },
    mint: { to: `0x`, amount: `0x` },
    burn: { to: `0x`, amount: `0x` }
  }

  blockYield(peers: { [key: `0x${string}`]: { reputation: number, state: StateType }}, epochTime: number): number {
    const balances = this.state.value.balances
    let supply = 0n
    Object.keys(balances).forEach(peer => {
      supply += BigInt(balances[peer as keyof PeerStates<StateType>]!)
    })
    let coinsStaked = 0n
    Object.keys(peers).forEach(peer => {
      coinsStaked += BigInt(balances[peer as keyof PeerStates<StateType>] ?? `0x0`)
    })
    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  public readonly reputationChange = (peers: { [key: `0x${string}`]: { reputation: number, state: StateType }}, epochTime: number): Promise<void> | void => {
    const blockYield = this.blockYield(peers, epochTime)
    for (const [peer, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
      if (reputation > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.methods.mint({ to: peer, amount: `0x${(this.state.value.balances[peer] ? BigInt(Math.floor(Number(this.state.value.balances[peer])*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (reputation < 0 && this.state.value.balances[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.methods.burn({ to: peer, amount: `0x${((BigInt(this.state.value.balances[peer])*9n)/10n).toString(16)}` })
      }
    }
    this.methods.mint({ to: this.openStar.keyManager.getPublicKey(), amount: `0x${(this.state.value.balances[this.openStar.keyManager.getPublicKey()] ? BigInt(Math.floor(Number(this.state.value.balances[this.openStar.keyManager.getPublicKey()]!)*blockYield)) : parseEther('1')).toString(16)}` })
  }

  readonly transactionToID = <T extends keyof typeof this.methods>(method: T, args: Parameters<typeof this.methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
  readonly startupState = (peerStates: StateType[]) => mode(peerStates)
}

const start = (keyManager: KeyManager) => new NameServiceOracle(keyManager).openStar
export default start
