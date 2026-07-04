import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { ingestText } from '../src/organs/in/text.js';
import { eotDoc, parseEOT } from '../src/ingest/eot.js';
import { readIngest } from '../src/ingest/read.js';
import { enactedReadingTo } from '../src/enact/index.js';

// ingest/read.js — the moment of ingest reads the whole document through every predictive
// channel the engine has and renders it as ONE EoT document: the structure it extracted
// (round-trippable canonical EoT) beside what it PREDICTED and where it was SURPRISED at each
// turning point (comments). "Turn it all into read-EoT, with different layers of thinking."

const STORY = '# Doc\n' +
  'The office opened as usual. Papers were filed. The clerk sorted the mail. Routine held all morning. ' +
  'A courier arrived with a sealed crate nobody had ordered. The crate was opened and the room changed. ' +
  'Work stopped. The records were sealed. Filing resumed days later. The clerk sorted the mail again.';

test('readIngest renders both layers — structure AND the thinking at the turning points', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const r = readIngest(doc);

  assert.equal(r.docId, 'd.md');
  assert.ok(r.units > 0, 'reports the document length');
  assert.ok(Array.isArray(r.structure.lines), 'a structure layer');
  assert.ok(r.structure.lines.length > 0, 'the log read out as canonical EoT is non-empty');

  // The thinking layer: turning points, each carrying the predictive channels.
  assert.ok(Array.isArray(r.turns) && r.turns.length > 0, 'the reading turned somewhere');
  assert.deepEqual(r.turns.map(t => t.idx), [...r.turns.map(t => t.idx)].sort((a, b) => a - b),
    'turns come back in reading order');
  const t = r.turns[0];
  assert.ok(typeof t.surprisalBits === 'number', 'the novelty channel (surprisal)');
  assert.ok(typeof t.bayesBits === 'number', 'the significance channel (Δbelief)');
  assert.ok(Array.isArray(t.predicted), 'the prediction — who it expected to act next');
  assert.ok(Array.isArray(t.surprises), 'the named EO-tagged surprises');

  // The whole thing is ONE document, structure + thinking.
  assert.ok(r.text.includes('what it takes to exist and connect'));
  assert.ok(r.text.includes('where the reading turned'));
});

test('the rendered read is valid EoT — comments are legal, structure round-trips', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const r = readIngest(doc);

  // The whole document parses as EoT with no malformed lines: the thinking rides as `#`
  // comments (§4.2), the structure as canonical triples.
  const parsed = parseEOT(r.text);
  assert.equal(parsed.diagnostics.length, 0, `no malformed lines: ${JSON.stringify(parsed.diagnostics.slice(0, 3))}`);

  // The structure layer on its own recovers real events — it is the round-trippable layer.
  const struct = parseEOT(r.structure.text);
  assert.ok(struct.events.length > 0, 'the structure layer lowers back to EO events');
  assert.equal(struct.diagnostics.length, 0, 'and it does so cleanly');
});

test('readIngest is pure and memoised — same doc, same reading, identity-cached', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const a = readIngest(doc);
  const b = readIngest(doc);
  assert.strictEqual(a, b, 'the default read is cached by doc identity');
  assert.deepEqual(a.turns.map(t => t.idx), b.turns.map(t => t.idx));
});

test('the injected enacted layer adds the frame-restructuring channel', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const r = readIngest(doc, { enacted: (d) => enactedReadingTo(d, (d.units || d.sentences).length - 1) });
  assert.ok(r.enacted, 'the frame layer is present when enactedReadingTo is injected');
  assert.ok(Array.isArray(r.enacted.recs), 'it carries the RECs (the restructurings)');
  assert.ok(r.text.includes('where the reading\'s frame broke'), 'and renders the frame layer');
});

test('ingestText attaches a lazy, memoised reading() — ingest OWNS the read', async () => {
  const doc = await ingestText(STORY);
  assert.equal(typeof doc.reading, 'function', 'the doc carries its own reading accessor');
  const r1 = doc.reading();
  const r2 = doc.reading();
  assert.strictEqual(r1, r2, 'memoised — computed once');
  assert.ok(r1.structure.lines.length > 0 && r1.turns.length >= 0, 'and it is a real read');
});

test('an EoT document reads itself — eotDoc carries the same accessor', () => {
  const doc = eotDoc('Alice : Person\nBob : Person\nAlice -> Bob : trusts\nAlice.age = 30');
  assert.equal(typeof doc.reading, 'function', 'a reloaded EoT spine reads itself too');
  const r = doc.reading();
  assert.ok(r.structure.lines.length > 0, 'its structure reads out');
  const parsed = parseEOT(r.text);
  assert.equal(parsed.diagnostics.length, 0, 'and the read is valid EoT');
});

test('readIngest is unfazed by a trivial / empty spine', () => {
  const empty = parseText('', { docId: 'empty' });
  const r = readIngest(empty);
  assert.equal(r.units, 0);
  assert.ok(typeof r.text === 'string', 'still a string, no throw');
});
