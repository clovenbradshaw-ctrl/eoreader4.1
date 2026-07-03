import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';
import { createAuditLog } from '../src/audit/index.js';

// The cube register on GENERATION. The unit test (intent.test.js) checks the placement
// is computed; this drives a REAL turn end-to-end (echo model, hash embedder) and shows
// the placement rides through the pipeline — the `route` stage spreads it into the turn
// context, so every downstream generation stage sees the grain the question is asked at.

const TEXT =
  'Gregor Samsa woke one morning transformed into an insect. ' +
  'His sister Grete cared for him at first. ' +
  'Their father grew angry and drove Gregor back to his room. ' +
  'The family hid Gregor from the lodgers they had taken in. ' +
  'Gregor left his room one evening and frightened everyone. ' +
  'In time the family decided they must be rid of him. ' +
  'Gregor died alone, and the family felt relief and went on a trip.';

const runFor = async (question) => {
  const doc = parseText(TEXT, { docId: 'metamorphosis' });
  const model = createModel('echo');
  if (model.load) await model.load(() => {});
  let route = null, retrieve = null;
  const turn = await runTurn({
    question, doc, model, embedder: createHashEmbedder(), auditLog: createAuditLog(),
    onStep: (name, ctx) => {
      if (name === 'route' && !route) route = ctx;
      if (name === 'retrieve' && !retrieve) retrieve = ctx;
    },
  });
  return { turn, route: route || {}, retrieve: retrieve || {} };
};

test('the cube placement rides into the generation context for every task', async () => {
  const cases = {
    'who is Gregor':                            { task: 'answer',  domain: 'Existence',      grain: 'Figure',  terrain: 'Entity',   level: 1 },
    'what is this about':                       { task: 'summary', domain: 'Interpretation', grain: 'Pattern', terrain: 'Paradigm', level: 3 },
    'list the characters':                      { task: 'list',    domain: 'Structure',      grain: 'Pattern', terrain: 'Network',  level: 2 },
    'why did the family want to be rid of him': { task: 'explain', domain: 'Interpretation', grain: 'Figure',  terrain: 'Lens',     level: 3 },
  };
  for (const [q, want] of Object.entries(cases)) {
    const { turn, route } = await runFor(q);
    for (const k of Object.keys(want)) assert.equal(route[k], want[k], `${q} · ${k}`);
    assert.equal(turn.route, 'grounded', `${q} routes grounded`);
    assert.ok(String(turn.answer || '').length > 0, `${q} generates an answer`);
  }
});

// The grain is not inert on generation — it is LOAD-BEARING in retrieval. A Pattern-grain
// task reads the whole document, not a point; a Figure-grain lookup retrieves at a point.
// And the two Pattern TERRAINS read differently: a Paradigm (summary) takes the structural
// skeleton — an even spread; a Network (list) takes the figure-bearing units — the members.
test('the grain steers retrieval: Pattern reads the whole, Figure reads a point', async () => {
  const summary = await runFor('what is this about');
  const list    = await runFor('list the characters');
  const lookup  = await runFor('who is Gregor');
  const why     = await runFor('why did the family want to be rid of him');

  assert.equal(summary.route.grain, 'Pattern');
  assert.equal(list.route.grain,    'Pattern');
  assert.equal(lookup.route.grain,  'Figure');
  assert.equal(why.route.grain,     'Figure');

  // Paradigm summary → the skeleton; Network list → the members; both are whole-document.
  assert.equal(summary.retrieve.retrieval, 'structural', 'a Paradigm summary spreads across the skeleton');
  assert.equal(list.retrieve.retrieval,    'network',    'a Network list reads the figure-bearing units');
  // Figure-grain tasks retrieve at a point — neither the skeleton nor the member network.
  assert.notEqual(lookup.retrieve.retrieval, 'structural', 'a Figure lookup retrieves at a point');
  assert.notEqual(lookup.retrieve.retrieval, 'network',    'a Figure lookup is not a member read');
  assert.ok(!why.retrieve.retrieval, 'a Figure explain stays on the default (pointed) path');

  // The two Pattern reads are genuinely different evidence, not the same spread relabelled.
  const summarySpans = (summary.retrieve.spans || []).map(s => s.idx).join(',');
  const listSpans    = (list.retrieve.spans || []).map(s => s.idx).join(',');
  assert.notEqual(summarySpans, listSpans, 'Paradigm and Network select different units');
});
