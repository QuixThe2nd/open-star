import { type KeyManager, type MethodReturn, OpenStar, type Oracle } from '..'

export const start = <OracleState extends Record<string, unknown> = Record<string, unknown>, OracleName extends string = string, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>>(
	oracle: Oracle<OracleState, OracleName, OracleMethods>,
	keyManager?: KeyManager
) => new OpenStar(oracle, keyManager)
