import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSubstrate,
  MODE_OF, FATE_OF, modeOf, verdictOf, classifyTensions, recEventsOf,
  sayability, routeSubstrate, VERBALIZABLE, NARRATE_ONLY,
} from '../src/fold/index.js';

// The hand-built structure from substrate.test.js — the two shapes the Significance
// face holds open: a referent given two competing fills (t0) and a bond both
// affirmed and denied (t1). Every verdict test reads tensions minted by the REAL
// detector, never hand-rolled tension nodes.
const STRUCT = {
  figures: [{ id: 'gregor', label: 'Gregor', count: 3 }],
  relations: [
    { src: { id: 'gregor', label: 'Gregor' }, tgt: { id: 'vermin', label: 'a vermin' }, via: 'woke as', polarity: '+' },
    { src: { id: 'gregor', label: 'Gregor' }, tgt: { id: 'job', label: 'his job' }, via: 'worries about', polarity: '+' },
    { src: { id: 'gregor', label: 'Gregor' }, tgt: { id: 'vermin', label: 'a vermin' }, via: 'woke as', polarity: '−' },
  ],
  defs: [
    { id: 'gregor', label: 'Gregor', value: 'a traveling salesman' },
    { id: 'gregor', label: 'Gregor', value: 'a monstrous insect' },
  ],
  merges: [], splits: [],
};

const substrate = () => buildSubstrate({ structure: STRUCT });

// ── the mode table and the ternary ───────────────────────────────────────────

test('the mode axis partitions the nine operators 3/3/3 and the verdict follows the mode', () => {
  const byMode = { differentiate: [], relate: [], generate: [] };
  for (const [op, mode] of Object.entries(MODE_OF)) byMode[mode].push(op);
  assert.deepEqual(byMode.differentiate.sort(), ['DEF', 'NUL', 'SEG']);
  assert.deepEqual(byMode.relate.sort(), ['CON', 'EVA', 'SIG']);
  assert.deepEqual(byMode.generate.sort(), ['INS', 'REC', 'SYN']);

  for (const op of byMode.relate) assert.equal(verdictOf(op), 'sustained');
  for (const op of byMode.differentiate) assert.equal(verdictOf(op), 'spent-down');
  for (const op of byMode.generate) assert.equal(verdictOf(op), 'spent-up');
  assert.equal(modeOf('ZZZ'), null);
  assert.equal(verdictOf('ZZZ'), null);
});

test('FATE_OF names all nine fates of the EVA row, one per successor', () => {
  assert.deepEqual(
    Object.keys(FATE_OF).sort(),
    Object.keys(MODE_OF).sort(),
    'every operator closes a tension under some name');
  assert.equal(FATE_OF.EVA, 'irony');
  assert.equal(FATE_OF.DEF, 'sarcasm');
  assert.equal(FATE_OF.SYN, 'sublation');
  assert.equal(FATE_OF.REC, 'metaphor');
});

// ── living or dead: the successor-mode verdict ───────────────────────────────

test('a tension with no successor is sustained — the substrate default is life', () => {
  const out = classifyTensions(substrate(), []);
  assert.equal(out.length, 2, 'competing fills and a polarity clash');
  for (const r of out) {
    assert.equal(r.verdict, 'sustained');
    assert.equal(r.fate, 'held');
    assert.equal(r.successor, null);
    assert.equal(r.trajectory.length, 0);
    assert.ok(Object.isFrozen(r));
  }
});

test('a DEF touching the referent spends the tension down — sarcasm: pick a side', () => {
  const out = classifyTensions(substrate(), [
    { op: 'DEF', ref: 'gregor', value: 'a salesman after all', cursor: 9 },
  ]);
  const t0 = out.find((r) => r.kind === 'competing-fills');
  assert.equal(t0.verdict, 'spent-down');
  assert.equal(t0.fate, 'sarcasm');
  assert.equal(t0.successor, 'DEF');
  assert.equal(t0.trajectory[0].at, 9);
});

test('a REC along the referent axis spends the tension up — metaphor: a new frame', () => {
  const out = classifyTensions(substrate(), [
    { op: 'REC', alongAxis: ['Gregor', 'the family'], cursor: 12 },
  ]);
  for (const r of out) {
    assert.equal(r.verdict, 'spent-up', `${r.tension} closes upward`);
    assert.equal(r.fate, 'metaphor');
  }
});

test('an EVA re-holding the referent sustains it — irony: held because holding is productive', () => {
  const out = classifyTensions(substrate(), [
    { op: 'EVA', reflection: true, register: 'enacted', focus: 'Gregor', verdict: 'strain', body: 'still both' },
  ]);
  const t0 = out.find((r) => r.kind === 'competing-fills');
  assert.equal(t0.verdict, 'sustained');
  assert.equal(t0.fate, 'irony');
  assert.equal(t0.successor, 'EVA');
});

test('the last toucher decides; the trajectory keeps the career', () => {
  const out = classifyTensions(substrate(), [
    { op: 'EVA', reflection: true, focus: 'Gregor', cursor: 4 },   // held again…
    { op: 'DEF', ref: 'gregor', value: 'an insect', cursor: 11 },  // …then a side is picked
  ]);
  const t0 = out.find((r) => r.kind === 'competing-fills');
  assert.equal(t0.trajectory.length, 2, 'the career is kept whole');
  assert.deepEqual(t0.trajectory.map((m) => m.fate), ['irony', 'sarcasm']);
  assert.equal(t0.verdict, 'spent-down', 'the last toucher is the current state');
});

