import { ORC20Tests } from "./ORC20"
import { DemoTests } from "./Demo"

const testResults: {
  [test: string]: {
    passed: number,
    failed: number
  }
} = {}

export function test(test: string, name: string, fn: () => Promise<void> | void) {
  testResults[test] ??= { passed: 0, failed: 0 }
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`)
        if(testResults[test]) testResults[test].passed++
      }).catch((error: unknown) => {
        console.error(`✗ ${name}\n  ${error instanceof Error ? error.message : error}`)
        if(testResults[test]) testResults[test].failed++
      })
    } else {
      console.log(`✓ ${name}`)
      testResults[test].passed++
    }
  } catch (error) {
    console.error(`✗ ${name}\n  ${error instanceof Error ? error.message : error}`)
    testResults[test].failed++
  }
  return
}

await DemoTests()
await ORC20Tests()

let failed = 0
console.log(`\n--- Test Results ---`)
Object.keys(testResults).forEach(test => {
  const results = testResults[test]
  if (!results) return
  console.log(`${test}: ${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) failed = 1
})

process.exit(failed)