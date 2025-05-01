import { mnemonicToAccount, generateMnemonic } from 'viem/accounts';
import { verifyMessage } from 'viem/utils';
import type { Hex } from 'viem';
import { wordlist } from '@scure/bip39/wordlists/english';
const fs = typeof window === 'undefined' ? await import('fs') : undefined

export class KeyManager {
  private mnemonic!: string;
  private account!: ReturnType<typeof mnemonicToAccount>;
  readonly id: string

  get keyFile(): string {
    return `keyPair_${this.id}.json`;
  }

  constructor(id: string | number = '') {
    this.id = String(id)
    const keyFile = this.keyFile
    
    if (typeof fs !== 'undefined' && fs.existsSync(keyFile)) {
      const file = fs.readFileSync(keyFile, 'utf-8')
      const { mnemonic } = JSON.parse(file) as { mnemonic: string }
      this.loadFromMnemonic(mnemonic)
    } else {
      const storageKey = `key_${this.id}`
      const storedMnemonic = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
      
      if (storedMnemonic) {
        this.loadFromMnemonic(storedMnemonic)
      } else {
        const mnemonic = generateMnemonic(wordlist)
        this.loadFromMnemonic(mnemonic)
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(storageKey, mnemonic)
        } else if (typeof fs !== 'undefined') {
          fs.writeFileSync(keyFile, JSON.stringify({ mnemonic }, null, 2))
        }
      }
    }
  }

  private loadFromMnemonic(mnemonic: string): void {
    this.mnemonic = mnemonic;
    this.account = mnemonicToAccount(mnemonic);
  }

  async sign(message: string): Promise<Hex> {
    return await this.account.signMessage({ message });
  }

  async verify(signature: Hex, message: string, address: Hex): Promise<boolean> {
    return await verifyMessage({
      address,
      message,
      signature,
    });
  }

  getPublicKey(): Hex {
    return this.account.address;
  }

  getMnemonic(): string {
    return this.mnemonic;
  }
}
