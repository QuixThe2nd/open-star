export type ORC20State = { balances: { [key: `0x${string}`]: `0x${string}` } }
export type MethodReturn = string | void | Promise<string | void>
export interface ORC20Methods extends Record<string, (arg: any) => MethodReturn> {
  transfer(args: { from: `0x${string}`, to: `0x${string}`, amount: `0x${string}`, signature: `0x${string}` }): Promise<string | void>
  mint?: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
  burn?: (args: { to: `0x${string}`, amount: `0x${string}` }) => string | void
}