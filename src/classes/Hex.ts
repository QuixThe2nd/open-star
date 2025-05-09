import { bytesToHex, hexToBytes } from "viem/utils"

const hexes = Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0'))

export class Hex {
  readonly value: `0x${string}`

  constructor(value: `0x${string}`) {
    if (value.startsWith('0x-')) throw new Error('Hex value is negative')
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
    else if (typeof value === 'number') return Hex.fromNumber(value)
    else if (typeof value === 'string') return Hex.fromString(value)
    else throw new Error('Casting hex from unexpected type')
  }

  static fromBigInt = (value: bigint, size?: number) => {
    const maxValue = size !== undefined ? 2n ** (BigInt(size) * 8n) - 1n : BigInt(Number.MAX_SAFE_INTEGER)
    if (value > maxValue) throw new Error('Hex value is too large')
    const hex: `0x${string}` = `0x${value.toString(16)}`
    return new Hex(size !== undefined ? `0x${hex.replace('0x', '').padStart(size * 2, '0')}` : hex)
  }
  static fromString = (value: string): Hex => new Hex(bytesToHex(new TextEncoder().encode(value)))
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
