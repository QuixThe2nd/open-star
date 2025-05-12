import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { HDKey } from '@scure/bip32'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { Hex } from './Hex'
const fs = typeof window === 'undefined' ? await import('fs') : undefined

const keccak256 = <T extends `0x${string}` | Uint8Array>(value: T): T => (typeof value === 'string' ? Hex.fromBytes(keccak_256(new Hex(value).bytes)).value : keccak_256(value)) as T

export const hashString = (input: string): `0x${string}` => Hex.fromBytes(keccak_256(Buffer.from(input))).value

function toRecoveryBit(yParityOrV: number) {
	if (yParityOrV === 0 || yParityOrV === 1) return yParityOrV
	if (yParityOrV === 27) return 0
	if (yParityOrV === 28) return 1
	throw new Error('Invalid yParityOrV value')
}

export function toPrefixedMessage(message_: string): `0x${string}` {
	const message = Hex.fromString(message_)
	return Hex.fromString(`\x19Ethereum Signed Message:\n${message.size}`).concat(message.value).value
}

export function checksumAddress(address_: `0x${string}`): `0x${string}` {
	const hexAddress = address_.substring(2).toLowerCase()
	const hash = keccak256(new TextEncoder().encode(hexAddress))
	const address = hexAddress.split('')
	for (let i = 0; i < 40; i += 2) {
		const hashValue = hash[i >> 1]
		if (hashValue === undefined) throw new Error('Unreachable code reached')
		if (hashValue >> 4 >= 8 && address[i] !== undefined) address[i] = address[i]?.toUpperCase() ?? ''
		if ((hashValue & 0x0f) >= 8 && address[i + 1] !== undefined) address[i + 1] = address[i + 1]?.toUpperCase() ?? ''
	}
	return `0x${address.join('')}`
}

export function sign(hash: `0x${string}`, privateKey: `0x${string}`): `0x${string}` {
	const signature = secp256k1.sign(hash.slice(2), privateKey.slice(2), {
		lowS: true,
		extraEntropy: false
	})
	const r = new Hex(Hex.fromBigInt(signature.r, 32).value).bigint
	const s = new Hex(Hex.fromBigInt(signature.s, 32).value).bigint
	const yParity = signature.recovery

	if (yParity !== 0 && yParity !== 1) throw new Error('Invalid `yParity` value')
	return `0x${new secp256k1.Signature(r, s).toCompactHex()}${yParity === 0 ? '1b' : '1c'}`
}

export function verify(address: `0x${string}`, message: string, signature: Hex): boolean {
	if (signature.size !== 65) throw new Error('invalid signature length')
	const publicKey = `0x${secp256k1.Signature.fromCompact(signature.value.substring(2, 130))
		.addRecoveryBit(toRecoveryBit(new Hex(`0x${signature.value.slice(130)}`).number))
		.recoverPublicKey(keccak256(toPrefixedMessage(message)).substring(2))
		.toHex(false)}`
	const actualAddress = checksumAddress(`0x${keccak256(`0x${publicKey.substring(4)}`).substring(26)}`)
	return address.toLowerCase() === actualAddress.toLowerCase()
}

export class KeyManager {
	readonly id: string
	public readonly address: `0x${string}`
	private readonly privateKey: `0x${string}`

	constructor(id?: string | number) {
		id ??= Math.random()

		let mnemonic = generateMnemonic(wordlist)
		const keyFile = `keyPair_${id}.txt`
		if (fs?.existsSync(keyFile) === true) mnemonic = fs.readFileSync(keyFile, 'utf-8')
		else if (typeof localStorage !== 'undefined') {
			const localStorageItem = localStorage.getItem(keyFile)
			if (localStorageItem !== null) mnemonic = localStorageItem
		}

		if (typeof localStorage !== 'undefined') localStorage.setItem(keyFile, mnemonic)
		else if (typeof fs !== 'undefined') fs.writeFileSync(keyFile, mnemonic)

		this.id = String(id)
		const privateKeyBytes = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).privateKey
		if (privateKeyBytes === null) throw new Error('Failed to get private key')
		this.privateKey = `0x${Array.from(privateKeyBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')}`
		const publicKey = Hex.fromBytes(secp256k1.getPublicKey(this.privateKey.slice(2), false)).value
		this.address = checksumAddress(`0x${keccak256(`0x${publicKey.substring(4)}`).substring(26)}`)
	}

	sign = (message: string): `0x${string}` => sign(keccak256(toPrefixedMessage(message)), this.privateKey)
	verify = (signature: `0x${string}`, message: string, address: `0x${string}`): boolean => verify(address, message, new Hex(signature))
}
