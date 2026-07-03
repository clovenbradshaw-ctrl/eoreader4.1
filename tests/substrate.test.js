import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { structureSurface, serializeNotes, composeGroupedNote, NOTE_GROUPS } from '../src/perceiver/index.js';
import {
  buildSubstrate, substrateToEOT, substrateToJSONLD,
  projectNotes, projectGroupedNote, assertNotesNoLeak, foldNote,
} from '../src/fold/index.js';

// A hand-built structure (the shape structureSurface returns) with the two shapes the
// Significance face holds open: a referent given two competing fills, and a bond both
// affirmed and denied. Lets the substrate be exercised without leaning on the parser's
// DEF heuristics.
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

// ── P0 — the grouped serializer (surfaces.js) ────────────────────────────────

test('composeGroupedNote heads the three groups and omits the empty ones', () => {
  const text = composeGroupedNote({
    settled: ['Gregor -> his job : worries-about'],
    heldOpen: ['Gregor: the document gives both A and B and settles neither.'],
    turns: [],
  });
  assert.match(text, /^What the document settles:\nGregor -> his job : worries-about/);
  assert.match(text, /What the document holds open \(do not settle these\):/);
  assert.doesNotMatch(text, /Where the reading turns:/, 'an empty group is omitted');
});

test('composeGroupedNote with only the settled group is the EOT lines under one header', () => {
  const text = composeGroupedNote({ settled: ['a -> b : binds'] });
  assert.equal(text, `${NOTE_GROUPS.settled}\na -> b : binds`);
});

// ── P1 — the substrate as a fold, and the round-trip measurement ─────────────

test('the substrate round-trips to today\'s arrows (a superset of the current notes)', () => {
  const doc = parseText(
    'Gregor Samsa was a traveling salesman. Gregor woke as a vermin. The chief clerk came to the apartment. The clerk pressed Gregor.',
    { docId: 'm' });
  const idxs = (doc.units || doc.sentences).map((_, i) => i);
  const structure = structureSurface(doc, idxs);
  const substrate = buildSubstrate({ structure });
  assert.deepEqual(substrateToEOT(substrate), serializeNotes(structure),
    'stripping the band and the nodes reproduces serializeNotes exactly');
});

test('the substrate is a read-time projection — assertions and values carry a band, never new state', () => {
  const substrate = buildSubstrate({ structure: STRUCT });
  assert.ok(substrate.assertions.every(a => a.band === 'firm' && a.s.label && a.o.label));
  assert.ok(substrate.values.every(v => v.band === 'firm' && v.label && v.value));
  assert.equal(substrate['@context'].eo, 'https://experientialontology.org/ns#');
});

test('substrateToJSONLD renders the firm graph as JSON-LD with a label on every node', () => {
  const jsonld = substrateToJSONLD(buildSubstrate({ structure: STRUCT }), 'gregor');
  assert.equal(jsonld['@id'], 'doc:gregor');
  assert.equal(jsonld.label, 'Gregor');                       // the rdfs:label — the field a naive reader reads
  assert.ok(jsonld['@context'].label.includes('rdf-schema#label'));
  const props = Object.keys(jsonld).filter(k => jsonld[k] && jsonld[k]['@id']?.startsWith('doc:'));
  assert.ok(props.length >= 1, 'at least one typed property points at a labelled individual');
  assert.ok(jsonld[props[0]].label, 'the object individual carries its own label');
});

// ── P2 — the Tension detector ────────────────────────────────────────────────

test('detectTensions mints a held node for competing fills and for a polarity clash', () => {
  const substrate = buildSubstrate({ structure: STRUCT });
  const kinds = substrate.tensions.map(t => t.kind).sort();
  assert.deepEqual(kinds, ['competing-fills', 'polarity-clash']);
  assert.ok(substrate.tensions.every(t => t.resolved === false), 'a tension is held, never resolved');
  // the competing fills name both values, settling neither
  const fills = substrate.tensions.find(t => t.kind === 'competing-fills');
  assert.match(fills.label, /traveling salesman/);
  assert.match(fills.label, /monstrous insect/);
  assert.match(fills.label, /settles neither/);
});

test('a tension flags its members held, so they leave the settled group', () => {
  const substrate = buildSubstrate({ structure: STRUCT });
  assert.ok(substrate.values.every(v => v.heldBy), 'both competing fills are claimed by the tension');
  const clash = substrate.assertions.filter(a => a.o.id === 'vermin');
  assert.ok(clash.every(a => a.heldBy), 'both poles of the clash are claimed');
});

test('a single fill, no clash, is corroboration — no tension', () => {
  const clean = {
    figures: [{ id: 'gregor', label: 'Gregor', count: 1 }],
    relations: [{ src: { id: 'gregor', label: 'Gregor' }, tgt: { id: 'job', label: 'his job' }, via: 'worries about', polarity: '+' }],
    defs: [{ id: 'gregor', label: 'Gregor', value: 'a salesman' }],
    merges: [], splits: [],
  };
  assert.equal(buildSubstrate({ structure: clean }).tensions.length, 0);
});

// ── P3 — the membrane ────────────────────────────────────────────────────────

test('projectNotes routes held facts to held-open and keeps the rest settled', () => {
  const groups = projectNotes(buildSubstrate({ structure: STRUCT }));
  assert.deepEqual(groups.settled, ['Gregor -> his job : worries-about'],
    'only the un-held firm fact stays settled');
  assert.equal(groups.heldOpen.length, 2, 'both tensions are voiced as held-open lines');
  assert.ok(groups.heldOpen.some(l => /affirms and denies/.test(l)));
});

test('the membrane drops every graph token; the leak guard throws on one', () => {
  const text = projectGroupedNote(buildSubstrate({ structure: STRUCT }));
  // indistinguishability: no IRI, no node id, no band, no type token survives
  assert.doesNotMatch(text, /eo:|https?:\/\/|@id|rdfs:|band|Tension|Reframing|atSentence|\[s\d+\]/);
  // the guard is real
  assert.throws(() => assertNotesNoLeak('see eo:wokeAs'), /membrane leak/);
  assert.throws(() => assertNotesNoLeak('as in [s12]'), /membrane leak/);
  assert.doesNotMatch('126 years after my death', /membrane leak/);   // a plain integer is not a leak
  assert.equal(assertNotesNoLeak('Gregor woke as a vermin.'), true);
});

// ── Wiring — foldNote behind the grouped flag ────────────────────────────────

test('foldNote: the grouped path heads the notes; the flat path is unheaded (parity off)', () => {
  const doc = parseText(
    'Gregor Samsa was a traveling salesman. Gregor woke as a vermin. The chief clerk came. The clerk pressed Gregor.',
    { docId: 'm' });
  const spans = (doc.units || doc.sentences).map((text, idx) => ({ idx, text, score: 1 }));

  const flat = foldNote(spans, { doc, cursor: 1, focus: [], grouped: false });
  assert.doesNotMatch(flat.text, /What the document settles:/, 'flag off is the flat note — no headers');

  const grouped = foldNote(spans, { doc, cursor: 1, focus: [], grouped: true });
  assert.match(grouped.text, /What the document settles:/, 'flag on heads the settled group');
  assert.ok(grouped.substrate, 'the grouped note carries its substrate');
  assert.doesNotMatch(grouped.text, /eo:|\[s\d+\]/, 'no graph token crosses to the talker');
});
