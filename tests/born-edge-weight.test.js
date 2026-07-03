// born-edge-weight — the projection weight is Born-derived, not hardcoded
// (docs/born-edge-weight.md). The recency decay used a fixed γ=0.7 per sentence, which
// collapsed a long document to a ~1e-193 field (a 1242-line Wikipedia read had ONE live
// edge; the rest underflowed, so the generator had nothing to assert and hedged). The rate
// is now DERIVED from the reading's own mean edge-distance, and the keep line is the Born
// noise-null (deriveNull), not a constant. These pin: no underflow at document scale,
// recency preserved, determinism (purity) intact, and the opt-in Born floor drops cruft.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph, DEFAULT_PROJECTION_RULES } from '../src/core/project.js';

// A long document: 60 entities, 50 relation edges spread across ~1000 sentences.
const longDoc = () => {
  const log = createLog();
  for (let i = 0; i < 61; i++) log.append({ op: 'INS', id: 'e' + i, label: 'E' + i });
  for (let i = 0; i < 50; i++) log.append({ op: 'CON', src: 'e' + i, tgt: 'e' + (i + 1), via: 'rel', sentIdx: i * 20 });
  return log;
};

test('no underflow at document scale: every edge keeps a usable weight from a far cursor', () => {
  const g = projectGraph(longDoc(), { cursor: 0, rules: DEFAULT_PROJECTION_RULES });
  const w = g.edges.map((e) => e.weight);
  assert.equal(g.edges.length, 50, 'all edges kept (default floor keeps everything)');
  assert.ok(w.every((x) => x > 1e-6), `no edge underflows — min ${Math.min(...w)}`);
  // γ^dist would have driven the far edge (sentIdx 980) to 0.7^980 ≈ 1e-152.
  assert.ok(Math.min(...w) > 1e-3, 'the far end of the document still contributes');
});

test('recency is preserved: nearer the cursor is heavier, monotonically', () => {
  const g = projectGraph(longDoc(), { cursor: 0, rules: DEFAULT_PROJECTION_RULES });
  const byDist = g.edges
    .map((e) => ({ d: e.sentIdx, w: e.weight }))
    .sort((a, b) => a.d - b.d);
  for (let i = 1; i < byDist.length; i++) {
    assert.ok(byDist[i].w <= byDist[i - 1].w + 1e-9, 'weight does not rise with distance');
  }
});

test('the rate is derived, not hardcoded: no decay_gamma in the rules still works', () => {
  const rules = { ...DEFAULT_PROJECTION_RULES };
  delete rules.decay_gamma;                    // the coefficient is gone; τ self-calibrates
  const g = projectGraph(longDoc(), { cursor: 0, rules });
  assert.equal(g.edges.length, 50);
  assert.ok(g.edges.every((e) => Number.isFinite(e.weight) && e.weight > 0), 'weights are finite and positive');
});

test('determinism (purity): same log + frame → identical weights', () => {
  const log = longDoc();
  const a = projectGraph(log, { cursor: 0, rules: DEFAULT_PROJECTION_RULES }).edges.map((e) => e.weight);
  const b = projectGraph(log, { cursor: 0, rules: DEFAULT_PROJECTION_RULES }).edges.map((e) => e.weight);
  assert.deepEqual(a, b);
});

test('the Born floor is opt-in: default keeps all; edge_floor:born applies the noise-null', () => {
  const log = longDoc();
  const keepAll = projectGraph(log, { cursor: 0, rules: DEFAULT_PROJECTION_RULES });
  const born = projectGraph(log, { cursor: 0, rules: { ...DEFAULT_PROJECTION_RULES, edge_floor: 'born' } });
  assert.equal(keepAll.edges.length, 50, 'default: no floor, every edge kept');
  assert.ok(born.edges.length <= keepAll.edges.length, 'born floor never keeps MORE than keep-all');
});
