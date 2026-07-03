import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createCompositeDoc } from '../src/organs/in/index.js';
import { admitWebSource } from '../src/ingest/websource.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import {
  auditPropositions, personClusters, readOffice, personKey, meaningfulSupport,
} from '../src/factcheck/index.js';

// The single person in a one-subject corpus (the office cluster the audit grades against).
const personOf = (doc) => [...personClusters(doc).clusters.values()][0];

// The proposition channel (docs/proposition-audit.md): the DEF/claim-grain sibling
// of the edge-grounding veto. The edge veto is EDGES-ONLY — a single-argument
// predication ("O'Connell is a council member") makes no edge and slips it. This
// channel evaluates every DEF proposition the answer asserts against the sources'
// own DEF propositions read AT THE CURSOR where each sits, and catches a stale
// exclusive office: the O'Connell case, where a year-old "council member" survived
// while the corpus says "Mayor O'Connell".
//
// Offline by construction: a web source is `admitWebSource(...).doc`; the research
// scope is `createCompositeDoc([...])`. No model, no network.

const webDoc = (text, i = 0) => admitWebSource({ url: `https://w/${i}`, text }).doc;
const scope  = (texts) => createCompositeDoc(texts.map((t, i) => webDoc(t, i)));

// ── readOffice: the office lexicon and its two tiers ─────────────────────────

test('readOffice canonicalises office heads and flags exclusivity', () => {
  assert.equal(readOffice('the mayor of Nashville').head, 'mayor');
  assert.equal(readOffice('a Metro Council member').head, 'councilmember', 'multiword collapses to one seat');
  assert.equal(readOffice('a councilwoman').head, 'councilmember', 'variants collapse to the seat');
  assert.equal(readOffice('the mayor').exclusive, true, 'mayor is a one-at-a-time seat');
  assert.equal(readOffice('the chair of the board').exclusive, false, 'chair co-occurs — not exclusive');
  assert.equal(readOffice('a famous novelist'), null, 'a non-office predicate is not an office');
});

test('readOffice reads a value-level FORMER marker', () => {
  assert.equal(readOffice('a former council member').former, true);
  assert.equal(readOffice('the onetime governor').former, true);
  assert.equal(readOffice('the mayor').former, false);
});

// ── personKey: the candidate-blocking name token (NOT the identity decision) ──

test('personKey keys a label on its name token, stripping titles and qualifiers', () => {
  // Used only to PROPOSE same-name candidates; the bridge is decided by relationships.
  assert.equal(personKey('Mayor Freddie OConnell'), 'oconnell');
  assert.equal(personKey('Freddie OConnell'), 'oconnell');
  assert.equal(personKey('OConnell'), 'oconnell');
  assert.equal(personKey('former OConnell'), 'oconnell', 'a time-qualifier is not the name');
  assert.equal(personKey('the mayor'), null, 'a bare title names no person');
});

// ── personClusters: the sources' offices, per person, read at the correct cursor ──

test('a person carries a current office and a former office, each at its own cursor', () => {
  // One pocket universe (within-document coref unifies the mentions): mayor current,
  // council member past-framed → former.
  const doc = scope(['OConnell is the mayor of Nashville. As a council member, OConnell was a chief critic. OConnell is now a former council member.']);
  const oc = personOf(doc);
  assert.ok(oc, 'the person clusters out of the universe');
  assert.deepEqual([...oc.current.keys()], ['mayor'], 'the present-tense office is current');
  assert.ok(oc.former.has('councilmember'), 'the past-framed office is former, not current');
  assert.ok(!oc.current.has('councilmember'), 'the former office is NOT counted current');
});

test('an appositive title in the entity label counts as a current office', () => {
  // "Mayor Freddie O'Connell backed …" never appears as a copular DEF — the title is
  // folded into the entity label. It must still register as the current office.
  const oc = personOf(webDoc('Mayor Freddie OConnell backed the contract.'));
  assert.ok(oc && oc.current.has('mayor'), 'the appositive title is mined as a current office');
});

test('two same-name people in different universes do NOT merge by name', () => {
  // A Nashville mayor and a Salt Lake City council member named Smith — distinct current
  // exclusive seats, no shared discriminator → the pocket-universe physics forks them.
  const doc = scope(['Frank Smith is the mayor of Nashville.', 'Frank Smith is a council member of Salt Lake City.']);
  const people = [...personClusters(doc).clusters.values()];
  assert.equal(people.length, 2, 'name alone never merges two people');
});

