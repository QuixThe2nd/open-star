import type { NonEmptyArray } from "./types/generic";

export function formatEther(value: bigint): number {
 const divisor = 10n ** 18n;
 const wholePart = value / divisor;
 const fractionalPart = value % divisor;
 if (fractionalPart === 0n) return Number(wholePart);
 return Number(`${wholePart}.${fractionalPart.toString().padStart(18, '0').replace(/0+$/, '')}`);
}

export function parseEther(value: number): bigint {
  return BigInt(Math.round(value * Number(10n ** 18n) / Number(1n)));
}

export const mode = <State>(arr: NonEmptyArray<State>) => arr.toSorted((a,b) => arr.filter(v => v===a).length - arr.filter(v => v===b).length).pop() as State;

export function sortObjectByKeys<T extends object>(obj: T): T {
  const sortedObj: Record<keyof T, T[keyof T]> = {} as Record<keyof T, T[keyof T]>;
  for (const key of (Object.keys(obj) as Array<keyof T>).toSorted((a, b) => (a as string).localeCompare(b as string))) {
    sortedObj[key] = typeof obj[key] === 'object' ? sortObjectByKeys(obj[key] as T[keyof T] & object) : obj[key];
  }
  return sortedObj as T;
}

BigInt.prototype.toHex = function(): `0x${string}` {
  if (Number(this) < 0) throw new Error('Negative bigint')
  return `0x${this.toString(16)}`;
};

Object.prototype.forEach = function <T extends object>(this: T, callback: (key: keyof T, value: T[keyof T]) => void) {
  for (const key in this) {
    if (Object.prototype.hasOwnProperty.call(this, key)) callback(key as keyof T, this[key])
  }
}

Object.prototype.keys = function <T extends object>(this: T) {
  const keys: Array<keyof T> = []
  this.forEach((key) => keys.push(key))
  return keys
}

export const isHexAddress = (value: unknown): value is `0x${string}` => typeof value === 'string' ? value.startsWith('0x') : false;