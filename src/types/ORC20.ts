import type { MethodReturn } from "./Oracle"

export interface ORC20State { balances: Record<`0x${string}`, `0x${string}`> }

export interface ORC20MethodArgs {
  transfer: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, time: number, signature: `0x${string}` }
  mint: { to: `0x${string}`, amount: `0x${string}` }
  burn: { to: `0x${string}`, amount: `0x${string}` }
}

export interface ORC20Methods extends Record<string, (arg: any) => MethodReturn> {
  transfer: (args: ORC20MethodArgs['transfer']) => string | void
  mint: (args: ORC20MethodArgs['mint']) => string | void
  burn: (args: ORC20MethodArgs['burn']) => string | void
}

export interface ORC20Flags {
  ticker: string
}