export const testResults = {
  passed: 0,
  failed: 0,
}

export function test(name: string, fn: () => Promise<void> | void) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`);
        testResults.passed++;
      }).catch((error: unknown) => {
        console.error(`✗ ${name}\n  ${error instanceof Error ? error.message : error}`);
        testResults.failed++;
      });
    } else {
      console.log(`✓ ${name}`);
      testResults.passed++;
    }
  } catch (error) {
    console.error(`✗ ${name}\n  ${error instanceof Error ? error.message : error}`);
    testResults.failed++;
  }
  return
}