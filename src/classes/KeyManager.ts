import { privateKeyToAccount, generateMnemonic, sign } from 'viem/accounts';
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { toPrefixedMessage, type PrivateKeyAccount } from 'viem';
import { keccak256, verifyMessage } from 'viem/utils';
import { wordlist } from '@scure/bip39/wordlists/english';

export class KeyManager {
  private account: PrivateKeyAccount;
  readonly id: string
  private readonly privateKey: `0x${string}`

  private constructor(id: string | number, mnemonic: string) {
    this.id = String(id)
    const seed = mnemonicToSeedSync(mnemonic)
    const privateKeyBytes = HDKey.fromMasterSeed(seed).privateKey!
    this.privateKey = `0x${Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
    this.account = privateKeyToAccount(this.privateKey);
  }

  static init = async (id: string | number = '') => {
    if (!id) id = Math.random()
    const fs = typeof window === 'undefined' ? await import('fs') : undefined

    const keyFile = `keyPair_${id}.json`
    if (fs && fs.existsSync(keyFile)) return new KeyManager(id, (JSON.parse(fs.readFileSync(keyFile, 'utf-8')) as { mnemonic: string }).mnemonic)
    else if (typeof localStorage !== 'undefined' && localStorage.getItem(keyFile) !== null) return new KeyManager(id, localStorage.getItem(keyFile)!)
    else {
      const mnemonic = generateMnemonic(wordlist)
      if (typeof localStorage !== 'undefined') localStorage.setItem(keyFile, mnemonic)
      else if (typeof fs !== 'undefined') fs.writeFileSync(keyFile, JSON.stringify({ mnemonic }, null, 2))
      return new KeyManager(id, mnemonic)
    }
  }

  sign = (message: string): Promise<`0x${string}`> => sign({ hash: keccak256(toPrefixedMessage(message), 'hex'), privateKey: this.privateKey, to: 'hex' })
  verify = (signature: `0x${string}`, message: string, address: `0x${string}`): Promise<boolean> => verifyMessage({ address, message, signature });
  getPublicKey = () => this.account.address;
}
