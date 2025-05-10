import { strict as assert } from 'assert'
import { KeyManager } from '../classes/KeyManager'
import { StateManager } from '../classes/StateManager'
import { mode } from '../utils'
import type { NonEmptyArray } from '../types/generic'
import { OpenStar } from '../oracle/OpenStar'
import { test } from './tests'

export async function DemoTests() {
  const state = new StateManager({ number: 0 })
  const methods = {
    add: (args: { value: number, time: number }): string | void => {
      if (args.value <= 0) return 'Value must be positive'
      state.set({ number: state.value.number + args.value })
    },
    subtract: (args: { value: number, time: number }): string | void => {
      if (args.value <= 0) return 'Value must be positive'
      state.set({ number: state.value.number - args.value })
    }
  }
  const openStar = new OpenStar({
    name: 'TEST_DEMO',
    epochTime: 60000,
    state,
    methods,
    methodDescriptions: {
      add: { value: 0, time: 0 },
      subtract: { value: 0, time: 0 },
    },
    startupState: (peerStates: NonEmptyArray<typeof state.value>) => mode(peerStates)
  }, new KeyManager('demo-tests'))

  await test('DEMO', 'Initial state number should be zero', () => {
    assert.equal(openStar.oracle.state.value.number, 0)
  })

  await test('DEMO', 'Adding a positive value', () => {
    methods.add({ value: 10, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, 10)
  })

  await test('DEMO', 'Adding another positive value', () => {
    methods.add({ value: 5, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, 15)
  })

  await test('DEMO', 'Adding zero should return error message', () => {
    const result = methods.add({ value: 0, time: Date.now() })
    assert.equal(result, 'Value must be positive')
    assert.equal(openStar.oracle.state.value.number, 15)
  })

  await test('DEMO', 'Adding negative value should return error message', () => {
    const result = methods.add({ value: -5, time: Date.now() })
    assert.equal(result, 'Value must be positive')
    assert.equal(openStar.oracle.state.value.number, 15)
  })

  await test('DEMO', 'Subtracting a positive value', () => {
    methods.subtract({ value: 7, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, 8)
  })

  await test('DEMO', 'Subtracting another positive value', () => {
    methods.subtract({ value: 3, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, 5)
  })

  await test('DEMO', 'Subtracting zero should return error message', () => {
    const result = methods.subtract({ value: 0, time: Date.now() })
    assert.equal(result, 'Value must be positive')
    assert.equal(openStar.oracle.state.value.number, 5)
  })

  await test('DEMO', 'Subtracting negative value should return error message', () => {
    const result = methods.subtract({ value: -3, time: Date.now() })
    assert.equal(result, 'Value must be positive')
    assert.equal(openStar.oracle.state.value.number, 5)
  })

  await test('DEMO', 'Subtracting to negative number is allowed', () => {
    methods.subtract({ value: 10, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, -5)
  })
  
  await test('DEMO', 'Adding to bring back to positive', () => {
    methods.add({ value: 15, time: Date.now() })
    assert.equal(openStar.oracle.state.value.number, 10)
  })
}
