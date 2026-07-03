import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceBoundaries, segmentSentences, parseText } from '../src/perceiver/parse/index.js';
import { structureSurface } from '../src/perceiver/index.js';
import { projectGraph } from '../src/core/index.js';

// docs: presence is bedrock, but where a sentence ENDS is an interpretation — the
// lowest DEF the reader makes. The boundary-induction loop lets MEANING revise that
// SYNTAX: when leaving ':' ignored fuses propositions into run-on units that will not
// cohere, the enacted DEF·EVA·REC loop accumulates the incoherence and RECs the
// convention. The default threshold is a rare crisis; tests pin sensitivity with
// `boundaryThreshold` so they assert the MECHANISM, not the exact tuning.

// Five colon-fused genealogy units (KJV shape): each welds several "X begat Y"
// propositions with colons the floor `.!?` cannot separate.
const FUSED = [
  'And Adam begat Seth: and Seth begat Enos: and Enos begat Cainan: and Cainan begat Mahalaleel.',
  'And Mahalaleel begat Jared: and Jared begat Enoch: and Enoch begat Methuselah: and Methuselah begat Lamech.',
  'And Lamech begat Noah: and Noah begat Shem: and Shem begat Arphaxad: and Arphaxad begat Salah.',
  'And Salah begat Eber: and Eber begat Peleg: and Peleg begat Reu: and Reu begat Serug.',
  'And Serug begat Nahor: and Nahor begat Terah: and Terah begat Abram: and Abram begat Isaac.',
].join(' ');

test('modern prose does not promote a list colon — the loop stays dormant', () => {
  const prose = 'The committee met today. It reviewed three items: the budget, the schedule, and the staffing. '
    + 'Everyone agreed on the plan. The meeting ended early in the afternoon.';
  // A colon before a short list fuses no proposition, so nothing strains — at any
  // sensitivity.
  assert.equal(induceBoundaries(prose, { thresholds: { segmentation: 0.1 } }).extraBoundaries.size, 0);
});

test('the promotion is rare — a genuine genealogy does not flip syntax at the default', () => {
  // The same fused text the mechanism test promotes, left at the conservative
  // default, holds: a handful of run-ons is not yet a crisis.
  assert.equal(induceBoundaries(FUSED).extraBoundaries.size, 0);
});

test('coherence-incoherence promotes ":" to a boundary, recorded as a REC', () => {
  const { extraBoundaries, recs } = induceBoundaries(FUSED, { thresholds: { segmentation: 1 } });
  assert.ok(extraBoundaries.has(':'), 'fused propositions broke the boundary frame and promoted the colon');
  const rec = recs.find(r => r.kind === 'boundary' && r.token === ':');
  assert.ok(rec && rec.op === 'REC' && rec.fused > 0, 'the restructuring is a REC over the convention');
});

test('segmentSentences honours a learned boundary mark', () => {
  const text = 'These are the generations of Shem: Shem was an hundred years old, and begat Arphaxad.';
  assert.equal(segmentSentences(text).length, 1, 'with the floor only, the colon does not cut');
  const split = segmentSentences(text, { extraBoundaries: new Set([':']) });
  assert.equal(split.length, 2, 'with ":" learned, the run-on splits at the colon');
  assert.ok(/^Shem was an hundred/.test(split[1]), 'the patriarch clause now stands on its own');
});

test('end to end: learning the colon turns a collapsed run-on into the true chain', () => {
  const text = 'And God created all things. ' + FUSED;

  // At the floor, the whole genealogy is one clause per unit: every name reads as an
  // object of the first "begat", so the chain collapses to "Adam begat everyone".
  const collapsed = parseText(text, { docId: 'floor' });
  const cEdges = structureSurface(collapsed, collapsed.sentences.map((_, i) => i))
    .relations.filter(r => r.via === 'begat').map(r => `${r.src.id}->${r.tgt.id}`);
  assert.ok(!cEdges.includes('seth->enos'), 'unsplit, Seth never becomes a subject');

  // Learn the colon (deterministic via boundaryThreshold) and the true chain emerges.
  const doc = parseText(text, { docId: 'learned', boundaryThreshold: 1 });
  assert.ok(doc.conventions.rules.some(r => r.kind === 'boundary' && r.token === ':'),
    'the document taught the parser its boundary convention');
  const edges = structureSurface(doc, doc.sentences.map((_, i) => i))
    .relations.filter(r => r.via === 'begat').map(r => `${r.src.id}->${r.tgt.id}`);
  assert.ok(edges.includes('seth->enos'), 'each patriarch is now his own subject — the chain links');
  assert.ok(!edges.some(e => e.startsWith('god->') || e.endsWith('->god')),
    'no subjectless begat fell to the gravity well (God)');
});

test('a boundary REC is in the append-only log, replayable like the rest', () => {
  const doc = parseText(FUSED, { docId: 'k', boundaryThreshold: 1 });
  const recs = doc.log.filter(e => e.op === 'REC' && e.kind === 'boundary');
  assert.ok(recs.length >= 1, 'the syntactic restructuring is a logged convention');
  assert.ok(projectGraph(doc.log).entities.size > 0, 're-folding under the revised segmentation is no special case');
});

// ── The heading boundary (#0 segmentation) ───────────────────────────────────
// A heading/label on its own line has no terminal punctuation; the single-newline
// collapse used to weld it onto the sentence beneath, which is what minted the phantom
// "Ryan Coogler -> Chris Carter : reboot" relation behind the wrong "Carter" answer.

test('a heading line welded to the next sentence is split at the line break', () => {
  const ss = segmentSentences(
    'The film was released in 2008.\nPlanned reboot\nIn March 2023, Ryan Coogler was developing a reboot per Chris Carter.');
  assert.ok(ss.includes('Planned reboot'), 'the heading is its own unit');
  assert.ok(ss.some((s) => s.startsWith('In March 2023')), 'the body sentence stands alone');
  assert.ok(!ss.some((s) => /Planned reboot In March/.test(s)), 'heading and body are not welded');
});

test('a multi-word title line ("Ryan Coogler reboot") does not bleed into the body sentence', () => {
  const ss = segmentSentences('Ryan Coogler reboot\nIn March 2023, it was reported per Chris Carter.');
  assert.ok(ss.includes('Ryan Coogler reboot'));
  assert.ok(!ss.some((s) => /Coogler reboot In March/.test(s)));
});

test('hard-wrapped prose (Gutenberg ~70-char lines) is NOT shattered at its soft wraps', () => {
  const para =
    'One morning, when Gregor Samsa woke from troubled dreams, he found\n' +
    'himself transformed in his bed into a horrible vermin. He lay on his\n' +
    'armour-like back, and he could see his brown belly.';
  const ss = segmentSentences(para);
  // Two real sentences, neither split at a wrap (a wrapped line carries >4 words and/or
  // trails on a continuation word like "his").
  assert.equal(ss.length, 2);
  assert.ok(ss[0].includes('he found himself transformed'), 'the first wrap stayed a soft space');
  assert.ok(ss[1].includes('He lay on his armour-like back'), 'the second wrap stayed a soft space');
});
