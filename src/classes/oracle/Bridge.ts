import { KeyManager, mode, OpenStar, State } from '../..';

type LiquidityPool = {
  [token: string]: {
    openStarLiquidity: `0x${string}`,
    tokenLiquidity: `0x${string}`,
    share: { [address: `0x${string}`]: number }
  }
}

const state = new State<{ pools: LiquidityPool, burnRate: number }>({ pools: {}, burnRate: 0.5 })
const methods = {
  addLiquidity: <T extends keyof LiquidityPool>({ token, address, openStarLiquidity, tokenLiquidity }: { token: T, address: `0x${string}`, openStarLiquidity: `0x${string}`, tokenLiquidity: `0x${string}` }): string | void => {
    if (!(token in state.value.pools)) {
      state.value.pools[token] = {
        openStarLiquidity: `0x${1000000000000000000n.toString(16)}`,
        tokenLiquidity: `0x${1000000000000000000n.toString(16)}`,
        share: { "0x": 1 }
      }
    }
    const pool = state.value.pools[token]!
    
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

    state.value.pools[token]!.openStarLiquidity = `0x${totalOpenStarLiquidity.toString(16)}`
    state.value.pools[token]!.tokenLiquidity = `0x${(BigInt(totalTokenLiquidity)).toString(16)}`
    state.value.pools[token]!.share = updatedShares
  },
}
const methodDescriptions = {
  addLiquidity: { token: '', address: `0x` as `0x${string}`, openStarLiquidity: `0x` as `0x${string}`, tokenLiquidity: `0x` as `0x${string}` }
}

const reputationChange = (peers: { [key: `0x${string}`]: { reputation: number, state: typeof state.value }}) => {
  for (const [, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
    if (reputation === null) continue
    // else if (reputation > 0) {} // Reward good peers
    // else if (reputation < 0) {} // Punish bad peers
  }
  // Reward/Punish yourself the same way others would to you
}

const startupState = (peerStates: typeof state.value[]) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`

const start = (keyManager: KeyManager) => new OpenStar('BRIDGE', { startupState, reputationChange, state, methods, methodDescriptions, keyManager, transactionToID, epochTime: 60_000 })
export default start
