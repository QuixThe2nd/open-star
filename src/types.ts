import type { Methods } from "."

export type ORC20State = { balances: { [key: `0x${string}`]: `0x${string}` } }
export interface ORC20Methods extends Methods<any> {
  mint?: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
  burn?: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
  transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }): Promise<string | void>
}