import { KeyManager } from './classes/KeyManager'
import coinOracle from './oracles/oracle_Coin'
import nameServiceOracle from './oracles/oracle_NameService'
import demoOracle from './oracles/oracle_Demo'
import theRadicalParty from './oracles/oracle_TheRadicalParty'
import { start } from './oracle'

const keyManager = new KeyManager('client')

start(coinOracle, keyManager)
start(nameServiceOracle, keyManager)
start(demoOracle, keyManager)
start(theRadicalParty, keyManager)
