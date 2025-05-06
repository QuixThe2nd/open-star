import { StateManager } from "../classes/StateManager";
import type { NonEmptyArray } from "../types/generic";
import type { Oracle } from "../types/Oracle";
import { mode, parseEther } from "../utils";

type LiquidityPool = Record<string, {
    openStarLiquidity: `0x${string}`,
    tokenLiquidity: `0x${string}`,
    share: Record<`0x${string}`, number>
  }>;

const state = new StateManager<{ pools: LiquidityPool, burnRate: number }>({ pools: {}, burnRate: 0.5 })
const methods = {
  addLiquidity: ({ token, address, openStarLiquidity, tokenLiquidity }: { token: keyof LiquidityPool, address: `0x${string}`, openStarLiquidity: `0x${string}`, tokenLiquidity: `0x${string}` }): string | void => {
    state.value.pools[token] ??= {
      openStarLiquidity: parseEther(1).toHex(),
      tokenLiquidity: parseEther(1).toHex(),
      share: { "0x": 1 }
    }

    const existingOpenStarLiquidity = BigInt(state.value.pools[token].openStarLiquidity)
    const existingTokenLiquidity = BigInt(state.value.pools[token].tokenLiquidity)
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

    state.value.pools[token].share.forEach((existingAddress, existingShare) => {
      if (existingAddress === address) updatedShares[existingAddress] = existingShare * (1 - liquidityShareRatio) + liquidityShareRatio
      else updatedShares[existingAddress] = existingShare * (1 - liquidityShareRatio)
    })

    state.value.pools[token].openStarLiquidity = totalOpenStarLiquidity.toHex()
    state.value.pools[token].tokenLiquidity = totalTokenLiquidity.toHex()
    state.value.pools[token].share = updatedShares
  },
}
const methodDescriptions = {
  addLiquidity: { token: '', address: `0x` as `0x${string}`, openStarLiquidity: `0x` as `0x${string}`, tokenLiquidity: `0x` as `0x${string}` }
}

const reputationChange = (_peers: Record<`0x${string}`, { reputation: number }>) => {
  // for (const [, { reputation }] of Object.entries(peers) as [`0x${string}`, { reputation: number }][]) {
  //   if (reputation > 0) {} // Reward good peers
  //   else if (reputation < 0) {} // Punish bad peers
  // }
  // Reward/Punish yourself the same way others would to you
}

const startupState = (peerStates: NonEmptyArray<typeof state.value>) => mode(peerStates)
const transactionToID = <T extends keyof typeof methods>(method: T, args: Parameters<typeof methods[T]>[0]) => `${method}-${JSON.stringify(args)}`

const oracle: Oracle<'BRIDGE', typeof state.value, typeof methods> = { startupState, reputationChange, state, methods, methodDescriptions, transactionToID, epochTime: 60_000, name: 'BRIDGE' }
export default oracle
