import type { KeyManager } from "../classes/KeyManager";
import type { MethodReturn, Oracle } from "../types/Oracle";
import { OpenStar } from "./OpenStar";
import { ORC20Oracle } from "./ORC20";

export const start = <OracleName extends string, OracleState, OracleMethods extends Record<string, (arg: any) => MethodReturn>>(oracle: Oracle<OracleName, OracleState, OracleMethods>, keyManager: KeyManager) => 'ORC20' in oracle ? new ORC20Oracle(oracle, keyManager) : new OpenStar(oracle, keyManager)
