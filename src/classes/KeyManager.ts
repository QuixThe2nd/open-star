import { mnemonicToAccount, generateMnemonic } from 'viem/accounts';
import { verifyMessage } from 'viem/utils';
import * as fs from 'fs/promises';
import type { Hex } from 'viem';
import { wordlist } from '@scure/bip39/wordlists/english';

export class KeyManager {
  private readonly keyFile = `keyPair_${Math.random()/* > 0.5 ? 1 : 2*/}.json`;
  private mnemonic!: string;
  private account!: ReturnType<typeof mnemonicToAccount>;

  private constructor() {}

  static async init(): Promise<KeyManager> {
    const keyManager = new KeyManager();
    if (await fs.exists(keyManager.keyFile)) {
      const file = await fs.readFile(keyManager.keyFile, 'utf-8');
      const { mnemonic } = JSON.parse(file);
      await keyManager.loadFromMnemonic(mnemonic);
    } else {
      await keyManager.generateAndSaveKeyPair();
    }
    return keyManager;
  }

  private async generateAndSaveKeyPair(): Promise<void> {
    const mnemonic = generateMnemonic(wordlist); // 12-word BIP-39 mnemonic
    await this.loadFromMnemonic(mnemonic);
    await fs.writeFile(this.keyFile, JSON.stringify({ mnemonic }, null, 2));
  }

  private async loadFromMnemonic(mnemonic: string): Promise<void> {
    const account = mnemonicToAccount(mnemonic);
    this.mnemonic = mnemonic;
    this.account = account;
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
