declare global {
  interface BigInt {
    toHex: () => `0x${string}`;
  }
  interface Object {
    forEach: <T extends object, R>(this: T, callback: (key: keyof T, value: T[keyof T]) => R) => R[];
    keys: <T extends object>(this: T) => Array<keyof T>;
  }
}

export type NonEmptyArray<T> = T[] & { 0: T };
