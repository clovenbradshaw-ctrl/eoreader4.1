import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { projectGraph } from '../src/core/project.js';
import { VERDICTS } from '../src/core/verdicts.js';

// The mr/mrs-samsa fix. A name-containment merge is not one thing: merging on the
// GIVEN NAME ("Gregor" ⊂ "Gregor Samsa") is individuating and holds; merging on the
// SURNAME ("Samsa" ⊂ "Gregor Samsa") rests on a token a whole family shares, so it is
// committed DEFEASIBLY — carrying the rebutter "a distinct agent bears this surname" —
// and OVERTURNED the moment the surname proves shared. EVA fires at write time over
// every merge: the ingestion log no longer commits identities without evaluating them.

// A family: Gregor (the son), Mr Samsa (the father), Mrs Samsa (the mother), and the
// bare surname. The eager surname merge collapsed all four into one referent; the
// defeasible merge keeps them distinct.
const FAMILY =
  'Gregor Samsa woke transformed. ' +
  'Samsa had always feared this morning. ' +
  'Mr Samsa hurled an apple at his son. ' +
  'Mrs Samsa wept in the doorway. ' +
  'Gregor crawled back under the couch.';

test('a shared surname does NOT collapse the family — four distinct referents, not one', () => {
  const doc = projectGraph(parseText(FAMILY, { docId: 'fam' }).log);
  const rep = doc.representative;
  const ids = ['gregor-samsa', 'mr-samsa', 'mrs-samsa', 'samsa'].map(rep);
  assert.equal(new Set(ids).size, 4,
    `the Samsa family must stay distinct, got ${JSON.stringify(ids)}`);
});

test('the given-name (head) merge still holds — "Gregor" folds into "Gregor Samsa"', () => {
  const doc = parseText(FAMILY, { docId: 'fam' });
  // A given name individuates: the alias is uncontested by the surname rebutter. The
  // head merge unifies at admission (bare "Gregor" is admitted under the full id), so
  // it shows up there — the SYN(alias) is the audit record, not a second merge.
  assert.equal(doc.admission.idOf('Gregor'), 'gregor-samsa');
  assert.equal(doc.admission.idOf('Gregor'), doc.admission.idOf('Gregor Samsa'));
});

test('the overturn is an APPENDED defeat, not a rewrite: SYN(tail) → SEG-retract → EVA·contradicted', () => {
  const ev = parseText(FAMILY, { docId: 'fam' }).log.events;
  // A surname merge is committed defeasibly, carrying its rebutter...
  const syn = ev.find(e => e.op === 'SYN' && e.match === 'tail' && e.defeasible);
  assert.ok(syn, 'a defeasible surname SYN is committed');
  assert.equal(syn.rebutter, 'distinct-agent-shares-surname');
  // ...then a SEG-retract supersedes it — the log is append-only, defeat never rewinds...
  const seg = ev.find(e => e.op === 'SEG' && e.kind === 'retract' && e.refSeq === syn.seq);
  assert.ok(seg, 'the merge is overturned by an appended SEG-retract, not unwritten');
  // ...and a write-time EVA records the rebutter firing.
  const eva = ev.find(e => e.op === 'EVA' && e.ref === syn.seq && e.verdict === VERDICTS.CONTRADICTED);
  assert.ok(eva, 'a write-time EVA records the contradiction');
});

test('EVA fires at write time over the merges — the ingestion log no longer lacks it', () => {
  const evas = parseText(FAMILY, { docId: 'fam' }).log.events.filter(e => e.op === 'EVA');
  assert.ok(evas.length > 0, 'EVA is present in the ingestion log');
  assert.ok(evas.some(e => e.verdict === VERDICTS.CORROBORATED && e.reason === 'given-name-containment'),
    'the given-name merge earns a corroborated write-time EVA');
  assert.ok(evas.some(e => e.verdict === VERDICTS.INDETERMINATE && e.reason === 'surname-containment-thin'),
    'a thin surname merge is held at indeterminate as it is committed');
});

test('a surname UNIQUE to one name still folds — no rebutter, the merge stands', () => {
  // Only one Samsa in the document: bare "Samsa" IS Gregor, so the merge is correct
  // and uncontested. Defeasibility must not over-fire into refusing a sound merge.
  const doc = parseText('Gregor Samsa woke. Gregor crawled. Samsa died at dawn.', { docId: 'one' });
  const g = projectGraph(doc.log);
  assert.equal(g.representative('samsa'), g.representative('gregor-samsa'),
    'with a single Samsa the surname picks out the one referent');
  assert.equal(doc.log.events.some(e => e.op === 'SEG' && e.kind === 'retract'), false,
    'a unique surname fires no rebutter');
});

test('the clean fixture is unchanged — only "Gregor Samsa" bears the surname', () => {
  // data/metamorphosis.txt names the parents "mother"/"father", never "Mr/Mrs Samsa",
  // so the surname is unique and the head merge is the only one. A regression guard
  // that the fix is surgical: it changes nothing where the family is not named.
  const doc = parseText(
    'Gregor Samsa woke. Gregor dressed. His mother knocked. His father waited.',
    { docId: 'clean' });
  assert.equal(doc.log.events.some(e => e.op === 'SEG' && e.kind === 'retract'), false);
  assert.equal(doc.admission.idOf('Gregor'), 'gregor-samsa');
});
