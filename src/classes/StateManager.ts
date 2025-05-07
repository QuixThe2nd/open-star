import { sortObjectByKeys } from "../utils"

export class StateManager<OracleState> {
  private _value: OracleState
  private listeners: Array<(state: OracleState) => void> = []
  constructor(state: OracleState) {
    this._value = state
  }
  get value() {
    return this._value
  }
  set value(state: OracleState) {
    this._value = typeof state === 'object' && state !== null ? sortObjectByKeys(state) : state
    this.listeners.forEach(listener => { listener(this.value) })
  }
  public subscribe(listener: (state: OracleState) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }
}