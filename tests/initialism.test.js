import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { projectGraph } from '../src/core/project.js';
import { VERDICTS } from '../src/core/verdicts.js';
import { initialismMatch, scanInitialisms, createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { createConventions } from '../src/core/conventions/index.js';

// §8 ORG-1 / §11 worked example 3 — acronym ↔ expansion as a LEARNED, defeasible org
// alias. "Nashville Downtown Partnership (NDP)" then bare "NDP": the initialism test
// passes; an alias is proposed with evidence `initialism`; it is sedimented as a REC
// in the conventions ledger; later "NDP" resolves directly. No acronym dictionary —
// the pair is read off the text, the letters checked against the name's initials.

const ORG = 'The Nashville Downtown Partnership (NDP) was founded in 1995. ' +
            'NDP launched a new program. NDP hired staff.';

// ── The orthographic mechanism (the parse leaf holds mechanism, not a table) ──

test('initialismMatch checks the acronym against the expansion initials, both conventions', () => {
  assert.equal(initialismMatch('NDP', 'Nashville Downtown Partnership'), true);
  assert.equal(initialismMatch('BOA', 'Bank of America'), true, 'an acronym may keep connector initials');
  assert.equal(initialismMatch('BA',  'Bank of America'), true, 'or skip them');
  assert.equal(initialismMatch('IBM', 'International Business Machines'), true);
});

test('a shell that shares only some tokens is NOT an initialism — structural distinctness holds', () => {
  // "NDMC" is not the initials of "Nashville Downtown Partnership"; the §8 guard that
  // keeps a partnership and its management shell distinct is not undone by acronyms.
  assert.equal(initialismMatch('NDMC', 'Nashville Downtown Partnership'), false);
  assert.equal(initialismMatch('NYC',  'Nashville Downtown Partnership'), false);
  assert.equal(initialismMatch('N',    'Nashville Downtown Partnership'), false, 'one letter is not an initialism');
});

test('scanInitialisms reads the parenthetical construction off an admitted expansion', () => {
  const adm = createEntityAdmission({ conventions: createConventions() });
  adm.observe('The Nashville Downtown Partnership (NDP) opened.', 0);
  const pairs = scanInitialisms('The Nashville Downtown Partnership (NDP) opened.', adm);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].acronym, 'NDP');
  assert.equal(pairs[0].expansion, 'Nashville Downtown Partnership');
  assert.equal(pairs[0].expansionId, 'nashville-downtown-partnership');
});

test('a parenthetical whose letters do NOT match the name yields no pair', () => {
  const adm = createEntityAdmission({ conventions: createConventions() });
  adm.observe('The Memphis River Authority (XYZ) met.', 0);
  assert.equal(scanInitialisms('The Memphis River Authority (XYZ) met.', adm).length, 0);
});

// ── End to end: the alias resolves later mentions, recorded as SYN + EVA ──────

test('bare "NDP" resolves to the expansion — one node, not two', () => {
  const g = projectGraph(parseText(ORG, { docId: 'org' }).log);
  assert.equal(g.representative('ndp'), g.representative('nashville-downtown-partnership'),
    'the acronym and its expansion are one referent');
});

test('the merge is an explainable, append-only SYN carrying evidence:initialism + a write-time EVA', () => {
  const ev = parseText(ORG, { docId: 'org' }).log.events;
  const syn = ev.find((e) => e.op === 'SYN' && e.match === 'initialism');
  assert.ok(syn, 'a SYN alias is committed for the initialism');
  assert.equal(syn.evidence, 'initialism');
  assert.equal(syn.from, 'ndp');
  assert.equal(syn.to, 'nashville-downtown-partnership');
  const eva = ev.find((e) => e.op === 'EVA' && e.ref === syn.seq);
  assert.ok(eva, 'a write-time EVA evaluates the merge as it is committed');
  assert.equal(eva.verdict, VERDICTS.CORROBORATED);
  assert.equal(eva.reason, 'initialism-expansion');
});

test('the alias is sedimented as a learned, defeasible REC in the conventions ledger', () => {
  const doc = parseText(ORG, { docId: 'org' });
  assert.equal(doc.conventions.initialismOf('ndp'), 'nashville-downtown-partnership',
    'subsequent "NDP" resolves from the learned rule without re-deriving');
  const rec = doc.conventions.rules.find((r) => r.op === 'REC' && r.kind === 'initialism' && r.token === 'ndp');
  assert.ok(rec, 'a REC line records the learned alias');
  assert.equal(rec.expansion, 'nashville-downtown-partnership');
  // Defeasible like every convention: an eva break past support overturns it.
  doc.conventions.eva('initialism', 'ndp', false);
  doc.conventions.eva('initialism', 'ndp', false);
  assert.equal(doc.conventions.initialismOf('ndp'), null, 'a defeated alias stops resolving');
});

test('the learned alias counts the acronym mentions onto the expansion (mass accrues to one figure)', () => {
  const g = projectGraph(parseText(ORG, { docId: 'org' }).log);
  const node = g.entities.get(g.representative('nashville-downtown-partnership'));
  assert.ok(node, 'the merged figure exists');
  assert.ok(node.sightings >= 3, `expansion + two bare "NDP" sightings fold onto one node, got ${node.sightings}`);
});

test('a sedimented alias is inheritable — a later read picks it up as a prior', () => {
  const first = parseText(ORG, { docId: 'org' });
  const inherited = createConventions({ inherit: first.conventions.exportLedger() });
  assert.equal(inherited.initialismOf('ndp'), 'nashville-downtown-partnership',
    'the learned "NDP ⇒ …" alias survives into the next read as a prior');
});

// ── §8 ORG-4 boundary: the alias must not collapse structurally-distinct orgs ──

test('a shell sharing tokens but NOT the initials is left distinct (no false alias)', () => {
  // The partnership, a management shell, and a bare token co-occur. "NDMC" is not the
  // initials of "Nashville Downtown Partnership", so the initialism path proposes no
  // alias between them — the structural distinctness §8 ORG-4 protects is preserved.
  const doc = parseText(
    'The Nashville Downtown Partnership (NDP) operates through NDMC. NDMC contracts with DMC.',
    { docId: 'shells' });
  const g = projectGraph(doc.log);
  assert.notEqual(g.representative('ndmc'), g.representative('nashville-downtown-partnership'),
    'the management shell is not merged into the partnership by acronym');
  // and the one true initialism still resolved
  assert.equal(g.representative('ndp'), g.representative('nashville-downtown-partnership'));
});

// ── Additive: a document with no such construction is untouched ───────────────

test('no parenthetical-initialism construction → no initialism events, no learned rule', () => {
  const doc = parseText('Gregor Samsa woke. Gregor crawled back under the couch.', { docId: 'plain' });
  assert.equal(doc.log.events.some((e) => e.op === 'SYN' && e.match === 'initialism'), false);
  assert.equal(doc.conventions.rules.some((r) => r.kind === 'initialism'), false);
});
