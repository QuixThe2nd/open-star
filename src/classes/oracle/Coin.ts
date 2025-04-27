import { parseEther, type Hex } from 'viem';
import { KeyManager, mode, OpenStar, sortObjectByKeys, type Methods, type PeerStates } from '../..';

type State = { [pubKey: string]: Hex }
type Transfer = { from: Hex, to: Hex, amount: `0x${string}`, time: number, signature: Hex }

interface CoinMethods extends Methods {
  mint: (_args: { to: Hex, amount: `0x${string}` }) => void | string;
  burn: (_args: { to: Hex, amount: `0x${string}` }) => void | string;
  transfer: (_args: Transfer) => Promise<void | string>;
}

function calculateBlockYield(epochTime: number, state: State, peerStates: PeerStates<State>): number {
  let supply = 0n
  Object.keys(state).forEach(peer => {
    supply += BigInt(state[peer as keyof PeerStates<State>]!)
  })
  let coinsStaked = 0n
  Object.keys(peerStates).forEach(peer => {
    coinsStaked += BigInt(state[peer as keyof PeerStates<State>] ?? '0x0')
  })

  const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
  const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
  return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
}

const start = (keyManager: KeyManager): OpenStar<'COIN', State, CoinMethods, Transfer[]> => {
  const openStar = new OpenStar<'COIN', State, CoinMethods, Transfer[]>('COIN', {
    keyManager,
    mempool: [],
    peerStates: {},
    state: {},
    async startupState(): Promise<State> {
      let mostCommonState = undefined
      while (mostCommonState == undefined) {
        await new Promise((res) => setTimeout(res, 100))
        mostCommonState = mode(Object.values(this.peerStates).map(state => state.lastReceive))
      }
      this.state = mostCommonState
      return this.state
    },
    reputationChange(reputation, epochTime: number): void{
      const blockYield = calculateBlockYield(epochTime, this.state, this.peerStates)
      
      let netReputation = 0;
      for (const _peer in reputation) {
        const peer = _peer as keyof PeerStates<State>
        const state = this.peerStates[peer]!
        if (state.reputation === null) {
          delete this.peerStates[peer]
          return
        }
        netReputation += state.reputation;
        if (state.reputation > 0) {
          console.log('[COIN] Rewarding', peer.slice(0, 8) + '...')
          this.methods['mint']({ to: peer, amount: `0x${(this.state[peer] ? BigInt(Math.floor(Number(this.state[peer])*blockYield)).toString(16) : parseEther('1')).toString(16)}` });
        } else if (state.reputation < 0 && this.state[peer]) {
          console.log('[COIN] Slashing', peer.slice(0, 8) + '...')
          this.methods['burn']({ to: peer, amount: `0x${((BigInt(this.state[peer])*9n)/10n).toString(16)}` })
        }
        state.reputation = null
      }
      if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
      this.methods['mint']({ to: keyManager.getPublicKey(), amount: `0x${(this.state[keyManager.getPublicKey()] ? BigInt(Math.floor(Number(this.state[keyManager.getPublicKey()])*blockYield)).toString(16) : parseEther('1')).toString(16)}` })
      
      this.mempool = []
    },
    async call<T extends keyof CoinMethods>(method: T, _args: Parameters<CoinMethods[T]>[0]): Promise<void> {
      if (method === 'transfer') {
        const args = _args as Parameters<CoinMethods['transfer']>[0]
        if (!this.mempool.some(tx => tx.signature === args.signature)) {
          this.mempool.push(args)
          openStar.sendMessage([ 'COIN', 'call', method, args ]).catch(console.error)
          await this.methods['transfer'](args)
        }
      }
    },
    methods: {
      mint(args: Parameters<CoinMethods['mint']>[0]): ReturnType<CoinMethods['mint']> {
        const to = args.to
        const amount = args.amount

        openStar.oracle.state[to] ??= `0x0`
        openStar.oracle.state[to] = `0x${(BigInt(openStar.oracle.state[to]) + BigInt(amount)).toString(16)}`

        openStar.oracle.state = sortObjectByKeys(openStar.oracle.state)
      },
      burn(args: Parameters<CoinMethods['burn']>[0]): ReturnType<CoinMethods['burn']> {
        const to = args.to
        const amount = args.amount

        if (!openStar.oracle.state[to]) return 'Address does not exist'
        if (openStar.oracle.state[to] < amount) openStar.oracle.state[to] = `0x0`
        else openStar.oracle.state[to] = `0x${(BigInt(openStar.oracle.state[to]) + BigInt(amount)).toString(16)}`
      },
      async transfer(args: Parameters<CoinMethods['transfer']>[0]): ReturnType<CoinMethods['transfer']> {
        const from = args.from
        const to = args.to
        const amount = args.amount
        const time = args.time
        const signature = args.signature

        if (!openStar.oracle.state[from]) return 'No balance'
        if (openStar.oracle.state[from] < amount) return 'Balance too low'
        if (time + 5_000 < +new Date()) return 'Transaction from past epoch'
        if (!await keyManager.verify(signature, JSON.stringify({ from, to, amount, time }), from)) return 'Invalid signature'

        openStar.oracle.state[from] = `0x${(BigInt(openStar.oracle.state[from]) - BigInt(amount)).toString(16)}`
        openStar.oracle.state[to] ??= `0x0`
        openStar.oracle.state[to] += amount

        openStar.oracle.state = sortObjectByKeys(openStar.oracle.state)

        console.log(`[COIN] Transferred ${amount} from ${from} to ${to}`)
      }
    }
  })
  return openStar
}

export default start