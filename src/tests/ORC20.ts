import { strict as assert } from 'assert';
import { KeyManager } from '../classes/KeyManager';
import { StateManager } from '../classes/StateManager';
import { ORC20Oracle } from '../oracle/ORC20';
import { mode, parseEther } from '../utils';
import type { NonEmptyArray } from '../types/generic';
import type { ORC20State } from '../types/ORC20';
import { test, testResults } from './test';

export async function tests() {
  const openStar = new ORC20Oracle({
    name: 'TEST_COIN',
    epochTime: 5000,
    ORC20: { ticker: 'TEST' },
    state: new StateManager<ORC20State>({ balances: {} }),
    startupState: (peerStates: NonEmptyArray<ORC20State>) => mode(peerStates)
  }, new KeyManager('tests'));

  const alice: `0x${string}` = '0x1111111111111111111111111111111111111111';
  const bob: `0x${string}` = '0x2222222222222222222222222222222222222222';
  const charlie: `0x${string}` = '0x3333333333333333333333333333333333333333';
  
  
  await test('Initial circulating supply should be zero', () => assert.equal(openStar.circulatingSupply(), 0n));
  
  await test('Minting tokens to Alice', () => {
    openStar.mint({ to: alice, amount: parseEther(100).toHex() });
    assert.equal(BigInt(openStar.oracle.state.value.balances[alice] ?? '0x0'), parseEther(100));
  });
  
  await test('Circulating supply should increase after minting to Alice', () => assert.equal(openStar.circulatingSupply(), parseEther(100)));
  
  await test('Minting tokens to Bob', () => {
    openStar.mint({ to: bob, amount: parseEther(50).toHex() });
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? '0x0'), parseEther(50));
  });
  
  await test('Circulating supply should increase after minting to Bob', () => assert.equal(openStar.circulatingSupply(), parseEther(150)));
  
  await test('Transferring tokens from Alice to Charlie', async () => {
    const from = alice;
    const to = charlie;
    const amount = parseEther(25).toHex();
    assert.equal(openStar.transfer({ from, to, amount, signature: await openStar.keyManager.sign(JSON.stringify({ from, to, amount })) }), undefined);
    assert.equal(BigInt(openStar.oracle.state.value.balances[from] ?? `0x0`), parseEther(75));
    assert.equal(BigInt(openStar.oracle.state.value.balances[to] ?? `0x0`), parseEther(25));
  });
  
  await test('Transferring more tokens than balance should fail', async () => {
    const from = alice;
    const to = charlie;
    const amount = parseEther(100).toHex();
    assert.equal(openStar.transfer({ from, to, amount, signature: await openStar.keyManager.sign(JSON.stringify({ from, to, amount })) }), 'Balance too low');
    assert.equal(BigInt(openStar.oracle.state.value.balances[from] ?? `0x0`), parseEther(75));
    assert.equal(BigInt(openStar.oracle.state.value.balances[to] ?? `0x0`), parseEther(25));
  });
  
  await test('Burning some tokens from Bob', () => {
    assert.equal(openStar.burn({ to: bob, amount: parseEther(20).toHex() }), undefined);
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? `0x0`), parseEther(30));
  });
  
  await test('Burning all remaining tokens from Bob', () => {
    const result = openStar.burn({ to: bob, amount: parseEther(40).toHex() });
    assert.equal(result, undefined)
    assert.equal(BigInt(openStar.oracle.state.value.balances[bob] ?? `0x0`), 0n);
  });
  
  await test('Circulating supply should decrease after burning', () => assert.equal(openStar.circulatingSupply(), parseEther(100)));
  
  await test('Staking rate calculation', () => {
    Object.defineProperty(openStar, 'peerStates', {
      get: function() {
        return [alice, bob];
      }
    });
    assert.equal(openStar.stakingRate(), 0.75);
  });
}

await tests();

console.log(`\n--- Test Results ---`);
console.log(`${testResults.passed} passed, ${testResults.failed} failed`);

process.exit(testResults.failed > 0 ? 1 : 0);