test('same-name referents that converge on a shared relationship bridge into one person', () => {
  // Two universes, both naming O'Connell AND both bound to Fusus → convergence promotes
  // the same_as bridge: one person, mayor.
  const doc = scope(['Mayor OConnell backed Fusus.', 'OConnell is the mayor of Nashville. OConnell backed Fusus.']);
  const people = [...personClusters(doc).clusters.values()];
  assert.equal(people.length, 1, 'shared relationships (not the name) earn the bridge');
  assert.ok(people[0].current.has('mayor'));
});

// ── auditPropositions: the catch and its guards ──────────────────────────────

test('THE OCONNELL CATCH: a stale exclusive office is superseded by the current one', () => {
  const doc = scope([
    'Mayor Freddie OConnell backed the Fusus surveillance contract.',
    'OConnell is the mayor of Nashville. He worked to pass the legislation.',
    'As a council member, OConnell was a chief critic of police technology.',
  ]);
  const audit = auditPropositions({ prose: 'Freddie OConnell is a Metro Council member.', doc });
  const v = audit.verdicts.find(x => x.office === 'councilmember');
  assert.ok(v, 'the answer’s council-member claim is evaluated');
  assert.equal(v.verdict, 'superseded');
  assert.equal(v.supersededBy[0].head, 'mayor', 'superseded by the current mayor');
  assert.ok(v.citation, 'the current office earns a citation');
  assert.equal(audit.counts.superseded, 1);
  assert.equal(audit.fired.length, 1);
  assert.equal(audit.fired[0].refuses, false, 'flag-and-tell — it never refuses');
  assert.match(audit.corrections[0], /mayor/);
});

test('a correct answer naming the current office never fires (but a single source is weak)', () => {
  const doc = scope(['OConnell is the mayor of Nashville.']);
  const audit = auditPropositions({ prose: 'OConnell is the mayor.', doc });
  assert.equal(audit.counts.superseded, 0);
  assert.equal(audit.counts.stale, 0);
  assert.equal(audit.counts.placeMismatch, 0);
  assert.equal(audit.fired.length, 0, 'a correct office raises no correction flag');
  // One mention is not a flat fact — it is single-source, the trigger to seek a second.
  assert.equal(audit.counts.singleSource, 1);
  assert.equal(audit.weak[0].support, 1);
});

// ── Corroboration: ≥2 meaningfully-different sources, not verbatim ─────────────

test('two meaningfully-different sources corroborate; one mention stays single-source', () => {
  const two = scope(['OConnell is the mayor of Nashville.', 'Mayor OConnell signed the transit budget.']);
  const a = auditPropositions({ prose: 'OConnell is the mayor.', doc: two });
  assert.equal(a.counts.corroborated, 1, 'two independent witnesses → corroborated');
  assert.equal(a.counts.singleSource, 0);
  assert.equal(a.weak.length, 0);
});

test('verbatim republication across sources is ONE witness, not two (syndication collapse)', () => {
  const syndicated = scope(['OConnell is the mayor of Nashville.', 'OConnell is the mayor of Nashville.']);
  const a = auditPropositions({ prose: 'OConnell is the mayor.', doc: syndicated });
  assert.equal(a.counts.corroborated, 0, 'the same sentence on two sites is not two supports');
  assert.equal(a.counts.singleSource, 1);
});

test('repeated mention within ONE source is one witness', () => {
  const oneSrc = scope(['OConnell is the mayor. Mayor OConnell signed the budget.']);
  const a = auditPropositions({ prose: 'OConnell is the mayor.', doc: oneSrc });
  assert.equal(a.counts.singleSource, 1, 'same source, twice → still one witness');
  assert.equal(a.weak[0].support, 1);
});

