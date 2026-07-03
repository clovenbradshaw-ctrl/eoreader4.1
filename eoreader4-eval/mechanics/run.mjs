// Mechanics Test Battery runner. Assembles the valid scorecard env (CPU LLM + MiniLM
// organ live), runs the selected suites, prints PASS/FAIL/INCONCLUSIVE per test with
// the introspected evidence each rubric keys on, and a final tally.
import { makeEnv } from './harness.mjs';
import { printRow } from './util.mjs';

const which = (process.argv[2] || 'ABCD').toUpperCase();
const env = await makeEnv();
console.log(`\n████ eoreader4 — Mechanics Test Battery ████`);
console.log(`validity: ${env.validity}\n`);

const all = [];
if (which.includes('A')) all.push(...await (await import('./suite-a.mjs')).runSuiteA(env));
if (which.includes('B')) all.push(...await (await import('./suite-b.mjs')).runSuiteB(env));
if (which.includes('C')) all.push(...await (await import('./suite-c.mjs')).runSuiteC(env));
if (which.includes('D')) all.push(...await (await import('./suite-d.mjs')).runSuiteD(env));

for (const r of all) printRow(r);

const tally = { PASS: 0, FAIL: 0, INCONCLUSIVE: 0 };
for (const r of all) tally[r.verdict]++;
console.log(`\n════ TALLY ════`);
console.log(`  PASS:         ${tally.PASS}`);
console.log(`  FAIL:         ${tally.FAIL}`);
console.log(`  INCONCLUSIVE: ${tally.INCONCLUSIVE}`);
console.log(`  total:        ${all.length}\n`);
