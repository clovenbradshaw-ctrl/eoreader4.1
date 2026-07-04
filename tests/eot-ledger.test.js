import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEotLedger, lineOf, slug, LEDGER_OPS } from '../src/audit/eot-ledger.js';
import { parseEOT } from '../src/ingest/index.js';
import { fromPerceiver, fromEnactor, canWitness, classify } from '../src/core/index.js';

// The EOT ledger (docs/eot-ledger.md) is a second reading of the operation stream, rendered
// in the engine's own nine-operator syntax. Two things must hold, or the "auditable in EOT"
// claim is cosmetic: (1) the export must re-parse through the REAL ingester with no loss, and
// (2) the door it stamps must be the door core's type law would assign — reading witnesses,
// generation does not.

// a fixed clock so the ~ts trailers are deterministic and replay-safe (Date.now is banned
// in some hosts; the ledger takes an injected `now`).
const fixedNow = () => 1751655600000;   // 2026-07-04T19:00:00Z

test('every operation lowers to a canonical EOT line that re-parses through parseEOT', () => {
  const L = createEotLedger({ now: fixedNow });
  L.read({ source: 'https://www.gutenberg.org/files/1342/1342-0.txt', title: 'Pride and Prejudice', props: 4213 });
  L.search({ query: 'ancient astronomy' });
  L.found({ urls: ['https://en.wikipedia.org/wiki/Astronomy', 'https://example.org/a'] });
  L.learned({ entity: 'Elizabeth Bennet', type: 'Person' });
  L.route({ turn: 't7', route: 'grounded', task: 'summary' });
  L.retrieve({ turn: 't7', n: 6, top: 0.71 });
  L.prompt({ turn: 't7', text: 'system: …\n\nuser: Spans: [s2] …' });
  L.generate({ turn: 't7', text: 'Elizabeth refused Darcy. [s2]', ms: 475 });
  L.bind({ claim: 'Elizabeth refused Darcy', cite: 's2', score: 0.83 });
  L.veto({ turn: 't7', id: 'c1', message: 'low coverage' });
  L.revise({ turn: 't7', why: 'confabulated at a void' });

  const doc = L.exportEot();
  const { events, diagnostics } = parseEOT(doc);
  assert.equal(diagnostics.length, 0, `the ledger export must re-parse cleanly:\n${JSON.stringify(diagnostics, null, 2)}\n---\n${doc}`);

  // every emitted operator survives the round-trip
  const ops = new Set(events.map(e => e.op));
  for (const op of ['CON', 'SYN', 'INS', 'SIG', 'DEF', 'EVA', 'SEG']) {
    assert.ok(ops.has(op), `${op} present after re-parse`);
  }
  // the count of parsed events equals the count of ledger records (no line silently dropped)
  assert.equal(events.length, L.size, 'one parsed event per ledger record');
});

test('the door is the §8 type law, read off core — reading witnesses, generation does not', () => {
  const L = createEotLedger({ now: fixedNow });
  const r = L.read({ source: 'https://example.org/page' });   // the world came in
  const g = L.generate({ turn: 't1', text: 'an answer' });     // the model authored it

  // the ledger's own stamp
  assert.equal(r.door, 'perceiver');
  assert.equal(r.witness, true);
  assert.equal(g.door, 'enactor');
  assert.equal(g.witness, false);

  // and it agrees with core's provenance law — the tie is structural, not decorative
  assert.equal(canWitness(fromPerceiver()), r.witness, 'reading == perceiver == can witness');
  assert.equal(canWitness(fromEnactor()), g.witness, 'generation == enactor == cannot witness');
  assert.equal(classify(fromEnactor()), 'reafference', 'generation is the model\'s own — reafference');
});

test('a read URL slugs to a re-parseable IDENT while the verbatim source is kept in raw', () => {
  const L = createEotLedger({ now: fixedNow });
  const url = 'https://www.gutenberg.org/files/1342/1342-0.txt';
  const rec = L.read({ source: url, title: 'Pride and Prejudice', props: 4213 });
  // surface line is one clean CON that parses to exactly one event
  const { events, diagnostics } = parseEOT(rec.eot);
  assert.equal(diagnostics.length, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].op, 'CON');
  assert.equal(events[0].operand.relation, 'read');
  // the audit keeps the untouched source and the prop count
  assert.equal(rec.raw.source, url);
  assert.equal(rec.raw.props, 4213);
});

