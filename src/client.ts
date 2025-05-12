import { KeyManager, start } from '.'
import blockchain from '../oracles/oracle_Blockchain'
import coinOracle from '../oracles/oracle_Coin'
import demoOracle from '../oracles/oracle_Demo'
import nameServiceOracle from '../oracles/oracle_NameService'
import theRadicalParty from '../oracles/oracle_TheRadicalParty'

const keyManager = new KeyManager('client')

start(coinOracle, keyManager)
start(nameServiceOracle, keyManager)
start(demoOracle, keyManager)
start(theRadicalParty, keyManager)
start(blockchain, keyManager)
