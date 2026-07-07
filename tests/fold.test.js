import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildFoldPrompt, build_prompt, foldBestOfN, arcGapMove, liveThreads,
  flowScorer, OP_DIRECTIVES, SYSTEM_FOLD,
} from '../src/longgen/index.js';
import { loadPrior, arcTarget, arcState } from '../src/flow/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createFold } from '../src/write/fold.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prior = loadPrior(readFileSync(join(root, 'data/flow-prior.json'), 'utf8'));

// A 109-dim step whose graph block equals the arc target at `t`, then perturbed on one
// feature — so a single named gap dominates and names the move deterministically.
const stepAtTarget = (t, tweaks = {}) => {
  const target = arcTarget(prior, t);
  const step = new Float64Array(109);
  prior.arcKeys.forEach((k, j) => { step[90 + j] = target[k].mean; });
  for (const [k, sd] of Object.entries(tweaks)) {
    const j = prior.arcKeys.indexOf(k);
    if (j >= 0) step[90 + j] = target[k].mean + sd * target[k].sd;
  }
  return step;
};

test('arcState reads the graph block keyed like arcTarget', () => {
  const t = 0.5;
  const step = stepAtTarget(t);
  const st = arcState(prior, step);
  assert.deepEqual(Object.keys(st).sort(), [...prior.arcKeys].sort());
  for (const k of prior.arcKeys) assert.ok(Math.abs(st[k] - arcTarget(prior, t)[k].mean) < 1e-9);
  assert.equal(arcState(null, step), null);
  assert.equal(arcState(prior, null), null);
});

test('arcGapMove falls to the phase baseline with no prior/step (cold start)', () => {
  const open = arcGapMove({ phase: 'open' });
  assert.equal(open.op, 'DEF');
  assert.equal(open.derived, false);
  assert.equal(arcGapMove({ phase: 'develop' }).op, 'CON');
  assert.equal(arcGapMove({ phase: 'land' }).op, 'SYN');
});

test('arcGapMove derives CON when relation-density is below the arc schedule', () => {
  const step = stepAtTarget(0.5, { rel_dens: -3 });   // relations well below expectation
  const m = arcGapMove({ prior, step, t: 0.5 });
  assert.equal(m.op, 'CON');
  assert.equal(m.derived, true);
  assert.equal(m.phase, 'develop');
  assert.ok(m.z.rel_dens < -2, 'the gap is reported');
});

test('arcGapMove derives SYN when the piece is still introducing late', () => {
  const step = stepAtTarget(0.85, { ent_dens: +3, generate: -2 });
  const m = arcGapMove({ prior, step, t: 0.85 });
  assert.equal(m.op, 'SYN');
  assert.equal(m.phase, 'land');
});

test('arcGapMove derives INS when nothing fresh is in play early', () => {
  const step = stepAtTarget(0.08, { ent_dens: -3, def_dens: +1 });
  const m = arcGapMove({ prior, step, t: 0.08 });
  assert.equal(m.op, 'INS');
  assert.equal(m.phase, 'open');
});

test('liveThreads reads a plain node/edge graph — in play, unrelated, dangling', () => {
  const graph = {
    nodes: ['Civicity', 'the donation', 'the MOU deferral', 'the mayor'],
    edges: [{ a: 'the donation', b: 'the mayor' }],
  };
  const th = liveThreads(graph);
  assert.deepEqual(th.inPlay.slice().sort(), ['Civicity', 'the MOU deferral', 'the donation', 'the mayor'].sort());
  assert.ok(th.unrelated.includes('Civicity') && th.unrelated.includes('the MOU deferral'));
  assert.ok(!th.unrelated.includes('the mayor'), 'a related node is not unrelated');
  assert.ok(th.dangling.includes('Civicity'), 'the earliest untouched thread is dangling');
  assert.equal(th.relations.length, 1);
});

test('liveThreads reads a write/fold.js fold (refs + frontier)', () => {
  const fold = createFold();
  const a = fold.mint({ head: 'Civicity' });
  const b = fold.mint({ head: 'the mayor' });
  fold.appear(a); fold.appear(b);
  const th = liveThreads(fold);
  assert.ok(th.inPlay.includes('Civicity') && th.inPlay.includes('the mayor'));
  assert.equal(th.unrelated.length, th.inPlay.length, 'a fold carries no edges — everything is unrelated');
});

test('liveThreads never throws on an unknown or empty graph', () => {
  assert.deepEqual(liveThreads(null), { inPlay: [], unrelated: [], dangling: [], relations: [] });
  assert.deepEqual(liveThreads(42).inPlay, []);
  assert.deepEqual(liveThreads({ junk: true }).inPlay, []);
});

test('buildFoldPrompt emits the two-message fold; no operator jargon leaks', () => {
  const graph = { nodes: ['the donation', 'the MOU deferral'], edges: [] };
  const built = buildFoldPrompt({
    prior, prevStep: stepAtTarget(0.5, { rel_dens: -3 }), t: 0.5, graph,
    register: 'contemporary investigative feature',
    priorText: 'The morning after the council deferred the surveillance MOU, a check cleared.',
  });
  assert.equal(built.messages.length, 2);
  assert.equal(built.messages[0].role, 'system');
  assert.equal(built.messages[0].content, SYSTEM_FOLD);
  const user = built.messages[1].content;
  assert.match(user, /Register: contemporary investigative feature/);
  assert.match(user, /Established so far:/);
  assert.match(user, /This paragraph should: connect two things already in play/);
  assert.match(user, /Work with:/);
  assert.match(user, /Continue this text:/);
  assert.match(user, /Write the next single paragraph\. It should relate two things in play/);
  // the move was CON, but the CODE never crosses into the prompt, nor do unfilled slots
  assert.equal(built.move.op, 'CON');
  assert.doesNotMatch(user, /\{A\}|\{B\}|\{X\}|\{E\}/);
  assert.doesNotMatch(user, /\boperator\b|\barcTarget\b|chromatin/i);
});

