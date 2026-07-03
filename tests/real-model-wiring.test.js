// real-model-wiring — the full pipeline against real-model-SHAPED organs (an async phrase()
// talker and a separate async embed() meaning organ, the exact interface the mechanics
// harness's SmolLM2 + MiniLM expose). This locks the adapter that essay-real-model.mjs uses:
// the two stubbed organs (echo, hash) swap out for real ones by dependency injection, and the
// dynamics pipeline + the audit export flow through unchanged. The real models cannot run in
// CI (onnxruntime-node's binary download is policy-blocked), so this proves the SHAPE.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runContinuation, exportAudit, diagnose } from '../src/longgen/index.js';

// A talker with the SmolLM2 interface: async phrase(messages, opts) → a real sentence.
const mockTalker = () => ({
  id: 'mock', kind: 'local', isLoaded: () => true, async load() {},
  async phrase(messages) {
    const user = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const at = user.indexOf('What I found reading it:');
    const span = at >= 0 ? user.slice(at + 24).split('\n').map((s) => s.trim()).filter(Boolean)[0] : 'the point';
    return String(span).replace(/\s*\[s\d+\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  },
});

// A meaning organ with the MiniLM interface: measuresMeaning:true, async embed → a vector.
const topic = (t) => /small|fluent|slot|fill|wrong/i.test(t) ? 0 : /planner|ground|span|floor|bind/i.test(t) ? 1 : 2;
const mockEmbed = (t) => { const v = new Float32Array(8); v[topic(t)] = 1; return Promise.resolve(v); };

const GROUND = [
  { idx: 0, score: 0.95, text: 'a small model is fluent far past its knowledge' },
  { idx: 1, score: 0.90, text: 'handed a slot the model will fill the slot' },
  { idx: 2, score: 0.85, text: 'the fill is fluent and often wrong' },
  { idx: 3, score: 0.80, text: 'a planner makes each structural move first' },
  { idx: 4, score: 0.75, text: 'the planner grounds each claim on a span' },
  { idx: 5, score: 0.70, text: 'a floor truncates whatever fails to bind' },
  { idx: 6, score: 0.65, text: 'across messages the state persists and resumes' },
];

test('the pipeline runs on real-model-shaped organs and the audit reads WORKING', async () => {
  const model = mockTalker();
  await model.load();
  const config = {
    arc: true, temperature: 0, maxSteps: 40,
    selfRegister: true, fieldRead: true, embed: mockEmbed, dynamics: true, confine: true,
  };
  const res = await runContinuation({ ground: GROUND, model, ...config });

  // real prose flowed through (non-empty, not a verbatim index tag)
  assert.ok(res.units.length >= 3, 'it generated a multi-atom answer');
  assert.ok(res.units.every((u) => u.text && u.text.length > 0), 'every atom has rendered prose');

  const audit = exportAudit(res, { config: { ...config, embed: true }, label: 'wiring' });
  assert.doesNotThrow(() => JSON.stringify(audit), 'the audit round-trips to JSON');
  assert.ok(audit.atoms.every((a) => a.decision?.by === 'relaxation'), 'the decision is the relaxation, recorded per atom');

  const d = diagnose(audit);
  assert.equal(d.working, true, `a real-shaped run reads as working: ${d.verdict}`);
  assert.ok(d.opens.ok && d.develops.ok && d.grounded.ok && d.decision_traced.ok && d.floor_on.ok);
});
