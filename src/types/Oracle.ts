import type { StateManager } from '../classes/StateManager'
import type { OpenStar } from '../oracle/OpenStar'
import type { ORC20Flags } from './ORC'
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

export type Oracle<OracleState extends Record<string, unknown> = Record<string, unknown>, OracleName extends string = string, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> = {
	name: OracleName
	state: StateManager<OracleState>
	epochTime?: number
	startupState: (_peerStates: NonEmptyArray<OracleState>) => Promise<OracleState> | OracleState
	reputationChange?: (_peer: `0x${string}`, reputation: number) => void
	transactionToID?: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0]) => string
	onConnect?: () => void | Promise<void>
	setOpenStar?(openStar: OpenStar<OracleState, OracleName, OracleMethods>): void
	ORC1?: true
	ORC20?: ORC20Flags
} & ({
	methods: OracleMethods
	methodDescriptions: { [K in keyof OracleMethods]: Parameters<OracleMethods[keyof OracleMethods]>[0] }
} | object)
