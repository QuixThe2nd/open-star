import { parseEther } from "viem";
import { mode, sortObjectByKeys, type PeerStates, OpenStar } from "../..";
import { KeyManager } from "../KeyManager";
import type { ORC20State } from "../../types";

type State = ORC20State & { hostnames: { [hostname: `${string}.star`]: `0x${string}` } }

class NameServiceOracle {
  public state: State = { balances: {}, hostnames: {} }
  public openStar: OpenStar<'NAMESERVICE', State, typeof this.methods>
  public readonly ORCs: 20[] = [ 20 ]

  constructor (keyManager: KeyManager) {
    this.openStar = new OpenStar('NAMESERVICE', { ...this, keyManager, epochTime: 30_000 })
  }

  readonly methods = {
    mint: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      this.state.balances[args.to] ??= `0x0`
      this.state.balances[args.to] = `0x${(BigInt(this.state.balances[args.to]!) + BigInt(args.amount)).toString(16)}`
      this.state = sortObjectByKeys(this.state)
    },
    burn: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      if (!this.state.balances[args.to]) return 'Address does not exist'
      if (this.state.balances[args.to]! < args.amount) this.state.balances[args.to] = `0x0`
      else this.state.balances[args.to] = `0x${(BigInt(this.state.balances[args.to]!) - BigInt(args.amount)).toString(16)}`
    },
    register: async (args: { from: `0x${string}`, hostname: `${string}.star`, signature: `0x${string}`, time: number }): Promise<void | string> => {
      if (!this.state.balances[args.from]) return 'No balance'
      if (this.state.hostnames[args.hostname]) return 'Hostname unavailable'
      if (BigInt(this.state.balances[args.from]!) < parseEther('1')) return 'Balance too low'
      if (!await this.openStar.keyManager.verify(args.signature, JSON.stringify({ from: args.from, hostname: args.hostname }), args.from)) return 'Invalid signature'
      this.state.balances[args.from] = `0x${(BigInt(this.state.balances[args.from]!) - parseEther('0.1')).toString(16)}`

      this.state.hostnames[args.hostname] = args.from
      console.log(`[NAMESERVICE] Registered ${args.hostname} to ${args.from}`)
    }
  }

  blockYield(peers: { [key: `0x${string}`]: { reputation: number, state: State }}, epochTime: number): number {
    const balances = this.state.balances
    let supply = 0n
    Object.keys(balances).forEach(peer => {
      supply += BigInt(balances[peer as keyof PeerStates<State>]!)
    })
    let coinsStaked = 0n
    Object.keys(peers).forEach(peer => {
      coinsStaked += BigInt(balances[peer as keyof PeerStates<State>] ?? `0x0`)
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
        this.methods.mint({ to: peer, amount: `0x${(this.state.balances[peer] ? BigInt(Math.floor(Number(this.state.balances[peer])*blockYield)) : parseEther('1')).toString(16)}` })
      } else if (reputation < 0 && this.state.balances[peer]) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.methods.burn({ to: peer, amount: `0x${((BigInt(this.state.balances[peer])*9n)/10n).toString(16)}` })
      }
    }
    this.methods.mint({ to: this.openStar.keyManager.getPublicKey(), amount: `0x${(this.state.balances[this.openStar.keyManager.getPublicKey()] ? BigInt(Math.floor(Number(this.state.balances[this.openStar.keyManager.getPublicKey()]!)*blockYield)) : parseEther('1')).toString(16)}` })
  }

  readonly transactionToID = <T extends keyof typeof this.methods>(method: T, args: Parameters<typeof this.methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
  readonly startupState = (peerStates: State[]) => mode(peerStates)
}

const start = (keyManager: KeyManager) => new NameServiceOracle(keyManager).openStar
export default start
