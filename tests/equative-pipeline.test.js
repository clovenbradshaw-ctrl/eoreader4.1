// End-to-end: a correct, graph-witnessed kinship answer must no longer read as unbound.
// Before the equative-EOT fix, "Gregor's sister is Grete" produced ZERO claimed edges (the
// copular branch flattened it to a DEF), the lexical binder could not tie it to a single span,
// and the turn fired unbound-contact + low-coverage on a correct answer. Now the equative is
// recovered as a CON edge, corroborated embedder-free against the document's sister edge, and
// that citation is fed back into the bind so the vetoes clear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

const KIN = `Gregor Samsa woke from troubled dreams. His sister Grete looked after him.
Grete was Gregor's sister. The mother wept. Gregor's sister played the violin.`;

const setup = (text) => {
  const doc = parseText(text, { docId: 'pg', genderCoref: true });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ||= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};

// A fixed-answer model: returns the kinship claim regardless of prompt (the talker's words are
// what the binder + factcheck then adjudicate). No `propose`, so the plain phrase path runs.
const fixedModel = (answer) => ({ id: 'fixed', kind: 'local', isLoaded: () => true, load: async () => {}, phrase: async () => answer });

test('a graph-witnessed kinship answer clears unbound-contact / low-coverage', async () => {
  const doc = setup(KIN);
  const result = await runTurn({
    question: "who is Gregor's sister?",
    doc, model: fixedModel("Gregor's sister is Grete."),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
  });

  const fc = result.turn.steps.find(s => s.name === 'factcheck');
  assert.ok(fc, 'the factcheck stage ran');
  assert.ok((fc.data.corroborated || 0) >= 1, 'the kinship claim corroborated against the document edge');

  const vetoIds = (result.vetoes || result.flags || []).map(v => v.id);
  assert.ok(!vetoIds.includes('unbound-contact'), `unbound-contact cleared, got: ${vetoIds.join(',')}`);
  assert.ok(!vetoIds.includes('low-coverage'), `low-coverage cleared, got: ${vetoIds.join(',')}`);
  assert.ok(/\[s\d+\]/.test(result.answer), `the answer carries the earned citation: ${result.answer}`);
});

test('an UNwitnessed claim still rides flagged (the fix does not over-clear)', async () => {
  const doc = setup(KIN);
  // The document never says who the mother's spouse is — an invented spouse edge has no witness.
  const result = await runTurn({
    question: 'who is the mother married to?',
    doc, model: fixedModel("The mother's husband is Gregor."),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
  });
  const fc = result.turn.steps.find(s => s.name === 'factcheck');
  // No witnessed spouse edge → not corroborated. (It may be unsupported or indeterminate, but
  // never corroborated — the corroboration axiom only fires on a real witnessing edge.)
  assert.equal(fc.data.corroborated || 0, 0, 'no false corroboration without a witnessing edge');
});
