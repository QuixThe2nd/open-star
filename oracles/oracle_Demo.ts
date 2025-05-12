import { type Oracle, StateManager, mode } from '..'

const state = new StateManager({ number: 0 })
const methods = {
	add: (args: { value: number }): string | void => {
		if (args.value <= 0) return 'Value must be positive'
		state.set({ number: Number(state.value.number) + Number(args.value) })
	},
	subtract: (args: { value: number }): string | void => {
		if (args.value <= 0) return 'Value must be positive'
		state.set({ number: state.value.number - args.value })
	}
}
const methodDescriptions = {
	add: { value: 0 },
	subtract: { value: 0 }
}

const oracle: Oracle<typeof state.value, 'DEMO', typeof methods> = {
	name: 'DEMO',
	epochTime: 5_000,
	state,
	methods,
	methodDescriptions,
	startupState: (peerStates) => mode(peerStates)
}
export default oracle
