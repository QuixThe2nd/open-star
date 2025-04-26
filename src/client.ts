import { OpenStar } from ".";
import { CoinOracle } from './classes/oracle/Coin';
import { NameServiceOracle } from "./classes/oracle/NameService";
import { DemoOracle } from "./classes/oracle/Demo";
import { KeyManager } from "./classes/KeyManager";

const keyManager = new KeyManager()

const coin = new CoinOracle(keyManager)
new OpenStar<'coin', ReturnType<typeof coin.getState>, typeof coin.methods, typeof coin>(keyManager, coin)

const nameService = new NameServiceOracle(keyManager)
new OpenStar<'nameService', ReturnType<typeof nameService.getState>, typeof nameService.methods, typeof nameService>(keyManager, nameService)

const demo = new DemoOracle()
new OpenStar<'demo', ReturnType<typeof demo.getState>, typeof demo.methods, typeof demo>(keyManager, demo)

