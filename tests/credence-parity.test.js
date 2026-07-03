import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/project.js';
import { createCredenceBook, projectCredence } from '../src/credence/index.js';

// The golden-parity gate (spec §12): "Byte identical on existing paths when the
// flag is off. New behavior on only when the flag is on." The credence holon adds
// a SECOND projection over the ONE append-only log (§7); its events carry op ∈
// {EVA, SEG, NUL} (§8), all of which projectGraph already ignores. So even when
// credence events ride on the very same log, the graph projection is unchanged —
// and with the channels off, no credence event is ever written at all.

const STORY = 'Ada Long spoke. Ada Long spoke. Ben Cole arrived. Ben Cole spoke with Ada Long. Cara Dove entered. Cara Dove spoke.';

// A canonical view of the graph CONTENT — entities, edges, voids, identity — that
// excludes `rev` (which is just the log length, expected to grow with any event).
const canon = (g) => JSON.stringify({
  entities: [...g.entities.entries()]
    .map(([id, e]) => [id, e.label, e.sightings, e.props])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  edges: g.edges
    .map(e => ({ from: e.from, to: e.to, kind: e.kind, via: e.via, seq: e.seq, weight: e.weight }))
    .sort((a, b) => a.seq - b.seq),
  voids: g.voids.map(v => ({ node: v.node, rel: v.rel, seq: v.seq })).sort((a, b) => a.seq - b.seq),
  sameAs: g.sameAs.length, splits: g.splits.length, idMerges: g.idMerges.length,
});

test('credence events on the SAME log leave projectGraph byte-identical', () => {
  const doc = parseText(STORY, { docId: 'gold' });
  const g1 = projectGraph(doc.log, { cursor: 5 });
  const before = canon(g1);
  const lenBefore = doc.log.length;

  // Interleave every credence event kind onto the document's own log.
  doc.log.append({ op: 'NUL', kind: 'credence_init', source_id: 'gold', domain: 'news', cursor: 0 });
  doc.log.append({ op: 'EVA', kind: 'coherence_obs', source_id: 'gold', domain: 'news', x: 0.4, weight: 1, cursor: 1 });
  doc.log.append({ op: 'EVA', kind: 'corroboration_obs', source_id: 'gold', domain: 'news', x: 0.3, corroborators: [], indep_weight: 0, cursor: 2 });
  doc.log.append({ op: 'EVA', kind: 'revision_obs', source_id: 'gold', domain: 'news', r: -0.2, cursor: 3 });
  doc.log.append({ op: 'SEG', kind: 'changepoint', source_id: 'gold', domain: 'news', channel: 'coherence', cursor: 4 });
  doc.log.append({ op: 'DEF', kind: 'credence_verdict', id: 'credence:gold:news', source_id: 'gold', domain: 'news', verdict: 'BULLSHITTER' });

  const g2 = projectGraph(doc.log, { cursor: 5 });
  assert.equal(canon(g2), before, 'the graph content is unchanged by the credence events');
  assert.ok(doc.log.length > lenBefore, 'the log did grow');
  assert.equal(g2.rev, doc.log.length, 'rev is just the log length — it counts every appended event');
});

test('the credence DEF verdict never mutates a graph entity (namespaced id)', () => {
  const doc = parseText(STORY, { docId: 'gold' });
  const g0 = projectGraph(doc.log);
  const entIds = [...g0.entities.keys()];
  // A verdict id is namespaced "credence:src:domain" — outside the entity id space.
  doc.log.append({ op: 'DEF', kind: 'credence_verdict', id: `credence:gold:news`, key: 'verdict', value: 'BULLSHITTER' });
  const g1 = projectGraph(doc.log);
  assert.deepEqual([...g1.entities.keys()], entIds, 'no entity was created');
  for (const id of entIds) {
    assert.deepEqual(g1.entities.get(id).props, g0.entities.get(id).props, 'no entity props were mutated');
  }
});

test('with the channels OFF (the default), a book writes nothing to a document log', () => {
  const doc = parseText(STORY, { docId: 'gold' });
  const lenBefore = doc.log.length;
  // Creating the book (even pointed at the doc log) writes nothing until a channel
  // is invoked — the book is the opt-in faculty, not a change to the spine.
  createCredenceBook({ log: doc.log });
  assert.equal(doc.log.length, lenBefore, 'no events appended by mere existence');
  // And projectCredence over a log with no credence events is an empty book.
  const credBook = projectCredence(doc.log);
  assert.equal(credBook.size, 0, 'no credence events → empty projection');
});

test('a book defaults to its OWN log, isolated from any document', () => {
  const book = createCredenceBook();
  const doc = parseText(STORY, { docId: 'gold' });
  book.observeCoherence('s', 'd', 0.5);
  assert.notEqual(book.log, doc.log, 'the book owns a separate log by default');
  assert.equal(projectGraph(doc.log).rev, doc.log.length, 'the document log is untouched');
});
