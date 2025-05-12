import { hashString } from '../classes/KeyManager'
import type { ORC1Block, ORC1State } from '../types/ORC'
import type { MethodReturn } from '../types/Oracle'
import { OpenStar } from './OpenStar'

export class OpenStarRC1<OracleState extends ORC1State = ORC1State, OracleName extends `ORC1_${string}` = `ORC1_${string}`, OracleMethods extends Record<string, (arg: any) => MethodReturn> = Record<string, (arg: any) => MethodReturn>> extends OpenStar<OracleState, OracleName, OracleMethods> {
  protected override initializeExtended(): void {
    if (this.oracle.setOpenStar) this.oracle.setOpenStar(this)
  }

  getLatestBlock = () => { return this.oracle.state.value.blocks[this.oracle.state.value.blocks.length - 1] }

  createBlock() {
    const seed = Math.random()
    const hash = hashString((this.getLatestBlock()?.id ?? '0x') + String(seed))
    if (hash.startsWith('0x0')) this.call('addBlock', { transactions: [], id: hash, prev: this.getLatestBlock()?.id ?? '0x', seed })
  }

  addBlock(block: ORC1Block): string | void {
    console.log('Adding block', block)
    const latestBlock = this.getLatestBlock()
    if (!block.id.startsWith('0x0')) return 'Block difficulty too low'
    if (block.id === (latestBlock?.id ?? '0x')) return 'Block already known'
    if (block.prev !== (latestBlock?.id ?? '0x')) return 'Validate prev'
    if (block.id !== hashString((latestBlock ? latestBlock.id : '0x') + String(block.seed))) return 'Invalid hash'
    const newValue = this.oracle.state.value
    newValue.blocks.push(block)
    this.oracle.state.set(newValue)
    this.epoch()
  }
}
