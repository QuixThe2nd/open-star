import type { ORC20State } from '../types/ORC'
import type { MethodReturn } from '../types/Oracle'
import type { OpenStar } from './OpenStar'

export class OpenStarRC20<OracleState extends ORC20State = ORC20State, OracleName extends `ORC20_${string}` = `ORC20_${string}`, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> {
	public readonly openStar: OpenStar<OracleState, OracleName, OracleMethods>
	constructor(openStar: OpenStar<OracleState, OracleName, OracleMethods>) {
		this.openStar = openStar
	}
	circulatingSupply() {
		let supply = 0n
		const state = this.openStar.oracle.state.value as ORC20State
		state.balances.forEach((_, balance) => {
			supply += BigInt(balance)
		})
		return supply
	}
	stakedSupply() {
		let coinsStaked = BigInt(this.openStar.oracle.state.value.balances[this.openStar.keyManager.address] ?? `0x0`)
		this.openStar.peerStates.forEach((peer) => {
			coinsStaked += BigInt(this.openStar.oracle.state.value.balances[peer] ?? `0x0`)
		})
		return coinsStaked
	}
	get stakingRate() {
		return this.circulatingSupply() === 0n || this.stakedSupply() === 0n ? 1 : Number(this.stakedSupply()) / Number(this.circulatingSupply())
	}
	mint(args: { to: `0x${string}`; amount: `0x${string}` }) {
		const state = this.openStar.oracle.state.value as OracleState
		state.balances[args.to] = (BigInt(this.openStar.oracle.state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex().value
		this.openStar.oracle.state.set(state)
	}
	burn(args: { to: `0x${string}`; amount: `0x${string}` }): string | void {
		const balance = this.openStar.oracle.state.value.balances[args.to]
		if (balance === undefined) return 'Address does not exist'
		const state = this.openStar.oracle.state.value as OracleState
		if (Number(balance) < Number(args.amount)) state.balances[args.to] = `0x0`
		else state.balances[args.to] = (BigInt(balance) - BigInt(args.amount)).toHex().value
		this.openStar.oracle.state.set(state)
	}
	transfer(args: {
		from: `0x${string}`
		to: `0x${string}`
		amount: `0x${string}`
		signature: `0x${string}`
	}): string | void {
		const balance = this.openStar.oracle.state.value.balances[args.from]
		if (balance === undefined) return 'No balance'
		if (Number(balance) < Number(args.amount)) return 'Balance too low'
		const state = this.openStar.oracle.state.value as OracleState
		state.balances[args.from] = (BigInt(balance) - BigInt(args.amount)).toHex().value
		state.balances[args.to] = (BigInt(state.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex().value
		this.openStar.oracle.state.set(state)
	}
}
