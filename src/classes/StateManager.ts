import { sortObjectByKeys } from '../utils'

export class StateManager<OracleState extends Record<string, unknown>> {
	private _value: OracleState
	private listeners: Array<(state: OracleState) => void> = []
	constructor(state: OracleState) {
		this._value = state
	}
	get value(): Readonly<OracleState> {
		return this._value
	}
	set(state: OracleState) {
		this._value = sortObjectByKeys(state)
		this.listeners.forEach((listener) => listener(this._value))
	}
	public subscribe(listener: (state: OracleState) => void) {
		this.listeners.push(listener)
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener)
		}
	}
}
