import { StateManager, type ORC20Oracle, type Oracle, type ORC20State, mode, parseEther } from ".."

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

let openStar: ORC20Oracle<ORC20State, Record<string, never>>
const setOpenStar = (newOpenStar: ORC20Oracle<ORC20State, Record<string, never>>) => {
  openStar = newOpenStar
}

const oracle: Oracle<typeof state.value, Record<string, never>> = {
  name: 'COIN',
  epochTime: 5_000,
  ORC20: { ticker: 'STAR', calculateAPR },
  transactionToID: (method, args) => `${method}-${JSON.stringify(args)}`,
  startupState: (peerStates) => mode(peerStates),
  state,
  reputationChange,
  setOpenStar
}
export default oracle
