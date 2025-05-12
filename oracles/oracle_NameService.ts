import { type NonEmptyArray, type ORC20Oracle, type ORC20State, type OpenStarRC20, StateManager, mode, parseEther } from '..'

class NameServiceOracle {
	public state = new StateManager<ORC20State & { hostnames: Record<`${string}.star`, `0x${string}`> }>({
		balances: {},
		hostnames: {}
	})
	public readonly ORC20 = {
		ticker: 'NS',
		calculateAPR: () => {
			const stakingRate = this.openStar.stakingRate()
			return ((0.05 * (1 - stakingRate * 0.5)) / stakingRate) * 100
		}
	}
	public readonly epochTime = 30_000
	public readonly name = 'ORC20_NAMESERVICE'
	openStar!: OpenStarRC20<typeof this.methods, typeof this.state.value>

	readonly methods = {
		register: (args: {
			from: `0x${string}`
			hostname: `${string}.star`
			signature: `0x${string}`
		}): void | string => {
			if (this.state.value.hostnames[args.hostname] !== undefined) return 'Hostname unavailable'

			const balance = this.state.value.balances[args.from]
			if (balance === undefined) return 'No balance'
			if (BigInt(balance) < parseEther(1)) return 'Balance too low'
			if (
				!this.openStar.keyManager.verify(
					args.signature,
					JSON.stringify({
						from: args.from,
						hostname: args.hostname
					}),
					args.from
				)
			)
				return 'Invalid signature'
			this.state.value.balances[args.from] = (BigInt(balance) - parseEther(0.1)).toHex().value

			this.state.value.hostnames[args.hostname] = args.from
			console.log(`[NAMESERVICE] Registered ${args.hostname} to ${args.from}`)
		}
	}

	readonly methodDescriptions: {
		[K in keyof typeof this.methods]: Parameters<(typeof this.methods)[keyof typeof this.methods]>[0]
	} = {
		register: { from: `0x`, hostname: `.star`, signature: `0x` }
	}

	public readonly reputationChange = (peer: `0x${string}`, reputation: number): void => {
		const epochYield = this.ORC20.calculateAPR() / (365 * 24 * 60 * 60 * 1000) / 5_000
		if (reputation > 0) {
			console.log('[NAMESERVICE] Rewarding', peer.slice(0, 8) + '...')
			this.openStar.mint({
				to: peer,
				amount: (this.state.value.balances[peer] !== undefined ? BigInt(Math.floor(Number(this.state.value.balances[peer]) * epochYield)) : parseEther(1)).toHex().value
			})
		} else if (reputation < 0 && this.state.value.balances[peer] !== undefined) {
			console.log('[NAMESERVICE] Slashing', peer.slice(0, 8) + '...')
			this.openStar.burn({
				to: peer,
				amount: ((BigInt(this.state.value.balances[peer] ?? `0x0`) * 9n) / 10n).toHex().value
			})
		}
	}

	readonly transactionToID = <T extends keyof typeof this.methods>(method: T, args: Parameters<(typeof this.methods)[T]>[0]) => `${method}-${JSON.stringify(args)}`
	readonly startupState = (peerStates: NonEmptyArray<typeof this.state.value>) => mode(peerStates)

	readonly setOpenStar = (newOpenStar: OpenStarRC20<typeof this.methods, typeof this.state.value>) => {
		this.openStar = newOpenStar
	}
}

const nameService = new NameServiceOracle()
const oracle: ORC20Oracle<typeof nameService.methods, typeof nameService.state.value> = nameService
export default oracle
