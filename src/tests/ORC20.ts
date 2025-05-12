import { strict as assert } from 'assert'
import { KeyManager } from '../classes/KeyManager'
import { StateManager } from '../classes/StateManager'
import { mode, parseEther } from '../utils'
import type { NonEmptyArray } from '../types/generic'
import type { ORC20State } from '../types/ORC'
import { test } from './tests'
import { OpenStarRC20 } from '../openstar'

export async function ORC20Tests() {
  const openStar = new OpenStarRC20({
    name: 'ORC20_TEST',
    epochTime: 5000,
    state: new StateManager<ORC20State>({ balances: {} }),
    startupState: (peerStates: NonEmptyArray<ORC20State>) => mode(peerStates)
  }, new KeyManager('tests'))

  const alice: `0x${string}` = '0x1111111111111111111111111111111111111111'
  const bob: `0x${string}` = '0x2222222222222222222222222222222222222222'
  const charlie: `0x${string}` = '0x3333333333333333333333333333333333333333'
  
  
  await test('ORC20', 'Initial circulating supply should be zero', () => assert.equal(openStar.circulatingSupply(), 0n))
  
  await test('ORC20', 'Minting tokens to Alice', () => {
    openStar.mint({ to: alice, amount: parseEther(100).toHex().value })
    assert.equal(BigInt(openStar.oracle.state.value.balances[alice] ?? '0x0'), parseEther(100))
  })
  
  await test('ORC20', 'Circulating supply should increase after minting to Alice', () => assert.equal(openStar.circulatingSupply(), parseEther(100)))
  
  await test('ORC20', 'Minting tokens to Bob', () => {
    openStar.mint({ to: bob, amount: parseEther(50).toHex().value })
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? '0x0'), parseEther(50))
  })
  
  await test('ORC20', 'Circulating supply should increase after minting to Bob', () => assert.equal(openStar.circulatingSupply(), parseEther(150)))
  
  await test('ORC20', 'Transferring tokens from Alice to Charlie', () => {
    const from = alice
    const to = charlie
    const amount = parseEther(25).toHex().value
    assert.equal(openStar.transfer({ from, to, amount, signature: openStar.keyManager.sign(JSON.stringify({ from, to, amount })) }), undefined)
    assert.equal(BigInt(openStar.oracle.state.value.balances[from] ?? `0x0`), parseEther(75))
    assert.equal(BigInt(openStar.oracle.state.value.balances[to] ?? `0x0`), parseEther(25))
  })
  
  await test('ORC20', 'Transferring more tokens than balance should fail', () => {
    const from = alice
    const to = charlie
    const amount = parseEther(100).toHex().value
    assert.equal(openStar.transfer({ from, to, amount, signature: openStar.keyManager.sign(JSON.stringify({ from, to, amount })) }), 'Balance too low')
    assert.equal(BigInt(openStar.oracle.state.value.balances[from] ?? `0x0`), parseEther(75))
    assert.equal(BigInt(openStar.oracle.state.value.balances[to] ?? `0x0`), parseEther(25))
  })
  
  await test('ORC20', 'Burning some tokens from Bob', () => {
    assert.equal(openStar.burn({ to: bob, amount: parseEther(20).toHex().value }), undefined)
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? `0x0`), parseEther(30))
  })
  
  await test('ORC20', 'Burning all remaining tokens from Bob', () => {
    const result = openStar.burn({ to: bob, amount: parseEther(40).toHex().value })
    assert.equal(result, undefined)
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? `0x0`), 0n)
  })
  
  await test('ORC20', 'Circulating supply should decrease after burning', () => assert.equal(openStar.circulatingSupply(), parseEther(100)))
  
  await test('ORC20', 'Staking rate calculation', () => {
    Object.defineProperty(openStar, 'peerStates', {
      get: function() {
        return [alice, bob]
      }
    })
    assert.equal(openStar.stakingRate(), 0.75)
  })
}
