import { Hex } from "./classes/Hex"
import type { NonEmptyArray } from "./types/generic"

// export function formatEther(value: bigint, decimals = 8): number {
//  const divisor = 10n ** BigInt(decimals)
//  const wholePart = value / divisor
//  const fractionalPart = value % divisor
//  if (fractionalPart === 0n) return Number(wholePart)
//  return Number(`${wholePart}.${fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '')}`)
// }

export const parseEther = (value: number, decimals = 8): bigint => BigInt(Math.round(value * Number(10n ** BigInt(decimals)) / Number(1n)))

export const mode = <State>(arr: NonEmptyArray<State>) => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop() as State

export function sortObjectByKeys<T extends object>(obj: T): T {
  if (Array.isArray(obj)) return obj
  const sortedObj: Record<keyof T, T[keyof T]> = {} as Record<keyof T, T[keyof T]>
  for (const key of (Object.keys(obj) as Array<keyof T>).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = typeof obj[key] === 'object' ? sortObjectByKeys(obj[key] as T[keyof T] & object) : obj[key]
  }
  return sortedObj as T
}

BigInt.prototype.toHex = function(): Hex {
  return Hex.fromBigInt(this as bigint)
}

Object.prototype.forEach = function <T extends object, R>(this: T, callback: (key: keyof T, value: T[keyof T]) => R) {
  const responses: R[] = []
  for (const key in this) {
    if (Object.prototype.hasOwnProperty.call(this, key)) responses.push(callback(key as keyof T, this[key]))
  }
  return responses
}

Object.prototype.keys = function <T extends object>(this: T) {
  return this.forEach((key) => { return key })
}

export const isHexAddress = (value: unknown): value is `0x${string}` => typeof value === 'string' ? value.startsWith('0x') : false