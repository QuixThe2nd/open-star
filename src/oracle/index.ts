import type { ORC20State } from '..'
import type { KeyManager } from '../classes/KeyManager'
import type { MethodReturn, ORC20Oracle, Oracle } from '../types/Oracle'
import { OpenStar } from './OpenStar'
import { OpenStarRC20 } from './OpenStarRC20'

export const start = <OracleState extends Record<string, unknown> | ORC20State, OracleMethods extends Record<string, (arg: any) => MethodReturn>, OracleName extends OracleState extends ORC20State ? `ORC20_${string}` : string>(
	oracle: OracleState extends ORC20State ? ORC20Oracle<OracleMethods, OracleState, Extract<OracleName, `ORC20_${string}`>> : Oracle<OracleMethods, OracleState, OracleName>,
	keyManager?: KeyManager
) => ('ORC20' in oracle ? new OpenStarRC20(oracle as ORC20Oracle<OracleMethods>, keyManager) : new OpenStar(oracle, keyManager))
