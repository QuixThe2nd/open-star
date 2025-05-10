import type { KeyManager } from "../classes/KeyManager"
import type { MethodReturn, Oracle } from "../types/Oracle"
import { OpenStar } from "./OpenStar"
import { ORC20Oracle } from "./ORC20"

export const start = <OracleState extends Record<string, unknown>, OracleMethods extends Record<string, (arg: any) => MethodReturn>, OracleName extends string>(oracle: Oracle<OracleState, OracleMethods, OracleName>, keyManager?: KeyManager) => 'ORC20' in oracle ? new ORC20Oracle(oracle, keyManager) : new OpenStar(oracle, keyManager)