test('buildFoldPrompt honors a pinned move and the build_prompt alias', () => {
  assert.equal(build_prompt, buildFoldPrompt);
  const built = build_prompt({ move: 'SYN', phase: 'land', graph: { nodes: ['a', 'b', 'c'] } });
  assert.equal(built.move.op, 'SYN');
  assert.equal(built.move.derived, false);
  assert.match(built.messages[1].content, /draw the threads together into one claim/);
});

test('OP_DIRECTIVES covers the seven writer-facing moves with a 4–6 word restatement', () => {
  for (const op of ['INS', 'CON', 'SYN', 'DEF', 'EVA', 'SEG', 'REC']) {
    const d = OP_DIRECTIVES[op];
    assert.ok(d && d.directive && d.restated && d.verb, `${op} translated`);
    const words = d.restated.split(/\s+/).length;
    assert.ok(words >= 3 && words <= 7, `${op} restated in a few words (${words})`);
  }
});

test('flowScorer scores a candidate against the prior and flags viability', () => {
  const scorer = flowScorer({ prior, prevStep: null, parse: parseText, contextText: 'The morning after the council deferred the MOU, a check cleared.' });
  assert.equal(typeof scorer, 'function');
  const v = scorer('The timing was not lost on observers, who read the deferral and the donation as one story.');
  assert.ok(v && Number.isFinite(v.manifoldResidual));
  assert.equal(typeof v.onManifold, 'boolean');
  assert.equal(typeof v.flat, 'boolean');
  assert.equal(typeof v.offManifold, 'boolean');
  // no prior/parser ⇒ no scorer (degrades to "generate one")
  assert.equal(flowScorer({ prior: null, parse: parseText }), null);
  assert.equal(flowScorer({ prior, parse: null }), null);
  assert.equal(scorer(''), null);
});

test('foldBestOfN keeps the on-manifold candidate nearest the manifold', async () => {
  const outputs = ['CAND_A', 'CAND_B', 'CAND_C', 'CAND_D'];
  let i = 0;
  const model = { phrase: async () => outputs[i++ % outputs.length] };
  const score = (text) => ({
    CAND_A: { manifoldResidual: 0.9, onManifold: false, flat: false, lurch: false, offManifold: true },
    CAND_B: { manifoldResidual: 0.3, onManifold: true, flat: false, lurch: false, offManifold: false },
    CAND_C: { manifoldResidual: 0.2, onManifold: true, flat: false, lurch: false, offManifold: false },
    CAND_D: { manifoldResidual: 0.5, onManifold: false, flat: true, lurch: false, offManifold: false },
  }[text]);
  const out = await foldBestOfN({ model, score, n: 4, phase: 'develop', graph: { nodes: ['x', 'y'] } });
  assert.equal(out.text, 'CAND_C', 'lowest-residual on-manifold candidate wins');
  assert.equal(out.selected, true);
  assert.equal(out.candidates.length, 4);
  assert.equal(out.miss, null);
});

test('foldBestOfN reports the miss when nothing clears the bar', async () => {
  const model = { phrase: async () => 'always the same lurch' };
  const score = () => ({ manifoldResidual: 0.9, onManifold: false, flat: false, lurch: true, offManifold: false });
  const out = await foldBestOfN({ model, score, n: 3, phase: 'develop', graph: { nodes: ['x'] } });
  assert.equal(out.text, null);
  assert.equal(out.selected, false);
  assert.ok(out.miss && out.miss.reason === 'lurch');
  assert.match(out.miss.suggest, /soften|develop/i);
});

test('foldBestOfN degrades to generate-one when no scorer is wired', async () => {
  const model = { phrase: async () => 'a single ungraded paragraph' };
  const out = await foldBestOfN({ model, n: 3, phase: 'open', graph: { nodes: ['x'] } });
  assert.equal(out.text, 'a single ungraded paragraph');
  assert.equal(out.scored, false);
  assert.equal(out.selected, false);
});

test('foldBestOfN runs the real end-to-end path with parse + prior', async () => {
  const cands = [
    'The donation and the deferral now read as one story, each explaining the other.',
    'Falcons are birds. Birds fly. The sky is blue and wide over the park.',
    'Set against the vote, the check that cleared the next morning changed how the timing looked.',
  ];
  let i = 0;
  const model = { phrase: async () => cands[i++ % cands.length] };
  const out = await foldBestOfN({
    model, parse: parseText, n: 3, prior,
    prevStep: null, t: 0.5, graph: { nodes: ['the donation', 'the deferral'], edges: [] },
    priorText: 'The morning after the council deferred the surveillance MOU, a check cleared.',
    segment: { perSentences: 6 },
  });
  assert.equal(out.scored, true);
  assert.equal(out.candidates.length, 3);
  assert.ok(out.candidates.every((c) => c.verdict && Number.isFinite(c.verdict.manifoldResidual)));
  // either a candidate cleared the bar (text + selected) or the miss is reported
  if (out.selected) assert.ok(out.text);
  else assert.ok(out.miss);
});