test('meaningfulSupport collapses same-source and near-duplicate witnesses', () => {
  const s = (source, text) => ({ source, text });
  assert.equal(meaningfulSupport([s('a', 'OConnell is the mayor of Nashville')]), 1);
  assert.equal(meaningfulSupport([s('a', 'OConnell is the mayor of Nashville'), s('a', 'something else entirely about transit')]), 1, 'same source → one');
  assert.equal(meaningfulSupport([s('a', 'OConnell is the mayor of Nashville'), s('b', 'OConnell is the mayor of Nashville')]), 1, 'verbatim across sources → one');
  assert.equal(meaningfulSupport([s('a', 'OConnell is the mayor of Nashville'), s('b', 'The council confirmed OConnell took office as mayor last spring')]), 2, 'distinct source + distinct wording → two');
});

// ── Time: the surfer's clock re-dates a stale "current" claim ─────────────────

const datedDoc = (text, published, i = 0) => admitWebSource({ url: `https://w/${i}`, text, published }).doc;

test('DATE: a current office from a stale source is re-dated against now (current as of <year>)', () => {
  const doc = createCompositeDoc([datedDoc('OConnell is the mayor of Nashville. OConnell ran the city.', '2021-02-01')]);
  const a = auditPropositions({ prose: 'OConnell is the mayor.', doc, now: '2026-06-29' });
  assert.equal(a.counts.dated, 1, 'a 2021 "is the mayor" read in 2026 is current AS OF 2021, not now');
  assert.equal(a.dated[0].asOf, 2021);
  assert.equal(a.dated[0].dated, true);
});

test('a fresh source is not dated', () => {
  const doc = createCompositeDoc([datedDoc('OConnell is the mayor of Nashville. OConnell ran the city.', '2026-01-01')]);
  assert.equal(auditPropositions({ prose: 'OConnell is the mayor.', doc, now: '2026-06-29' }).counts.dated, 0);
});

test('without a clock (no now) the date axis is inert', () => {
  const doc = createCompositeDoc([datedDoc('OConnell is the mayor of Nashville.', '2010-01-01')]);
  assert.equal(auditPropositions({ prose: 'OConnell is the mayor.', doc }).counts.dated, 0, 'no now → no re-dating');
});

test('date-awareness never fires — it is a hedge, not a correction', () => {
  const doc = createCompositeDoc([datedDoc('OConnell is the mayor of Nashville.', '2019-01-01')]);
  const a = auditPropositions({ prose: 'OConnell is the mayor.', doc, now: '2026-06-29' });
  assert.equal(a.counts.dated, 1);
  assert.equal(a.fired.length, 0, 'a dated current claim is surfaced, never corrected/refused');
});

// ── Space: a role is bound to its jurisdiction ────────────────────────────────

test('SPACE: a role placed in the wrong jurisdiction is caught (never in Salt Lake City)', () => {
  const doc = scope(['OConnell is a council member of Nashville.']);
  const a = auditPropositions({ prose: 'OConnell is a council member in Salt Lake City.', doc });
  assert.equal(a.counts.placeMismatch, 1);
  assert.match(a.corrections[0], /Nashville/);
  assert.match(a.corrections[0], /Salt Lake City/);
  assert.equal(a.fired.length, 1);
  assert.equal(a.fired[0].refuses, false);
});

test('a matching jurisdiction does not fire a place mismatch', () => {
  const doc = scope(['OConnell is a council member of Nashville.']);
  const a = auditPropositions({ prose: 'OConnell is a council member in Nashville.', doc });
  assert.equal(a.counts.placeMismatch, 0);
});

test('a generic qualifier (Metro/City) is not a jurisdiction and cannot false-mismatch', () => {
  const doc = scope(['OConnell is the mayor of Nashville.']);
  // "a Metro Council member" carries no proper place, so it cannot mismatch "Nashville"
  // — it is handled by the superseded path (mayor), not a spurious place flag.
  const a = auditPropositions({ prose: 'OConnell is a Metro Council member.', doc });
  assert.equal(a.counts.placeMismatch, 0);
  assert.equal(a.counts.superseded, 1);
});

test('an HONEST former claim is not flagged as superseded', () => {
  // The answer itself says "former" — it is not asserting a stale role as current.
  const doc = scope(['OConnell is the mayor of Nashville.', 'OConnell was a council member.']);
  const audit = auditPropositions({ prose: 'OConnell is a former council member.', doc });
  assert.equal(audit.counts.superseded, 0, 'an honest "former" claim never supersedes');
  assert.equal(audit.fired.length, 0);
});