test('a bears-on connection touches the tension by its own id — juxtaposed, sustained', () => {
  const out = classifyTensions(substrate(), [
    { op: 'CON', connection: true, kind: 'bears-on', a: 3, b: 't0', body: 'the reflection bears on it' },
  ]);
  const t0 = out.find((r) => r.tension === 't0');
  const other = out.find((r) => r.tension !== 't0');
  assert.equal(t0.fate, 'juxtaposed');
  assert.equal(t0.verdict, 'sustained');
  assert.equal(other.trajectory.length, 0, 'the id touch is per-tension, not broadcast');
});

test('a polarity-clash tension is disambiguated by a SEG on its endpoint', () => {
  const out = classifyTensions(substrate(), [
    { op: 'SEG', about: 'a vermin', cursor: 7 },
  ]);
  const t1 = out.find((r) => r.kind === 'polarity-clash');
  const t0 = out.find((r) => r.kind === 'competing-fills');
  assert.equal(t1.verdict, 'spent-down');
  assert.equal(t1.fate, 'disambiguated');
  assert.equal(t0.trajectory.length, 0, '"a vermin" is t1\'s endpoint, not t0\'s');
});

test('off-alphabet events are not moves and never touch', () => {
  const out = classifyTensions(substrate(), [
    { op: 'ZZZ', focus: 'Gregor' },
    { focus: 'Gregor' },
    null,
  ]);
  for (const r of out) assert.equal(r.trajectory.length, 0);
});

test('recEventsOf adapts the surfer\'s located RECs to successor-shaped events', () => {
  const events = recEventsOf({ recAxes: [{ cursor: 5, alongAxis: ['Gregor'], trigger: 'strain', layer: 'L2' }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].op, 'REC');
  assert.equal(events[0].cursor, 5);
  const out = classifyTensions(substrate(), events);
  assert.equal(out[0].fate, 'metaphor');
  assert.deepEqual(recEventsOf(null), [], 'no surf → no events, no throw');
});

// ── sayable or not: the router ───────────────────────────────────────────────

test('reframings and held tensions are narrate-only; firm arrows and analogies verbalize', () => {
  const sub = substrate();

  const reframing = { id: 'r0', atSentence: 5, alongAxis: ['duty'], trigger: 'strain', layer: null };
  assert.equal(sayability(reframing).route, NARRATE_ONLY);

  assert.equal(sayability(sub.tensions[0]).route, NARRATE_ONLY, 'a held tension is voiced, not asserted');

  const free = sub.assertions.find((a) => !a.heldBy);           // worries-about — unclaimed
  assert.equal(sayability(free).route, VERBALIZABLE);

  const analogy = { id: 'c0', kind: 'analogy', a: 'Acme', b: 'Umbra', reading: 'same role', sameness: 0.8, band: 'void', witness: 'reafferent' };
  assert.equal(sayability(analogy).route, VERBALIZABLE,
    'void AND verbalizable — the line is the operator signature, not the band');
});

test('EVA nodes route by verdict; members claimed by a tension route to the tension', () => {
  const sub = substrate();

  const strain = { id: 'f0', about: 'Gregor', reading: 'both readings live', verdict: 'strain', band: 'void', witness: 'reafferent', grounded: false };
  assert.equal(sayability(strain).route, NARRATE_ONLY, 'an open judgment is still holding');

  const confirm = { ...strain, id: 'f1', verdict: 'confirm' };
  assert.equal(sayability(confirm).route, VERBALIZABLE, 'a settled judgment is a flat report');

  const claimed = sub.values.find((v) => v.heldBy);             // a competing fill
  assert.equal(sayability(claimed).route, NARRATE_ONLY, 'the tension speaks for its members');

  assert.equal(sayability(null).route, NARRATE_ONLY, 'caution is the default route');
  assert.equal(sayability({ op: 'SIG', focus: 'x' }).route, VERBALIZABLE, 'a flat noticing hands over clean');
});

test('routeSubstrate partitions a mixed substrate and freezes the result', () => {
  const sub = buildSubstrate({
    structure: STRUCT,
    reflections: [
      { cursor: 3, focus: 'Gregor', body: 'both readings live', verdict: 'strain' },
      { cursor: 6, focus: 'his job', body: 'a plain worry', verdict: 'confirm' },
    ],
    connections: [
      { kind: 'analogy', a: 'Gregor', b: 'K.', aCursor: 1, bCursor: 2, body: 'same role', sameness: 0.7 },
    ],
  });
  const routed = routeSubstrate(sub);

  assert.ok(Object.isFrozen(routed) && Object.isFrozen(routed.verbalizable) && Object.isFrozen(routed.narrateOnly));

  const narr = routed.narrateOnly;
  assert.ok(narr.some((n) => n.group === 'tensions'), 'held tensions are narrate-only');
  assert.ok(narr.some((n) => n.group === 'values'), 'claimed fills route to their tension');
  assert.ok(narr.some((n) => n.group === 'reflections'), 'the straining reflection holds');

  const verb = routed.verbalizable;
  assert.ok(verb.some((n) => n.group === 'assertions'), 'the unclaimed arrow verbalizes');
  assert.ok(verb.some((n) => n.group === 'connections'), 'the analogy verbalizes');
  assert.ok(verb.some((n) => n.group === 'reflections'), 'the settled reflection verbalizes');

  const total = (sub.assertions.length + sub.values.length + sub.tensions.length
    + sub.reframings.length + sub.reflections.length + sub.metaReflections.length + sub.connections.length);
  assert.equal(verb.length + narr.length, total, 'nothing dropped, nothing double-routed');
});
