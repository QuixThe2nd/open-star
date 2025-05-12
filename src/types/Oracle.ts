import type { StateManager } from '../classes/StateManager'
import type { OpenStar } from '../oracle/OpenStar'
import type { OpenStarRC1 } from '../oracle/OpenStarRC1'
import type { OpenStarRC20 } from '../oracle/OpenStarRC20'
import type { ORC1Block, ORC1State, ORC20Flags, ORC20State } from './ORC'
import type { NonEmptyArray } from './generic'

export type MethodReturn = string | void | Promise<string | void>
export type Methods<T extends Record<string, (arg: any) => MethodReturn>> = {
	[K in keyof T]: T[K] extends (arg: infer A) => MethodReturn ? (arg: A) => MethodReturn : never
}

export type PingPongMessage = ['ping' | 'pong']
export type Message<OracleName extends string, OracleMethods extends Record<string, (arg: any) => MethodReturn>, SerializedState> =
	| {
			[K in keyof OracleMethods]: [OracleName, 'call', K & string, Parameters<OracleMethods[K]>[0]]
	  }[keyof OracleMethods]
	| [OracleName, 'state', SerializedState]
export type PeerStates<State> = Record<
	`0x${string}`,
	{
		lastSend: null | State
		lastReceive: null | State
		reputation: number | null
	}
>
export type MempoolItem<M extends Methods<any>> = {
	method: keyof M
	args: Parameters<M[keyof M]>[0]
}

type BaseOracle<OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>, OracleState extends Record<string, unknown> = Record<string, unknown>, OracleName extends string = string> = {
	name: OracleName
	state: StateManager<OracleState>
	epochTime?: number
	startupState: (_peerStates: NonEmptyArray<OracleState>) => Promise<OracleState> | OracleState
	reputationChange?: (_peer: `0x${string}`, reputation: number) => void
	transactionToID?: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0]) => string
	onConnect?: () => void | Promise<void>
} & ({
		methods: OracleMethods
		methodDescriptions: { [K in keyof OracleMethods]: Parameters<OracleMethods[keyof OracleMethods]>[0] }
	}
| object)

export type Oracle<OracleState extends Record<string, unknown> = Record<string, unknown>, OracleName extends string = string, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> = BaseOracle<OracleMethods, OracleState, OracleName> & {
	setOpenStar?(openStar: OpenStar<OracleState, OracleName, OracleMethods>): void
}

export type ORC20Oracle<OracleState extends ORC20State = ORC20State, OracleName extends `ORC20_${string}` = `ORC20_${string}`, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> = BaseOracle<OracleMethods, OracleState, OracleName> & {
	ORC20: ORC20Flags
	setOpenStar?(openStar: OpenStarRC20<OracleState, OracleName, OracleMethods>): void
}

export type ORC1Oracle<OracleState extends ORC1State = ORC1State, OracleName extends `ORC1_${string}` = `ORC1_${string}`, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> = BaseOracle<OracleMethods, OracleState, OracleName> & {
	ORC1: true,
	setOpenStar?(openStar: OpenStarRC1<OracleState, OracleName, OracleMethods>): void
}