test('the verbatim prompt and output ride in raw — the load-bearing audit artifact', () => {
  const L = createEotLedger({ now: fixedNow });
  const prompt = 'system: only answer from the spans.\n\nuser: Spans:\n[s2] Darcy proposed.\n\nQuestion: what happened?';
  const output = 'Darcy proposed to Elizabeth. [s2]';
  L.prompt({ turn: 't3', text: prompt });
  L.generate({ turn: 't3', text: output, ms: 512 });

  const rows = L.exportJsonl().split('\n').map(JSON.parse);
  const p = rows.find(r => r.kind === 'prompt');
  const g = rows.find(r => r.kind === 'generate');
  assert.equal(p.raw.prompt, prompt, 'the prompt is preserved verbatim');
  assert.equal(g.raw.output, output, 'the output is preserved verbatim');
  // the surface line stays token-frugal — it names the shape, not the whole text
  assert.match(p.eot, /turn:t3\.prompt = "\d+ chars"/);
});

test('the ring buffer holds the last N and counts what rolled off — never a silent drop', () => {
  const L = createEotLedger({ capacity: 3, now: fixedNow });
  for (let i = 0; i < 5; i++) L.route({ turn: `t${i}`, route: 'chat' });
  assert.equal(L.size, 3, 'capacity is honored');
  assert.equal(L.overflow, 2, 'the two dropped records are counted');
  const snap = L.snapshot();
  assert.equal(snap[0].target, 'turn:t2', 'the oldest survivor is t2');
  assert.equal(snap[2].target, 'turn:t4', 'the newest is t4');
  assert.match(L.exportEot(), /\+2 rolled off/, 'the export reports the drop honestly');
});

test('subscribers see each operation live, in order', () => {
  const L = createEotLedger({ now: fixedNow });
  const seen = [];
  const off = L.subscribe((rec) => { if (rec) seen.push(rec.kind); });
  L.read({ source: 'https://a.test' });
  L.route({ turn: 't1', route: 'grounded' });
  L.generate({ turn: 't1', text: 'x' });
  off();
  L.route({ turn: 't2', route: 'chat' });   // after unsubscribe — not seen
  assert.deepEqual(seen, ['read', 'route', 'generate']);
});

test('lineOf covers all nine operators as valid EOT shapes', () => {
  const cases = [
    { op: 'INS', target: 'Alice', operand: { type: 'Person' } },
    { op: 'SIG', target: 'Alice', operand: { designation: 'VIP' } },
    { op: 'DEF', target: 'Alice.age', operand: { value: 30 } },
    { op: 'NUL', target: 'Alice.email', operand: {} },
    { op: 'CON', target: 'Alice', operand: { to: 'Bob', relation: 'knows' } },
    { op: 'SYN', target: 'Region', operand: { parts: ['TN', 'KY'] } },
    { op: 'SEG', target: 'Cases', operand: { key: 'status' } },
    { op: 'EVA', target: 'Alice.tier', operand: { from: 'Bronze', to: 'Gold' } },
    { op: 'REC', target: 'vocabulary:status', operand: { old_terms: ['active'], new_terms: ['enrolled', 'waitlisted'] } },
  ];
  assert.equal(cases.length, LEDGER_OPS.length, 'one case per operator');
  const text = cases.map(c => lineOf({ ...c })).join('\n');
  const { events, diagnostics } = parseEOT(text);
  assert.equal(diagnostics.length, 0, `all nine shapes parse:\n${text}`);
  assert.equal(events.length, 9);
});

test('slug produces clean, re-parseable identifiers from arbitrary text', () => {
  assert.equal(slug('https://a.b/c?d=1'), 'https-a-b-c-d-1');
  assert.equal(slug('  Elizabeth Bennet!  '), 'Elizabeth-Bennet');
  assert.equal(slug(''), 'x');
  assert.match(slug('a/b:c.d'), /^[A-Za-z0-9-]+$/);
});
