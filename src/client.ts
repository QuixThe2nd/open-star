import { KeyManager } from './classes/KeyManager'
import coinOracle from './oracles/Coin'
import nameServiceOracle from './oracles/NameService'
import demoOracle from './oracles/Demo'
import theRadicalParty from './oracles/TheRadicalParty'
import { start } from './oracle'

const keyManager = new KeyManager('client')

start(coinOracle, keyManager)
start(nameServiceOracle, keyManager)
start(demoOracle, keyManager)
start(theRadicalParty, keyManager)
