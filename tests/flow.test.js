import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  OPERATORS, loadPrior, trajectoryFromDoc, scoreTrajectory, flowVerdict, arcTarget,
} from '../src/flow/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { witness } from '../src/write/witness.js';
import { exportAudit } from '../src/longgen/audit.js';
import { arcPhaseTarget } from '../src/longgen/shape.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prior = loadPrior(readFileSync(join(root, 'data/flow-prior.json'), 'utf8'));
// A real, long-enough document to trace an arc through (the full Metamorphosis).
const doc = parseText(readFileSync(join(root, 'pg5200.txt'), 'utf8'));

test('prior loads with the shape the scorer expects', () => {
  assert.equal(prior.meta && typeof prior.meta.books, 'number');
  assert.equal(prior.steps, prior.arcMean.length);
  assert.equal(prior.arcKeys.length, 12);
  assert.ok(prior.comps.length >= 1 && prior.comps[0].length === prior.mean.length);
});

test('trajectoryFromDoc yields fixed-count 102-dim steps from a live parse', () => {
  const { steps, nSent } = trajectoryFromDoc(doc, 40);
  assert.equal(steps.length, 40);
  assert.equal(steps[0].length, 102);
  assert.ok(nSent > 100, `expected a long doc, got ${nSent} sentences`);
});

test('scoreTrajectory reports finite flow / residual / arc numbers in range', () => {
  const { steps } = trajectoryFromDoc(doc, 40);
  const r = scoreTrajectory(prior, steps);
  assert.ok(Number.isFinite(r.flowScore) && r.flowScore >= 0);
  assert.ok(r.flowPercentile >= 5 && r.flowPercentile <= 95);
  assert.ok(Number.isFinite(r.meanResidual) && Number.isFinite(r.meanArcAdherence));
  assert.equal(r.steps.length, 40);
  assert.equal(r.steps[0].delta, undefined);      // step 0 has no predecessor
  assert.ok(typeof r.steps[1].delta === 'number');
});

test('flowVerdict runs the incremental (paragraph-at-a-time) path', () => {
  const v = flowVerdict(prior, null, doc, { perSentences: 12 });
  assert.ok(v && Number.isFinite(v.manifoldResidual));
  assert.ok(v.residualPercentile >= 5 && v.residualPercentile <= 95);
  assert.equal(typeof v.ok, 'boolean');
  assert.equal(v.delta, undefined);               // no prevStep ⇒ no delta

  // with a previous step, delta + its percentile appear
  const { steps } = trajectoryFromDoc(doc, { perSentences: 12 });
  const withPrev = flowVerdict(prior, steps[steps.length - 2], doc, { perSentences: 12 });
  assert.ok(typeof withPrev.delta === 'number');
  assert.ok(withPrev.deltaPercentile >= 5 && withPrev.deltaPercentile <= 95);
});

test('flowVerdict / arcTarget are null-safe when no prior is wired', () => {
  assert.equal(flowVerdict(null, null, doc), null);
  assert.equal(flowVerdict(prior, null, null), null);
  assert.equal(arcTarget(null, 0.5), null);
});

test('arcTarget returns the corpus-typical cumulative state per feature', () => {
  const target = arcTarget(prior, 0.5);
  assert.deepEqual(Object.keys(target).sort(), [...prior.arcKeys].sort());
  for (const k of prior.arcKeys) {
    assert.ok(Number.isFinite(target[k].mean) && Number.isFinite(target[k].sd));
  }
  // early vs late: new-entity introduction (ent_dens) trends down across the arc.
  const early = arcTarget(prior, 0.05).ent_dens.mean;
  const late = arcTarget(prior, 0.95).ent_dens.mean;
  assert.ok(early >= late, `ent_dens should not rise across the arc (early ${early} vs late ${late})`);
});

test('shape.arcPhaseTarget maps a phase position to the arc target', () => {
  assert.equal(arcPhaseTarget(null, {}), null);                       // off by default
  const open = arcPhaseTarget(prior, { remainingFrac: 1 });           // t = 0
  const land = arcPhaseTarget(prior, { remainingFrac: 0 });           // t = 1
  assert.ok(open && land && 'ent_dens' in open && 'coref' in land);
});

test('witness: flow is null by default and does not change the veto verdict', () => {
  const fold = { refs: new Map() };
  const base = witness('The clerk climbed the stairs.', new Set(), [], fold);
  assert.equal(base.flow, null);

  const wired = witness('The clerk climbed the stairs.', new Set(), [], fold,
    { flow: { prior, prevStep: null, doc } });
  assert.ok(wired.flow && Number.isFinite(wired.flow.manifoldResidual));
  assert.equal(wired.ok, base.ok);   // flow is surfaced, never a hard fail
});

test('audit: the flow report ships beside diagnose(), and only when wired', () => {
  const result = { units: [], trace: [] };
  const plain = exportAudit(result, {});
  assert.equal(plain.flow, undefined);

  const withFlow = exportAudit(result, { flow: { prior, doc } });
  assert.ok(withFlow.flow && Number.isFinite(withFlow.flow.flowScore));
  assert.ok(Array.isArray(withFlow.flow.lurches));
  assert.ok(withFlow.checks, 'diagnose still runs');   // flow rides beside, not over

  // a pre-scored report is passed through untouched
  const pre = exportAudit(result, { flow: { flowScore: 0.123, flowPercentile: 40 } });
  assert.equal(pre.flow.flowScore, 0.123);
});

test('OPERATORS is the 9-operator alphabet the prior was built on', () => {
  assert.equal(OPERATORS.length, 9);
  assert.ok(OPERATORS.includes('CON') && OPERATORS.includes('REC'));
});
