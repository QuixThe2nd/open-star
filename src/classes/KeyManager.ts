import { privateKeyToAccount, generateMnemonic, sign } from 'viem/accounts';
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { toPrefixedMessage, type PrivateKeyAccount } from 'viem';
import { keccak256, verifyMessage } from 'viem/utils';
import { wordlist } from '@scure/bip39/wordlists/english';

export class KeyManager {
  private readonly account: PrivateKeyAccount;
  readonly id: string
  private readonly privateKey: `0x${string}`

  private constructor(id: string | number, mnemonic: string) {
    this.id = String(id)
    const seed = mnemonicToSeedSync(mnemonic)
    const privateKeyBytes = HDKey.fromMasterSeed(seed).privateKey
    if (privateKeyBytes === null) throw new Error('Failed to get private key')
    this.privateKey = `0x${Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
    this.account = privateKeyToAccount(this.privateKey);
  }

  static init = async (id?: string | number) => {
    id ??= Math.random()
    const fs = typeof window === 'undefined' ? await import('fs') : undefined

    const keyFile = `keyPair_${id}.txt`
    if ((fs?.existsSync(keyFile)) === true) return new KeyManager(id, fs.readFileSync(keyFile, 'utf-8'))
    if (typeof localStorage !== 'undefined') {
      const localStorageItem = localStorage.getItem(keyFile)
      if (localStorageItem !== null) return new KeyManager(id, localStorageItem)
    }

    const mnemonic = generateMnemonic(wordlist)
    if (typeof localStorage !== 'undefined') localStorage.setItem(keyFile, mnemonic)
    else if (typeof fs !== 'undefined') fs.writeFileSync(keyFile, mnemonic)
    return new KeyManager(id, mnemonic)
  }

  sign = async (message: string): Promise<`0x${string}`> => sign({ hash: keccak256(toPrefixedMessage(message), 'hex'), privateKey: this.privateKey, to: 'hex' })
  verify = async (signature: `0x${string}`, message: string, address: `0x${string}`): Promise<boolean> => verifyMessage({ address, message, signature });
  get address(){
    return this.account.address;
  }
}
