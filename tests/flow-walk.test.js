import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { walk, loadInstalledPrior } from '../src/longgen/index.js';
import { renderContinuation } from '../src/longgen/render.js';
import { parseText } from '../src/perceiver/parse/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parse = (t) => parseText(String(t || ''), { coordSubjects: true });
const readDisk = async (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

// A live-branch fold: a pool of developable spans a refold serves three at a time.
const POOL = [
  'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.',
  'Falcons show a marked affinity for tall cliffs away from human establishments.',
  'The peregrine has a body length of thirty-four to fifty-eight centimetres.',
  'The Latin term for falcon is related to falx, meaning a curved sickle.',
  'The ancient Egyptian sun deity was often shown with the head of a falcon.',
  'A falcon delivers a knockout blow with a clenched talon against larger prey.',
  'The wingspan of the peregrine ranges from seventy-four to one hundred and twenty centimetres.',
  'Falcons execute sharp aerial manoeuvres to catch highly agile birds in flight.',
  'Peregrines nest on ledges and lay their eggs in a shallow scrape.',
].map((text, i) => ({ idx: i, score: 0.9 - i * 0.03, text }));

// A refold that serves the next three uncovered spans, then saturates.
const refoldFrom = (pool) => async ({ seen }) => {
  const fresh = pool.filter((s) => !seen.has(String(s.idx)));
  return fresh.slice(0, 3);
};

// A deterministic mock model: each beat returns a fixed multi-sentence paragraph so the
// running draft parses into real sections (echo would phrase back one span). It records
// the SYSTEM message it was handed so the shape test can inspect the injected directive.
const mockModel = (paras) => {
  let i = 0;
  const seen = [];
  return {
    name: 'mock',
    seen,
    async load() {},
    async phrase(messages) {
      seen.push(messages[0]?.content || '');
      const p = paras[Math.min(i, paras.length - 1)];
      i += 1;
      return p;
    },
  };
};

const PARAS = [
  'The peregrine falcon is the fastest animal alive. In its hunting stoop it exceeds three hundred kilometres per hour. This dive is a controlled fall, not powered flight.',
  'Its body is built for that speed. The wings are long and swept, the keel deep. Every proportion trades manoeuvre for velocity.',
  'The bird also carries a long cultural shadow. Egyptian sun gods wore its head. The Latin name ties it to a curved blade.',
];

test('loadInstalledPrior selects the pooled English prior from the real registry', async () => {
  const r = await loadInstalledPrior({ lang: 'en' }, { read: readDisk });
  assert.ok(r && r.prior, 'a prior loads');
  assert.equal(r.entry.name, 'mixed-en-pooled');
  assert.ok(r.prior.steps > 0 && Array.isArray(r.prior.arcKeys));
});

test('a missing registry degrades to null, never a throw', async () => {
  const r = await loadInstalledPrior({ lang: 'en' }, { base: 'data/no-such-registry', read: async () => { throw new Error('no file'); } });
  assert.equal(r, null);
});

test('observe: a wired flow prior rides the trace and changes NO tokens (parity)', async () => {
  const { prior } = await loadInstalledPrior({ lang: 'en' }, { read: readDisk });

  const base = await walk({ fold: [], design: { demand: 3, question: 'falcons' },
    model: mockModel(PARAS), refold: refoldFrom(POOL), groundLater: true });
  const wired = await walk({ fold: [], design: { demand: 3, question: 'falcons' },
    model: mockModel(PARAS), refold: refoldFrom(POOL), groundLater: true, flow: { prior, parse, perSentences: 8 } });

  // The generated prose is identical — observe is measurement, not steering.
  assert.equal(wired.answer, base.answer, 'observe must not change the output');

  // The unwired walk carries no flow; the wired one does, on the trace and the roll-up.
  assert.ok(base.trace.every((t) => !('flow' in t)), 'no flow on the unwired trace');
  assert.equal(base.flow, undefined);
  assert.ok(wired.flow && Array.isArray(wired.flow.beats) && wired.flow.beats.length >= 1, 'wired walk reports flow');
  assert.ok(Array.isArray(wired.flow.wantSeq) && wired.flow.wantSeq.length === wired.flow.beats.length);
  const rec = wired.trace.find((t) => t.flow)?.flow;
  assert.ok(rec && typeof rec.want === 'string' && typeof rec.ok === 'boolean', 'a beat carries a flow record with the arc-demanded move');
});

test('shape: renderContinuation is byte-identical without a directive, and injects one with it', () => {
  const beat = { id: 'b0', order: 0, role: 'continue', heading: null, kind: 'connective', idx: 0 };
  const slice = [{ idx: 0, text: POOL[0].text }];
  const plain = renderContinuation({ beat, slice, prior: 'A prior paragraph.' });
  const alsoPlain = renderContinuation({ beat, slice, prior: 'A prior paragraph.', arcDirective: '' });
  assert.deepEqual(alsoPlain, plain, 'empty directive ⇒ byte-identical prompt (parity)');

  const shaped = renderContinuation({ beat, slice, prior: 'A prior paragraph.', arcDirective: 'relate two things in play' });
  assert.equal(shaped[1].content, plain[1].content, 'the continuation body is unchanged');
  assert.ok(/Move for this paragraph: relate two things in play\./.test(shaped[0].content), 'the directive rides the system framing');
});

test('shape: flowShape feeds the arc-demanded move into the beat prompt; off leaves it out', async () => {
  const { prior } = await loadInstalledPrior({ lang: 'en' }, { read: readDisk });

  const off = mockModel(PARAS);
  await walk({ fold: [], design: { demand: 3, question: 'falcons' }, model: off,
    refold: refoldFrom(POOL), groundLater: true, flow: { prior, parse, perSentences: 8 }, flowShape: false });
  assert.ok(off.seen.every((s) => !/Move for this paragraph/.test(s)), 'flowShape off ⇒ no directive in any prompt');

  const on = mockModel(PARAS);
  await walk({ fold: [], design: { demand: 3, question: 'falcons' }, model: on,
    refold: refoldFrom(POOL), groundLater: true, flow: { prior, parse, perSentences: 8 }, flowShape: true });
  assert.ok(on.seen.some((s) => /Move for this paragraph/.test(s)), 'flowShape on ⇒ at least one beat carries the arc directive');
});