test('STALE: an office the sources mark former, with no competing current office', () => {
  const doc = scope(['OConnell is a former council member. OConnell now runs a nonprofit.']);
  const audit = auditPropositions({ prose: 'OConnell is a council member.', doc });
  const v = audit.verdicts.find(x => x.office === 'councilmember');
  assert.equal(v.verdict, 'stale', 'the sources mark this role as past');
  assert.match(audit.corrections[0], /former councilmember/);
});

test('a NON-exclusive title never supersedes — chair and mayor co-occur', () => {
  const doc = scope(['OConnell is the mayor of Nashville.']);
  const audit = auditPropositions({ prose: 'OConnell is the chair of the transit committee.', doc });
  assert.equal(audit.counts.superseded, 0, 'a co-occurring title is not a succeeded seat');
});

test('a person the sources never mention is left untouched', () => {
  const doc = scope(['OConnell is the mayor of Nashville.']);
  const audit = auditPropositions({ prose: 'Jane Smith is a senator.', doc });
  assert.equal(audit.counts.superseded, 0);
  assert.equal(audit.counts.stale, 0);
  assert.equal(audit.fired.length, 0);
});

test('a claim binds to the one same-name person in the sources (name variants)', () => {
  // The corpus only ever writes "Mayor O'Connell"; the answer writes "Freddie O'Connell".
  // A lone, non-conflicting same-name person is who the claim is about — bind and grade.
  const doc = scope(['Mayor OConnell signed the order.']);
  const audit = auditPropositions({ prose: 'Freddie OConnell is a council member.', doc });
  assert.equal(audit.counts.superseded, 1, 'the claim binds to the one O’Connell and is graded');
});

test('an empty or doc-less call is inert', () => {
  assert.deepEqual(auditPropositions({ prose: '', doc: scope(['x']) }).fired, []);
  assert.deepEqual(auditPropositions({ prose: 'x is the mayor', doc: null }).fired, []);
});

test('it runs over a plain parseText doc too (not only web/composite)', () => {
  const doc = parseText('OConnell is the mayor. OConnell was a council member.', { docId: 'd' });
  const audit = auditPropositions({ prose: 'OConnell is a council member.', doc });
  assert.ok(audit.counts.superseded + audit.counts.stale >= 1, 'a stale office is caught on a normal doc');
});

// ── End-to-end through the real turn pipeline ────────────────────────────────

const fixedModel = (answer) => ({ id: 'fixed', kind: 'local', isLoaded: () => true, load: async () => {}, phrase: async () => answer });

test('the factcheck STAGE runs the channel and a stale office rides out as a flag', async () => {
  const doc = scope([
    'Mayor Freddie OConnell backed the Fusus surveillance contract.',
    'OConnell is the mayor of Nashville.',
    'As a council member, OConnell was a chief critic of police technology.',
  ]);
  const result = await runTurn({
    question: 'what is the deal with OConnell and Fusus?',
    doc, model: fixedModel('Freddie OConnell is a Metro Council member who backed Fusus.'),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
  });
  // The DEF channel graded the office claim and rode it out on the turn.
  assert.ok(result.propositions, 'the proposition record rode out on the turn');
  assert.equal(result.propositions.counts.superseded, 1, 'the stale council-member claim was superseded');
  // Flag-and-tell: surfaced as a non-refusing flag, the answer never gagged.
  const flag = (result.flags || []).find(f => f.id === 'proposition-superseded');
  assert.ok(flag, `the correction surfaced as a flag, got: ${(result.flags || []).map(f => f.id).join(',')}`);
  assert.equal(flag.refuses, false);
  assert.match(flag.message, /mayor/);
  assert.match(result.answer, /Council member/, 'the answer itself is untouched (flag-and-tell)');
});

test('a correct office answer through the pipeline raises no proposition flag', async () => {
  const doc = scope(['OConnell is the mayor of Nashville.']);
  const result = await runTurn({
    question: 'who is OConnell?',
    doc, model: fixedModel('OConnell is the mayor of Nashville.'),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
  });
  assert.equal(result.propositions.counts.superseded, 0);
  assert.ok(!(result.flags || []).some(f => f.id === 'proposition-superseded'), 'no false flag on a correct answer');
});
