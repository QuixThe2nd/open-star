const hexes = Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0'))
const charCodeMap = { zero: 48, nine: 57, A: 65, F: 70, a: 97, f: 102 }
const charCodeToBase16 = (char: number) =>
	char >= charCodeMap.zero && char <= charCodeMap.nine ? char - charCodeMap.zero : char >= charCodeMap.A && char <= charCodeMap.F ? char - (charCodeMap.A - 10) : char >= charCodeMap.a && char <= charCodeMap.f ? char - (charCodeMap.a - 10) : undefined

export function hexToBytes(hex: `0x${string}`): Uint8Array {
	let hexString = hex.slice(2)
	if (hexString.length % 2) hexString = `0${hexString}`

	const length = hexString.length / 2
	const bytes = new Uint8Array(length)
	for (let index = 0, j = 0; index < length; index++) {
		const nibbleLeft = charCodeToBase16(hexString.charCodeAt(j++))
		const nibbleRight = charCodeToBase16(hexString.charCodeAt(j++))
		if (nibbleLeft === undefined || nibbleRight === undefined) throw new Error(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`)
		bytes[index] = nibbleLeft * 16 + nibbleRight
	}
	return bytes
}

export class Hex {
	readonly value: `0x${string}`

	constructor(value: `0x${string}`) {
		if (value.startsWith('0x-')) throw new Error('Hex value is negative')
		if (value === '0x') throw new Error('Hex value is null')
		this.value = value
	}

	get size(): number {
		return Math.ceil((this.value.length - 2) / 2)
	}

	concat = (value: `0x${string}`): Hex => {
		return new Hex(`0x${this.value.replace('0x', '') + value.replace('0x', '')}`)
	}

	get number(): number {
		return Number(this.value)
	}

	get bigint(): bigint {
		return BigInt(this.value)
	}

	get bytes(): Uint8Array {
		return hexToBytes(this.value)
	}

	static from(value: bigint | number | string): Hex {
		if (typeof value === 'bigint') return Hex.fromBigInt(value)
		if (typeof value === 'number') return Hex.fromNumber(value)
		if (typeof value === 'string') return Hex.fromString(value)
		throw new Error('Casting hex from unexpected type')
	}

	static fromBigInt = (value: bigint, size?: number) => {
		const maxValue = size !== undefined ? 2n ** (BigInt(size) * 8n) - 1n : BigInt(Number.MAX_SAFE_INTEGER)
		if (value > maxValue) throw new Error('Hex value is too large')
		const hex: `0x${string}` = `0x${value.toString(16)}`
		return new Hex(size !== undefined ? `0x${hex.replace('0x', '').padStart(size * 2, '0')}` : hex)
	}
	static fromString = (value_: string): Hex => {
		const value = new TextEncoder().encode(value_)
		let string = ''
		for (let i = 0; i < value.length; i++) {
			const byte = value[i]
			if (byte !== undefined) string += hexes[byte] ?? ''
		}
		return new Hex(`0x${string}`)
	}
	static fromNumber = (value: number, size?: number): Hex => Hex.fromBigInt(BigInt(value), size)
	static fromBytes = (value: Uint8Array): Hex => {
		let string = ''
		for (let i = 0; i < value.length; i++) {
			const byte = value[i]
			if (byte === undefined) throw new Error('Unreachable code')
			if (hexes[byte] === undefined) throw new Error('Byte out of range')
			string += hexes[byte]
		}
		return new Hex(`0x${string}`)
	}
}
