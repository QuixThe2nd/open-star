import { type Oracle, type ORC1State, StateManager, OpenStarRC1 } from '..'

// TODO: use difficulty var
// TODO: handle re-org

let ORC1: OpenStarRC1<ORC1State, `ORC1_${string}`>
const oracle: Oracle<ORC1State, `ORC1_${string}`> = {
	name: 'ORC1_BLOCKCHAIN',
	ORC1: true,
	state: new StateManager<ORC1State>({ blocks: [], difficulty: 3 }),
	startupState(peerStates) {
		peerStates.forEach((state) => {
			if (!state) return
			for (const block of state.blocks) ORC1.openStar.call('addBlock', block)
		})
		return ORC1.openStar.oracle.state.value
	},
	async onConnect() {
		if (ORC1.getLatestBlock() === undefined) ORC1.openStar.call('addBlock', { transactions: [], id: '0x', prev: '0x', seed: 0 })
		for (;;) {
			ORC1.createBlock()
			await new Promise((res) => setTimeout(res, 100))
		}
	},
	setOpenStar(newOpenStar) {
		ORC1 = new OpenStarRC1(newOpenStar)
	}
}
export default oracle
