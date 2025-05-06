import { StateManager } from "../classes/StateManager"
import type { ORC20Oracle } from "../oracle/ORC20"
import type { NonEmptyArray } from "../types/generic"
import type { Oracle } from "../types/Oracle"
import type { ORC20State } from "../types/ORC20"
import { mode, parseEther, sortObjectByKeys } from "../utils"

type State = ORC20State & { hostnames: Record<`${string}.star`, `0x${string}`> }

class NameServiceOracle {
  public state = new StateManager<State>({ balances: {}, hostnames: {} })
  public readonly ORC20 = {
    ticker: 'NS'
  }
  public readonly epochTime = 30_000
  public readonly name = 'NAMESERVICE'
  openStar!: ORC20Oracle<"NAMESERVICE", State, typeof this.methods>

  readonly methods = {
    register: async (args: { from: `0x${string}`, hostname: `${string}.star`, signature: `0x${string}` }): Promise<void | string> => {
      if (this.state.value.hostnames[args.hostname] !== undefined) return 'Hostname unavailable'

      const balance = this.state.value.balances[args.from]
      if (balance === undefined) return 'No balance'
      if (BigInt(balance) < parseEther(1)) return 'Balance too low'
      if (!await this.openStar.keyManager.verify(args.signature, JSON.stringify({ from: args.from, hostname: args.hostname }), args.from)) return 'Invalid signature'
      this.state.value.balances[args.from] = (BigInt(balance) - parseEther(0.1)).toHex()

      this.state.value.hostnames[args.hostname] = args.from
      console.log(`[NAMESERVICE] Registered ${args.hostname} to ${args.from}`)
    },
    mint: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      this.state.value.balances[args.to] = (BigInt(this.state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
      this.state.value = sortObjectByKeys(this.state.value)
    },
    burn: (args: { to: `0x${string}`, amount: `0x${string}` }): void | string => {
      const balance = this.state.value.balances[args.to]
      if (balance === undefined) return 'Address does not exist'
      if (balance < args.amount) this.state.value.balances[args.to] = `0x0`
      else this.state.value.balances[args.to] = (BigInt(balance) - BigInt(args.amount)).toHex()
    },
  }

  readonly methodDescriptions: { [K in keyof typeof this.methods]: Parameters<typeof this.methods[keyof typeof this.methods]>[0] } = {
    register: { from: `0x`, hostname: `.star`, signature: `0x` },
    mint: { to: `0x`, amount: `0x` },
    burn: { to: `0x`, amount: `0x` }
  }

  blockYield(epochTime: number): number {
    const stakingRate = this.openStar.stakingRate()
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  public readonly reputationChange = (peers: Record<`0x${string}`, { reputation: number }>, epochTime: number): Promise<void> | void => {
    const blockYield = this.blockYield(epochTime)
    peers.forEach((peer, { reputation }) => {
      if (reputation > 0) {
        console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
        this.methods.mint({ to: peer, amount: (this.state.value.balances[peer] !== undefined ? BigInt(Math.floor(Number(this.state.value.balances[peer])*blockYield)) : parseEther(1)).toHex() })
      } else if (reputation < 0 && this.state.value.balances[peer] !== undefined) {
        console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
        this.methods.burn({ to: peer, amount: ((BigInt(this.state.value.balances[peer])*9n)/10n).toHex() })
      }
    })
    this.methods.mint({ to: this.openStar.keyManager.address, amount: (this.state.value.balances[this.openStar.keyManager.address] !== undefined ? BigInt(Math.floor(Number(this.state.value.balances[this.openStar.keyManager.address])*blockYield)) : parseEther(1)).toHex() })
  }

  readonly transactionToID = <T extends keyof typeof this.methods>(method: T, args: Parameters<typeof this.methods[T]>[0]) => `${method}-${JSON.stringify(args)}`
  readonly startupState = (peerStates: NonEmptyArray<State>) => mode(peerStates)

  readonly setOpenStar = (newOpenStar: ORC20Oracle<"NAMESERVICE", State, typeof this.methods>) => {
    this.openStar = newOpenStar
  }
}

const nameService = new NameServiceOracle()
const oracle: Oracle<'NAMESERVICE', State, typeof nameService.methods> = nameService
export default oracle
