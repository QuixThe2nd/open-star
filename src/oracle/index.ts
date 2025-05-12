import type { ORC1State, ORC20State } from '..'
import type { KeyManager } from '../classes/KeyManager'
import type { ORC1Oracle, ORC20Oracle, Oracle } from '../types/Oracle'
import { OpenStar } from './OpenStar'
import { OpenStarRC1 } from './OpenStarRC1'
import { OpenStarRC20 } from './OpenStarRC20'

export const start = (oracle: ORC1Oracle<ORC1State, `ORC1_${string}`> | ORC20Oracle<ORC20State, `ORC20_${string}`> | Oracle, keyManager?: KeyManager) => 'ORC1' in oracle ? new OpenStarRC1(oracle, keyManager) : 'ORC20' in oracle ? new OpenStarRC20(oracle, keyManager) : new OpenStar(oracle, keyManager)
