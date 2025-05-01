import { KeyManager, mode, OpenStar } from '../..';

type LiquidityPool = {
  [token: string]: {
    openStarLiquidity: `0x${string}`,
    tokenLiquidity: `0x${string}`,
    share: { [address: `0x${string}`]: number }
  }
}

const state: { pools: LiquidityPool, burnRate: number } = { pools: {}, burnRate: 0.5 }
const methods = {
  addLiquidity: <T extends keyof LiquidityPool>({ token, address, openStarLiquidity, tokenLiquidity }: { token: T, address: `0x${string}` } & LiquidityPool[T]): string | void => {
    if (!(token in state.pools)) {
      state.pools[token] = {
        openStarLiquidity: `0x${1000000000000000000n.toString(16)}`,
        tokenLiquidity: `0x${1000000000000000000n.toString(16)}`,
        share: { 
          "0x": 1
        }
      }
    }
    const pool = state.pools[token]!
    
    const existingOpenStarLiquidity = BigInt(pool.openStarLiquidity)
    const existingTokenLiquidity = BigInt(pool.tokenLiquidity)
    const newOpenStarLiquidity = BigInt(openStarLiquidity)
    const newTokenLiquidity = BigInt(tokenLiquidity)
    
    const totalOpenStarLiquidity = existingOpenStarLiquidity + newOpenStarLiquidity
    const totalTokenLiquidity = existingTokenLiquidity + newTokenLiquidity
    
    let liquidityShareRatio = 0
    if (existingOpenStarLiquidity > 0 && existingTokenLiquidity > 0) {
      const openStarRatio = Number(newOpenStarLiquidity) / Number(existingOpenStarLiquidity)
      const tokenRatio = Number(newTokenLiquidity) / Number(existingTokenLiquidity)
      liquidityShareRatio = Math.min(openStarRatio, tokenRatio) / (1 + Math.min(openStarRatio, tokenRatio))
    } else liquidityShareRatio = 1
    const updatedShares: Record<`0x${string}`, number> = {}

    if (!(address in updatedShares)) updatedShares[address] = liquidityShareRatio
    for (const [existingAddress, existingShare] of Object.entries(pool.share)) {
      if (existingAddress === address) updatedShares[existingAddress] = existingShare * (1 - liquidityShareRatio) + liquidityShareRatio
      else updatedShares[existingAddress as `0x${string}`] = existingShare * (1 - liquidityShareRatio)
    }
    
    state.pools[token]!.openStarLiquidity = `0x${totalOpenStarLiquidity.toString(16)}`
    state.pools[token]!.tokenLiquidity = `0x${(BigInt(totalTokenLiquidity)).toString(16)}`
    state.pools[token]!.share = updatedShares
  },
}

const reputationChange = (peers: { [key: `0x${string}`]: { reputation: number, state: typeof state }}) => {
  for (const [, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
    if (reputation === null) continue
    // else if (reputation > 0) {} // Reward good peers
    // else if (reputation < 0) {} // Punish bad peers
  }
  // Reward/Punish yourself the same way others would to you
}

const startupState = (peerStates: typeof state[]) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`

let openStar: OpenStar<'DEMO', typeof state, typeof methods>
const start = (keyManager: KeyManager) => {
  openStar = new OpenStar('DEMO', { startupState, reputationChange, state, methods, keyManager, transactionToID, epochTime: 60_000 })
  return openStar
}

export default start