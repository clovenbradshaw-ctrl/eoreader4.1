import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLensStack, softmax, shannonEntropy, entropyGate, applyBias,
} from '../src/write/lens-port.js';
import { buildConceptTokenMap } from '../src/write/concept-tokens.js';
import { deriveNull } from '../src/core/index.js';

// Same fake tokenizer + doc as concept-tokens.test.js (the injected seam).
const VOCAB = [
  '<unk>', ' ', '.', ',',
  'the', ' the', ' woke', ' fed', ' him', ' in', ' and',
  ' Gregor', ' Samsa', ' Grete', ' Schmidt',
  'Gregor', 'Samsa', 'Grete',
  ' 1847', '1847',
  ' 99', ' 12', ' 34', ' 56', ' 78', ' 90', ' 11', ' 22',
];
const ID = Object.fromEntries(VOCAB.map((s, i) => [s, i]));
const PIECES = VOCAB.map((s, i) => [s, i]).filter(([s]) => s !== '<unk>').sort((a, b) => b[0].length - a[0].length);
const tok = {
  encode(text) {
    const out = []; let i = 0; const s = String(text);
    while (i < s.length) {
      let hit = null;
      for (const [piece, id] of PIECES) if (s.startsWith(piece, i)) { hit = [piece, id]; break; }
      if (hit) { out.push(hit[1]); i += hit[0].length; } else { out.push(ID['<unk>']); i += 1; }
    }
    return out;
  },
  decode(ids) { return (Array.isArray(ids) ? ids : [ids]).map(id => VOCAB[id] ?? '').join(''); },
};
const doc = {
  sentences: ['Gregor Samsa woke in 1847.', 'Grete fed him.'],
  log: { events: [
    { op: 'INS', id: 'e1', label: 'Gregor Samsa', sentIdx: 0 },
    { op: 'INS', id: 'e2', label: 'Grete', sentIdx: 1 },
  ] },
};
const conceptMap = buildConceptTokenMap(doc, null, tok);
const flat = () => new Float32Array(VOCAB.length);          // all-zero ⇒ high entropy
const oneHot = (i) => { const v = flat(); v[i] = 20; return v; };

test('softmax / entropy / gate — the write-side "how mixed is the state"', () => {
  const p = softmax(flat());
  const s = p.reduce((a, x) => a + x, 0);
  assert.ok(Math.abs(s - 1) < 1e-9, 'softmax sums to 1');
  assert.ok(shannonEntropy(flat()) > shannonEntropy(oneHot(5)), 'flat is more mixed than one-hot');
  assert.equal(entropyGate(0), 0, 'forced position ⇒ gate closed');
  assert.equal(entropyGate(10), 1, 'wide-open position ⇒ gate open');
});

test('disabled stack is the identity — the golden path stays byte-identical', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: false, conceptMap });
  const L = oneHot(ID[' the']);
  assert.equal(stack.processLogits(L), L, 'same array returned untouched when off');
});

test('relevance — at an open boundary with high entropy, the salient figure is up-weighted', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({
    enabled: true, conceptMap, mu: 4, lambda: 0,
    figureWeights: new Map([['grete', 1.0]]),
  });
  const before = flat();
  const after = stack.processLogits(flat());            // surface is empty ⇒ boundary open
  assert.ok(after[ID[' Grete']] > before[ID[' Grete']], 'Grete biased up');
  assert.equal(after[ID[' woke']], before[ID[' woke']], 'an unrelated token untouched');
});

test('entropy gate — a forced (low-entropy) position is not perturbed', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: true, conceptMap, mu: 4, figureWeights: new Map([['grete', 1.0]]) });
  const forced = oneHot(ID[' the']);                    // H≈0 ⇒ g≈0
  const after = stack.processLogits(forced);
  assert.ok(Math.abs(after[ID[' Grete']] - forced[ID[' Grete']]) < 1e-6, 'grammar left to the model');
});

test('personality ≡ 0 when ρ = σ — supplying an empty projection changes nothing', () => {
  const stack = createLensStack({ tokenizer: tok });
  // isolate the λ-term: the void numeral/entity gates are always-on by design, so turn them
  // off here to assert that personality alone, at ρ = σ, changes nothing.
  stack.configure({ enabled: true, conceptMap, lambda: 5, personality: new Map(), voidNumerals: false, voidEntities: false });
  const before = flat();
  const after = stack.processLogits(flat());
  for (let i = 0; i < before.length; i++) assert.equal(after[i], before[i]);
});

test('void numeral gate — an ungrounded number is suppressed, the grounded one survives', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: true, conceptMap });
  const L = flat();
  L[ID[' 99']] = 5;            // hallucinated statistic, ungrounded
  L[ID[' 1847']] = 5;          // grounded by sentence 0
  const after = stack.processLogits(L);
  assert.equal(after[ID[' 99']], -Infinity, 'ungrounded number → −∞');
  assert.ok(Number.isFinite(after[ID[' 1847']]), 'grounded number passes');
});

