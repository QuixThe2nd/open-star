import { OpenStar } from "./OpenStar"
import type { MethodReturn } from "../types/Oracle"
import type { ORC20State } from "../types/ORC20"

export class ORC20Oracle<OracleState extends ORC20State = ORC20State, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>, OracleName extends string = string> extends OpenStar<OracleState, OracleMethods, OracleName> {
  protected override initializeExtended(): void {
    if (this.oracle.setOpenStar) this.oracle.setOpenStar(this)
  }
  circulatingSupply() {
    let supply = 0n
    const state = this.oracle.state.value as ORC20State
    state.balances.forEach((_, balance) => {
      supply += BigInt(balance)
    })
    return supply
  }
  stakedSupply() {
    let coinsStaked = BigInt(this.oracle.state.value.balances[this.keyManager.address] ?? `0x0`)
    this.peerStates.forEach(peer => {
      coinsStaked += BigInt(this.oracle.state.value.balances[peer] ?? `0x0`)
    })
    return coinsStaked
  }
  stakingRate() {
    return this.circulatingSupply() === 0n || this.stakedSupply() === 0n ? 1 : Number(this.stakedSupply()) / Number(this.circulatingSupply())
  }
  mint(args: { to: `0x${string}`, amount: `0x${string}` }) {
    const state = this.oracle.state.value as OracleState
    state.balances[args.to] = (BigInt(this.oracle.state.value.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
    this.oracle.state.set(state)
  }
  burn(args: { to: `0x${string}`, amount: `0x${string}` }): string | void {
    const balance = this.oracle.state.value.balances[args.to]
    if (balance === undefined) return 'Address does not exist'
    const state = this.oracle.state.value as OracleState
    if (balance < args.amount) state.balances[args.to] = `0x0`
    else state.balances[args.to] = (BigInt(balance) - BigInt(args.amount)).toHex()
    this.oracle.state.set(state)
  }
  transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }): string | void {
    const balance = this.oracle.state.value.balances[args.from]
    if (balance === undefined) return 'No balance'
    if (balance < args.amount) return 'Balance too low'
    const state = this.oracle.state.value as OracleState
    state.balances[args.from] = (BigInt(balance) - BigInt(args.amount)).toHex()
    state.balances[args.to] = (BigInt(state.balances[args.to] ?? `0x0`) + BigInt(args.amount)).toHex()
    this.oracle.state.set(state)
  }
}
