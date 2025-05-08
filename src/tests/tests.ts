import { ORC20Tests } from "./ORC20";
import { DemoTests } from "./Demo";
import { testResults } from "./test";

await ORC20Tests();
await DemoTests();

console.log(`\n--- Test Results ---`);
console.log(`${testResults.passed} passed, ${testResults.failed} failed`);

process.exit(testResults.failed > 0 ? 1 : 0);