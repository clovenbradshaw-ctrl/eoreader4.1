// The EO contract registry — every module in the tree, spelled on all three faces.
// A projection of the per-holon manifests (src/<holon>/eo-contract.js), merged into one
// path -> contract map. This is the conformance surface: tests/contracts.test.js reads it
// to prove 100% coverage and cube coherence. See docs/eo-for-coders.md (Law 1).
import { CONTRACTS as answer } from '../answer/eo-contract.js';
import { CONTRACTS as arc } from '../arc/eo-contract.js';
import { CONTRACTS as archive } from '../archive/eo-contract.js';
import { CONTRACTS as audit } from '../audit/eo-contract.js';
import { CONTRACTS as chorus } from '../chorus/eo-contract.js';
import { CONTRACTS as classify } from '../classify/eo-contract.js';
import { CONTRACTS as converse } from '../converse/eo-contract.js';
import { CONTRACTS as core_ } from './eo-contract.js';
import { CONTRACTS as credence } from '../credence/eo-contract.js';
import { CONTRACTS as dag } from '../dag/eo-contract.js';
import { CONTRACTS as data } from '../data/eo-contract.js';
import { CONTRACTS as doc } from '../doc/eo-contract.js';
import { CONTRACTS as enact } from '../enact/eo-contract.js';
import { CONTRACTS as enactor } from '../enactor/eo-contract.js';
import { CONTRACTS as essay } from '../essay/eo-contract.js';
import { CONTRACTS as factcheck } from '../factcheck/eo-contract.js';
import { CONTRACTS as flow } from '../flow/eo-contract.js';
import { CONTRACTS as fold } from '../fold/eo-contract.js';
import { CONTRACTS as frame } from '../frame/eo-contract.js';
import { CONTRACTS as ground } from '../ground/eo-contract.js';
import { CONTRACTS as ingest } from '../ingest/eo-contract.js';
import { CONTRACTS as longgen } from '../longgen/eo-contract.js';
import { CONTRACTS as model } from '../model/eo-contract.js';
import { CONTRACTS as organs } from '../organs/eo-contract.js';
import { CONTRACTS as perceiver } from '../perceiver/eo-contract.js';
import { CONTRACTS as predict } from '../predict/eo-contract.js';
import { CONTRACTS as reader } from '../reader/eo-contract.js';
import { CONTRACTS as reason } from '../reason/eo-contract.js';
import { CONTRACTS as research } from '../research/eo-contract.js';
import { CONTRACTS as retrieve } from '../retrieve/eo-contract.js';
import { CONTRACTS as surfer } from '../surfer/eo-contract.js';
import { CONTRACTS as tasks } from '../tasks/eo-contract.js';
import { CONTRACTS as turn } from '../turn/eo-contract.js';
import { CONTRACTS as workspace } from '../workspace/eo-contract.js';
import { CONTRACTS as write } from '../write/eo-contract.js';

export const CONTRACTS = Object.freeze({ ...answer, ...arc, ...archive, ...audit, ...chorus, ...classify, ...converse, ...core_, ...credence, ...dag, ...data, ...doc, ...enact, ...enactor, ...essay, ...factcheck, ...flow, ...fold, ...frame, ...ground, ...ingest, ...longgen, ...model, ...organs, ...perceiver, ...predict, ...reader, ...reason, ...research, ...retrieve, ...surfer, ...tasks, ...turn, ...workspace, ...write });

export const contractOf = (repoRelPath) => CONTRACTS[repoRelPath] ?? null;
export const contractedPaths = () => Object.freeze(Object.keys(CONTRACTS).sort());
