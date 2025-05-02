import startCoinOracle from './classes/oracle/Coin';
import startNameServiceOracle from "./classes/oracle/NameService";
import startDemoOracle from "./classes/oracle/Demo";
import { KeyManager } from './classes/KeyManager';

const keyManager = await KeyManager.init(Math.random())

startCoinOracle(keyManager)
startNameServiceOracle(keyManager)
startDemoOracle(keyManager)
