import { StateManager, type ORC20Oracle, type ORC20State, mode, parseEther, type OpenStarRC20 } from ".."

const state = new StateManager<ORC20State>({ balances: {} })

function calculateAPR(): number {
  const stakingRate = openStar.stakingRate()
  return 0.05 * (1 - stakingRate * 0.5) / stakingRate
}

const reputationChange = (peer: `0x${string}`, reputation: number): void => {
  const epochYield = calculateAPR() / (365 * 24 * 60 * 60 * 1000) / 5_000
  if (reputation > 0) {
    console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
    openStar.mint({ to: peer, amount: (state.value.balances[peer] !== undefined ? BigInt(Math.floor(Number(state.value.balances[peer])*epochYield)) : parseEther(100)).toHex().value })
  } else if (reputation < 0 && state.value.balances[peer] !== undefined) {
    console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
    openStar.burn({ to: peer, amount: ((BigInt(state.value.balances[peer] ?? `0x0`)*9n)/10n).toHex().value })
  }
}

let openStar: OpenStarRC20
const setOpenStar = (newOpenStar: OpenStarRC20) => {
  openStar = newOpenStar
}

const oracle: ORC20Oracle = {
  name: 'ORC20_COIN',
  epochTime: 5_000,
  ORC20: { ticker: 'STAR', calculateAPR },
  startupState: (peerStates) => mode(peerStates),
  state,
  reputationChange,
  setOpenStar
}
export default oracle
