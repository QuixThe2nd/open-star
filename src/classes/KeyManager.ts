import { mnemonicToAccount, generateMnemonic } from 'viem/accounts';
import { verifyMessage } from 'viem/utils';
import * as fs from 'fs';
import type { Hex } from 'viem';
import { wordlist } from '@scure/bip39/wordlists/english';

export class KeyManager {
  private readonly keyFile = `keyPair_${Math.random()/* > 0.5 ? 1 : 2*/}.json`;
  private mnemonic!: string;
  private account!: ReturnType<typeof mnemonicToAccount>;

  constructor() {
    if (fs.existsSync(this.keyFile)) {
      const file = fs.readFileSync(this.keyFile, 'utf-8');
      const { mnemonic } = JSON.parse(file) as { mnemonic: string };
      this.loadFromMnemonic(mnemonic);
    } else {
      const mnemonic = generateMnemonic(wordlist); // 12-word BIP-39 mnemonic
      this.loadFromMnemonic(mnemonic);
      fs.writeFileSync(this.keyFile, JSON.stringify({ mnemonic }, null, 2));
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
