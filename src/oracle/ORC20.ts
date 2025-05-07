import { OpenStar } from "./OpenStar"
import type { MethodReturn } from "../types/Oracle"
import type { ORC20State } from "../types/ORC20"

export class ORC20Oracle<OracleState extends ORC20State, OracleMethods extends Record<string, (arg: any) => MethodReturn>, OracleName extends string = string> extends OpenStar<OracleState, OracleMethods, OracleName> {
  protected override initializeExtended(): void {
    if (this.oracle.setOpenStar) this.oracle.setOpenStar(this)
  }
  circulatingSupply = () => {
    let supply = 0n
    this.oracle.state.value.balances.forEach(peer => {
      supply += BigInt(this.oracle.state.value.balances[peer] ?? `0x0`)
    })
    return supply
  }
  stakedSupply = () => {
    let coinsStaked = 0n
    this.peerStates.forEach(peer => {
      coinsStaked += BigInt(this.oracle.state.value.balances[peer] ?? `0x0`)
    })
    return coinsStaked
  }
  stakingRate() {
    return this.circulatingSupply() === 0n || this.stakedSupply() === 0n ? 1 : Number(this.stakedSupply()) / Number(this.circulatingSupply())
  }
}
