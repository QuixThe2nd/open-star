import type { StateManager } from "../classes/StateManager";
import type { OpenStar } from "../oracle/OpenStar";
import type { ORC20Oracle } from "../oracle/ORC20";
import type { NonEmptyArray } from "./generic";
import type { ORC20Flags, ORC20State } from "./ORC20";

export type MethodReturn = string | void | Promise<string | void>
export type Methods<T extends Record<string, (arg: any) => MethodReturn>> = { [K in keyof T]: T[K] extends (arg: infer A) => MethodReturn ? (arg: A) => MethodReturn : never }

export type PingPongMessage = ['ping' | 'pong'];
export type Message<OracleName extends string, OracleMethods extends Record<string, (arg: any) => MethodReturn>, SerializedState> = { [K in keyof OracleMethods]: [OracleName, 'call', K & string, Parameters<OracleMethods[K]>[0]] }[keyof OracleMethods] | [OracleName, 'state', SerializedState];
export type PeerStates<State> = Record<`0x${string}`, { lastSend: null | State; lastReceive: null | State; reputation: number | null }>;
export interface MempoolItem<M extends Methods<any>> { method: keyof M, args: Parameters<M[keyof M]>[0] }
export type MempoolItem<M extends Methods<any>> = { method: keyof M, args: Parameters<M[keyof M]>[0] }

export type Oracle<OracleName extends string, OracleState, OracleMethods extends Record<string, (arg: any) => MethodReturn>> = {
  name: OracleName
  state: StateManager<OracleState>,
  methods: OracleMethods
  methodDescriptions: { [K in keyof OracleMethods]: Parameters<OracleMethods[keyof OracleMethods]>[0] }
  epochTime: number
  startupState?: (_peerStates: NonEmptyArray<OracleState>) => Promise<OracleState> | OracleState,
  reputationChange?: (_peer: `0x${string}`, reputation: number) => void,
  transactionToID?: <T extends keyof OracleMethods>(_method: T, _args: Parameters<OracleMethods[T]>[0]) => string
  setOpenStar?(openStar: ORC20Oracle<OracleName, OracleState extends ORC20State ? OracleState : never, OracleMethods> | OpenStar<OracleName, OracleState, OracleMethods>): void;
} & (OracleState extends ORC20State ? { ORC20: ORC20Flags } : object)
