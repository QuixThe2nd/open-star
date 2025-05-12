import { type ORC1Oracle, type ORC1State, StateManager } from '../src'
import type { OpenStarRC1 } from '../src/oracle/OpenStarRC1'

// TODO: use difficulty var
// TODO: handle re-org

let openStar: OpenStarRC1
const oracle: ORC1Oracle = {
  name: 'ORC1_BLOCKCHAIN',
  ORC1: true,
  state: new StateManager<ORC1State>({ blocks: [], difficulty: 3 }),
  startupState(peerStates) {
    peerStates.forEach(state => {
      if (!state) return
      for (const block of state.blocks) openStar.call('addBlock', block)
    })
    return openStar.oracle.state.value
  },
  async onConnect() {
    if (openStar.getLatestBlock() === undefined) openStar.call('addBlock', { transactions: [], id: '0x', prev: '0x', seed: 0 })
    for (;;) {
      openStar.createBlock()
      await new Promise(res => setTimeout(res, 100))
    }
  },
  setOpenStar(newOpenStar) {
    openStar = newOpenStar
  }
}
export default oracle