test('void entity trie — an invented continuation is masked once a grounded name opens', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: true, conceptMap });
  stack.processSampledToken(ID[' Gregor']);             // a grounded name opens
  const L = flat();
  L[ID[' Schmidt']] = 8;       // the model reaches for an invented surname
  L[ID[' Samsa']] = 3;         // the grounded continuation
  const after = stack.processLogits(L);
  assert.equal(after[ID[' Schmidt']], -Infinity, '"Gregor Schmidt" made unsayable');
  assert.ok(Number.isFinite(after[ID[' Samsa']]), '"Gregor Samsa" admitted');
});

test('syntax safety valve — never empty the nucleus; fall back + log a void-conflict', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: true, conceptMap });
  const L = flat();
  // make the whole top-k hallucinated statistics so the numeral gate would clear it
  for (const t of [' 99', ' 12', ' 34', ' 56', ' 78', ' 90', ' 11', ' 22']) L[ID[t]] = 10;
  const after = stack.processLogits(L);
  assert.equal(after, L, 'returns the unbiased logits rather than a stalled/garbled decode');
  const conflicts = stack.drainEvents().filter(e => e.type === 'void-conflict');
  assert.ok(conflicts.length >= 1, 'the lapse is logged for review (Track F queue)');
});

test('the port at infinity — a grammar mask reproduces the ModelOracle on the same path', () => {
  const stack = createLensStack({ tokenizer: tok });
  const allow = new Set([ID[' Grete'], ID[' Samsa']]);
  stack.configure({ enabled: true, conceptMap, grammarMask: allow });
  const L = flat(); L[ID[' Grete']] = 10; L[ID[' Samsa']] = 10;   // the model has mass on the enumerated set
  const after = stack.processLogits(L);
  assert.ok(Number.isFinite(after[ID[' Grete']]) && Number.isFinite(after[ID[' Samsa']]));
  assert.equal(after[ID[' woke']], -Infinity, 'everything outside the enumerated set → −∞');
});

test('resetState — returns to the maximally mixed ground between turns', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.configure({ enabled: true, conceptMap });
  stack.processSampledToken(ID[' Gregor']);
  stack.resetState();
  // after reset, no entity is mid-spelling, so a fresh continuation is not masked
  const L = flat(); L[ID[' Schmidt']] = 8;
  const after = stack.processLogits(L);
  assert.ok(Number.isFinite(after[ID[' Schmidt']]), 'entity cursor cleared on reset');
});

// ── Track F: the DEF·EVA·REC loop closed ────────────────────────────────────────────────
test('span-gated REC — a conflict widens the trie only when a source span justifies it', () => {
  const stack = createLensStack({ tokenizer: tok });
  // a name a span supports → re-ground (widen); add to the approved set, relax the void strain.
  const widen = stack.recGate('Grete', [{ text: 'Grete fed him.' }]);
  assert.equal(widen.decision, 'widen');
  assert.deepEqual(stack.approvedSurfaces(), ['grete']);
  // a name NO span supports → review only; never auto-accepted into the grounding floor.
  const review = stack.recGate('Schmidt', [{ text: 'Grete fed him.' }]);
  assert.equal(review.decision, 'review');
  assert.equal(stack.approvedSurfaces().includes('schmidt'), false);
});

test('asymmetric hysteresis — a soft bias toggles off cheaply, the void floor resists', () => {
  const stack = createLensStack({ tokenizer: tok });
  const { relevance, void: voidRule } = stack.rules;
  stack.noteNoiseNull('relevance', false);   // one failed noise-null
  stack.noteNoiseNull('relevance', false);   // and another
  assert.equal(relevance.on, false, 'a failing soft bias is cheap to switch off');
  for (let i = 0; i < 2; i++) voidRule.break();
  assert.equal(voidRule.on, true, 'the hard suppression resists a couple of pushes (seeded high)');
});

test('staleness decay — a re-ground decays the soft terms back toward σ', () => {
  const stack = createLensStack({ tokenizer: tok });
  stack.decay({ regrounded: true });
  stack.decay({ regrounded: true });
  assert.equal(stack.rules.relevance.on, false, 'a rule good for the old frame decays once the field moves');
  assert.equal(stack.decay({ regrounded: false }), undefined, 'no re-ground ⇒ no decay');
});

test('noise-null discipline — a targeted bias beats a random bias of equal magnitude', () => {
  // The spec's magnitude discipline: a bias is real only when it moves the output more than a
  // random bias of the same magnitude would. Target Grete; compare to random single-token tilts.
  const L = flat();
  const target = ID[' Grete'];
  const mag = 4;
  const pBefore = softmax(L)[target];
  const real = softmax(applyBias(L, new Map([[target, mag]])))[target] - pBefore;
  const randomEffects = [];
  for (let i = 0; i < VOCAB.length; i++) {
    if (i === target) continue;
    randomEffects.push(softmax(applyBias(L, new Map([[i, mag]])))[target] - pBefore);
  }
  const floor = deriveNull(randomEffects, { scale: 'linear', alpha: 0.05 });
  assert.ok(real > (Number.isFinite(floor) ? floor : 0), 'the targeted tilt clears the noise null');
});
