export type ORC1Block = {
	transactions: string[]
	id: `0x${string}`
	seed: number
	prev: `0x${string}`
}
export type ORC1State = { blocks: ORC1Block[]; difficulty: number }

export type ORC20State = { balances: Record<`0x${string}`, `0x${string}`> }
export type ORC20Flags = { ticker: string; calculateAPR: () => number }
