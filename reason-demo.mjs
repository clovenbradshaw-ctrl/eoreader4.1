// reason-demo.mjs — run from the repo root: `node reason-demo.mjs`
// Lays down a tiny corpus through the perceiver door, runs the reasoning walk, and prints the
// annotated trace: each committed step, its operator, its grade, whether it built on the walk's
// own output, and the surprise that drove it. No model, no network.

import { createLog } from './src/core/log.js';
import { walkReasoning, seedCorpus } from './src/reason/index.js';

const CORPUS = [
  { op: 'INS', id: 'a', label: 'Acme' },
  { op: 'INS', id: 'b', label: 'Bob' },
  { op: 'INS', id: 'c', label: 'Corp' },
  { op: 'INS', id: 'd', label: 'Dana' },
  { op: 'INS', id: 'e', label: 'Eve' },
  { op: 'CON', src: 'a', dst: 'b', via: 'employs' },
  { op: 'CON', src: 'c', dst: 'd', via: 'employs' },
  { op: 'CON', src: 'a', dst: 'c', via: 'partners' },
];

const GRADE_MARK = {
  'grounded': '[GROUNDED   ]',
  'warranted-ungrounded': '[WARRANTED  ]',
  'idle-ungrounded': '[IDLE       ]',
};

const log = createLog({ docId: 'demo' });
seedCorpus(log, CORPUS);
const corpusLen = log.length;

const r = await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });

console.log(`\ncorpus: ${corpusLen} events (perceiver door — can witness)\n`);
console.log(`walk: ${r.steps.length} committed steps, quiesced=${r.quiesced}\n`);
for (const s of r.steps) {
  const self = s.builtOnSelf ? ' ↺ built-on-self' : '';
  const wit = s.canWitness ? 'CAN-WITNESS(!)' : 'cannot-witness';
  console.log(`  #${String(s.i).padStart(2)} ${s.op}  ${GRADE_MARK[s.grade]}  bits=${s.bits}  (${wit})${self}`);
  console.log(`       ${s.note}`);
}
console.log(`\ngrades: ${JSON.stringify(r.gradeCounts)}`);
console.log(`grounded fraction (the two-tone ratio): ${r.groundedFraction}`);
console.log(`every step is mine (the firewall holds): ${r.everyStepIsMine}`);
console.log(`stopped because: ${r.saturationTrace.at(-1).reason}\n`);
