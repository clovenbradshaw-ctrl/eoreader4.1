import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { createCompositeDoc, compositeDocIdOf } from '../src/organs/in/composite.js';
import { projectGraph } from '../src/core/index.js';
import { retrieveHybrid } from '../src/retrieve/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

const mk = (text, docId) => {
  const doc = parseText(text, { docId });
  doc.sentenceEmbeddings = async (e) => Promise.all((doc.units || doc.sentences).map(s => e.embed(s)));
  return doc;
};

// Two documents that share a proper name, so a cross-document referent exists.
const docA = () => mk('Gregor Samsa waited at the door. Gregor Samsa left the house.', 'a.txt');
const docB = () => mk('Gregor Samsa smiled warmly. Gregor Samsa ran outside.', 'b.txt');

test('a single document is passed through untouched — the one-doc path is unchanged', () => {
  const d = docA();
  assert.equal(createCompositeDoc([d]), d);
  assert.equal(createCompositeDoc([]), null);
});

test('the composite shares one sentence axis with provenance back to each source', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: false });
  assert.equal(comp.isComposite, true);
  assert.equal(comp.sentences.length, a.sentences.length + b.sentences.length);
  // first sentences belong to a.txt, the later ones to b.txt
  assert.equal(comp.origin(0).docId, 'a.txt');
  assert.equal(comp.origin(a.sentences.length).docId, 'b.txt');
  assert.equal(comp.origin(a.sentences.length).localIdx, 0);
});

test('referents are DISTINCT across documents by default — namespaced, not merged', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: false });
  const g = projectGraph(comp.log, {});
  const ids = [...g.entities.keys()];
  const fromA = ids.filter(id => compositeDocIdOf(id) === 'a.txt');
  const fromB = ids.filter(id => compositeDocIdOf(id) === 'b.txt');
  assert.ok(fromA.length > 0 && fromB.length > 0, 'each document contributes its own referents');
  // The same name in the two documents is two referents (distinct representatives).
  const gA = fromA.find(id => id.endsWith('gregor-samsa'));
  const gB = fromB.find(id => id.endsWith('gregor-samsa'));
  assert.ok(gA && gB, 'both documents admitted Gregor Samsa');
  assert.notEqual(g.representative(gA), g.representative(gB), 'distinct until proactively SYN’d');
});

test('cross-document SYN proactively merges a shared name (defeasible, marked crossDoc)', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: true, heldIdentity: false });
  const syn = comp.crossDocSyn.find(s => /gregor/i.test(s.label || ''));
  assert.ok(syn, 'a cross-document merge was proposed for the shared name');
  assert.equal(syn.crossDoc, true, 'the merge is marked ontologically distinct (crossDoc)');
  assert.equal(syn.defeasible, true, 'and defeasible — revisable by new data');
  const g = projectGraph(comp.log, {});
  assert.equal(g.representative(syn.from), g.representative(syn.to), 'the two referents now resolve to one');
});

test('provenance is RETAINED through a cross-document merge', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: true, heldIdentity: false });
  const syn = comp.crossDocSyn.find(s => /gregor/i.test(s.label || ''));
  const g = projectGraph(comp.log, {});
  const prov = comp.provenanceOf(syn.to, g);
  assert.ok(prov.length >= 2, 'the merged referent lists its members');
  assert.deepEqual(new Set(prov.map(m => m.docId)), new Set(['a.txt', 'b.txt']),
    'each member still knows which document it came from');
});

test('a cross-document merge is REVISABLE — a SEG retract splits it again', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: true, heldIdentity: false });
  const syn = comp.crossDocSyn.find(s => /gregor/i.test(s.label || ''));
  const g1 = projectGraph(comp.log, {});
  assert.equal(g1.representative(syn.from), g1.representative(syn.to), 'merged first');

  const synEvent = comp.log.snapshot().find(e => e.op === 'SYN' && e.crossDoc && e.from === syn.from);
  comp.log.retract(synEvent.seq, 'new data: distinct after all');
  const g2 = projectGraph(comp.log, {});
  assert.notEqual(g2.representative(syn.from), g2.representative(syn.to), 'the SEG splits the cross-doc merge');
});

test('retrieval pools across documents; a citation maps back to its source document', async () => {
  const comp = createCompositeDoc([mk('Alice loves apples.', 'a.txt'), mk('Bob hates broccoli.', 'b.txt')], {});
  const spans = await retrieveHybrid(comp, 'broccoli', createHashEmbedder(), 6);
  assert.ok(spans.length > 0, 'pooled retrieval returns spans');
  const hit = spans.find(s => /broccoli/i.test(comp.sentences[s.idx]));
  assert.ok(hit, 'the broccoli sentence is retrieved');
  assert.equal(comp.origin(hit.idx).docId, 'b.txt', 'and resolves to the document it came from');
});

test('runTurn grounds across a selected set of documents and tags the contributing source', async () => {
  const a = mk('Alice loves apples.', 'a.txt');
  const b = mk('Bob hates broccoli.', 'b.txt');
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'broccoli', docs: [a, b], model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.equal(result.route, 'grounded', 'a selected set grounds the turn');
  assert.ok(result.answer && result.answer.length > 0);
  assert.ok(result.sourceDocs.includes('b.txt'), 'the document the citation came from is tagged as a source');
});

test('runTurn with a single selected document behaves like the single-doc path', async () => {
  const a = mk('Alice loves apples.', 'a.txt');
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'apples', docs: [a], model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.equal(result.route, 'grounded');
  assert.deepEqual(result.sourceDocs, ['a.txt']);
});

test('combined admission + mentions are namespaced per document', () => {
  const a = docA(), b = docB();
  const comp = createCompositeDoc([a, b], { crossDocSyn: false });
  assert.equal(comp.admission.isAdmitted('Gregor Samsa'), true);
  assert.equal(compositeDocIdOf(comp.admission.idOf('Gregor Samsa')), 'a.txt', 'first document wins a label lookup');
  const keys = [...comp.mentions.keys()];
  assert.ok(keys.some(k => compositeDocIdOf(k) === 'a.txt'));
  assert.ok(keys.some(k => compositeDocIdOf(k) === 'b.txt'));
});
