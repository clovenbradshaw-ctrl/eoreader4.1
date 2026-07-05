import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';
import {
  latentAsterisks, evaluateSameAs, discriminatorIndex, identityFrontier, normLabel,
} from '../src/core/asterisk.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { createCompositeDoc } from '../src/organs/in/composite.js';

// Two namespaced clusters bearing one name, the way a composite holds them: distinct
// ids, no firm merge between them. `disc` lays down discriminator CON edges.
const twoTurners = ({ same_as = true, disc = [], rules } = {}) => {
  const log = createLog({ docId: 'master' });
  log.append({ op: 'INS', id: 'A␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'B␟tom-turner', label: 'Tom Turner' });
  for (const [src, via, tgt, tlabel] of disc) {
    log.append({ op: 'INS', id: tgt, label: tlabel || tgt });
    log.append({ op: 'CON', src, tgt, via, sentIdx: 0 });
  }
  if (same_as)
    log.append({ op: 'SYN', kind: 'same_as?', from: 'A␟tom-turner', to: 'B␟tom-turner', label: 'Tom Turner' });
  return projectGraph(log, rules ? { rules } : {});
};

// ── Directive #1 — the measurement ───────────────────────────────────────────

test('latentAsterisks counts a name borne by two ids the firm union-find leaves apart', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'A␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'B␟tom-turner', label: 'Tom Turner' });
  const m = latentAsterisks(log);
  assert.equal(m.count, 1, 'one latent asterisk');
  assert.equal(m.groups[0].roots.length, 2, 'two distinct candidate clusters');
  assert.equal(m.groups[0].norm, 'tom-turner');
});

test('a firm SYN merge removes the latent asterisk; a crossDoc merge does NOT (it is speculation)', () => {
  const base = () => {
    const log = createLog();
    log.append({ op: 'INS', id: 'A␟tom-turner', label: 'Tom Turner' });
    log.append({ op: 'INS', id: 'B␟tom-turner', label: 'Tom Turner' });
    return log;
  };
  const firm = base();
  firm.append({ op: 'SYN', kind: 'merge', from: 'A␟tom-turner', to: 'B␟tom-turner' });
  assert.equal(latentAsterisks(firm).count, 0, 'a firm within-source merge unites them');

  const cross = base();
  cross.append({ op: 'SYN', kind: 'merge', from: 'A␟tom-turner', to: 'B␟tom-turner', crossDoc: true });
  assert.equal(latentAsterisks(cross).count, 1, 'a crossDoc merge is speculation — still latent');
  assert.equal(latentAsterisks(cross, { includeSpeculative: true }).count, 0, 'folded only when asked');
});

test('an entity sighted under several surface forms is keyed once, not double-counted', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'A␟gregor-samsa', label: 'Gregor Samsa' });
  log.append({ op: 'INS', id: 'A␟gregor-samsa', label: 'Gregor' });        // same id, second surface form
  log.append({ op: 'INS', id: 'B␟gregor-samsa', label: 'Gregor Samsa' });
  const m = latentAsterisks(log);
  assert.equal(m.count, 1, 'one name, not two buckets');
  assert.equal(m.groups[0].norm, 'gregor-samsa');
});

// ── Directives #3/#4 — held relation, side structure, void, speculative rep ──

test('a same_as? is HELD: not united by find(), united only speculatively', () => {
  const g = twoTurners();
  assert.notEqual(g.representative('A␟tom-turner'), g.representative('B␟tom-turner'),
    'the firm graph keeps them apart — find() was not touched');
  assert.equal(g.representative('A␟tom-turner', { speculative: true }),
               g.representative('B␟tom-turner', { speculative: true }),
    'the speculative quotient folds the candidate for display');
  assert.equal(g.sameAs.length, 1, 'the open candidate is surfaced');
  assert.equal(g.idMerges.length, 0);
  assert.equal(g.splits.length, 0);
});

test('an open same_as? stands an identity VOID on graph.voids, anchored to both roots', () => {
  const g = twoTurners();
  const idVoids = g.voids.filter(v => v.kind === 'same_as?');
  assert.equal(idVoids.length, 2, 'one void per root');
  assert.deepEqual(new Set(idVoids.map(v => v.node)),
                   new Set([g.representative('A␟tom-turner'), g.representative('B␟tom-turner')]));
  assert.ok(idVoids.every(v => v.rel === 'identity'), 'the void is on the identity relation');
  // and each points across to its counterpart
  assert.deepEqual(new Set(idVoids.map(v => v.counter)),
                   new Set([g.representative('A␟tom-turner'), g.representative('B␟tom-turner')]));
});

// ── Directive #5 — merge earned by CON convergence, split by conflict ─────────

test('CONVERGENCE: a shared discriminator promotes the asterisk to a real merge, auditable', () => {
  const g = twoTurners({ disc: [
    ['A␟tom-turner', 'ceo', 'memphis-logistics', 'Memphis Logistics'],
    ['B␟tom-turner', 'ceo', 'memphis-logistics', 'Memphis Logistics'],
  ] });
  assert.equal(g.representative('A␟tom-turner'), g.representative('B␟tom-turner'),
    'the earned merge unions them in the FIRM graph');
  assert.equal(g.idMerges.length, 1, 'recorded as an earned merge');
  assert.ok(g.idMerges[0].shared.some(s => s.target === 'memphis-logistics'),
    'auditable down to the discriminator that licensed it');
  assert.equal(g.sameAs.length, 0, 'no longer open');
  assert.equal(g.voids.filter(v => v.kind === 'same_as?').length, 0, 'the identity void is discharged');
});

test('the label itself is NOT a discriminator — verbatim echo alone does not promote', () => {
  // same name, zero shared discriminators → stays an asterisk (the echo-rewarding bug)
  const g = twoTurners();
  assert.equal(g.idMerges.length, 0);
  assert.equal(g.sameAs.length, 1, 'identity remains unestablished on the name alone');
});

test('CONFLICT: a functional discriminator with disjoint targets forks the asterisk to a split', () => {
  const g = twoTurners({ disc: [
    ['A␟tom-turner', 'wife', 'mary', 'Mary'],     // spouse is functional (relation-types)
    ['B␟tom-turner', 'wife', 'susan', 'Susan'],
  ] });
  assert.notEqual(g.representative('A␟tom-turner'), g.representative('B␟tom-turner'), 'not merged');
  assert.notEqual(g.representative('A␟tom-turner', { speculative: true }),
                  g.representative('B␟tom-turner', { speculative: true }),
    'and NOT folded speculatively either — the split is confirmed, two Figures');
  assert.equal(g.splits.length, 1, 'recorded as a confirmed split');
  assert.equal(g.sameAs.length, 0, 'no longer an open question');
  assert.equal(g.voids.filter(v => v.kind === 'same_as?').length, 0, 'a resolved split carries no identity void');
});

test('conflict DOMINATES convergence — a clash is positive evidence of two people', () => {
  const g = twoTurners({ disc: [
    ['A␟tom-turner', 'ceo',  'acme', 'Acme'],     // shared discriminator
    ['B␟tom-turner', 'ceo',  'acme', 'Acme'],
    ['A␟tom-turner', 'wife', 'mary', 'Mary'],     // but a functional clash
    ['B␟tom-turner', 'wife', 'susan', 'Susan'],
  ] });
  assert.equal(g.splits.length, 1, 'the clash wins');
  assert.equal(g.idMerges.length, 0);
});

test('a custom functional discriminator (employer) can be declared in the rules', () => {
  const g = twoTurners({
    disc: [
      ['A␟tom-turner', 'employer', 'memphis-co', 'Memphis Co'],
      ['B␟tom-turner', 'employer', 'nashville-co', 'Nashville Co'],
    ],
    rules: { same_as_functional_vias: ['employer'] },
  });
  assert.equal(g.splits.length, 1, 'employer treated as one-valued → disjoint targets clash');
});

test('the convergence threshold is read from the projection rules', () => {
  const disc = [['A␟tom-turner', 'ceo', 'acme', 'Acme'], ['B␟tom-turner', 'ceo', 'acme', 'Acme']];
  assert.equal(twoTurners({ disc, rules: { same_as_min_convergence: 1 } }).idMerges.length, 1);
  assert.equal(twoTurners({ disc, rules: { same_as_min_convergence: 2 } }).idMerges.length, 0,
    'one shared discriminator is below a threshold of two — stays open');
  assert.equal(twoTurners({ disc, rules: { same_as_min_convergence: 2 } }).sameAs.length, 1);
});

// ── Direct unit tests of the EVA primitives ──────────────────────────────────

test('discriminatorIndex excludes naming and derived edges', () => {
  const id = (x) => x;
  const edges = [
    { kind: 'con', from: 'a', to: 'acme', via: 'ceo' },
    { kind: 'con', from: 'a', to: 'x',    via: 'name' },     // naming — excluded
    { kind: 'con', from: 'a', to: 'y',    via: 'ceo', derived: true }, // defeasible — excluded
  ];
  const idx = discriminatorIndex(edges, id, id);
  assert.deepEqual([...idx.get('a').keys()], ['ceo']);
  assert.deepEqual([...idx.get('a').get('ceo')], ['acme']);
});

test('evaluateSameAs: open when neither converges nor conflicts', () => {
  const discriminatorsOf = () => new Map();
  assert.equal(evaluateSameAs('a', 'b', { discriminatorsOf }).verdict, 'open');
});

// ── Directive #6 — the identity frontier ─────────────────────────────────────

test('identityFrontier ranks balanced, well-attested candidates above lopsided ones', () => {
  const g = {
    entities: new Map([['a', { sightings: 5 }], ['b', { sightings: 5 }], ['c', { sightings: 9 }], ['d', { sightings: 1 }]]),
    sameAs: [
      { a: 'a', b: 'b', label: 'Balanced', norm: 'balanced' },
      { a: 'c', b: 'd', label: 'Lopsided', norm: 'lopsided' },
    ],
  };
  const frontier = identityFrontier(g);
  assert.equal(frontier.length, 2);
  assert.equal(frontier[0].label, 'Balanced', 'the most belief-moving question ranks first');
  assert.equal(frontier[0].kind, 'identity');
  assert.match(frontier[0].text, /find a source naming both contexts/);
});

// ── Golden parity ────────────────────────────────────────────────────────────

test('a log with NO same_as? events is byte-identical: empty asterisk surfaces', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.append({ op: 'INS', id: 'b', label: 'B' });
  log.append({ op: 'SYN', kind: 'merge', from: 'a', to: 'b' });
  const g = projectGraph(log);
  assert.equal(g.sameAs.length, 0);
  assert.equal(g.splits.length, 0);
  assert.equal(g.idMerges.length, 0);
  assert.equal(g.voids.filter(v => v.kind === 'same_as?').length, 0);
  assert.equal(g.representative('a'), g.representative('b'), 'the firm merge is untouched');
  // the default representative ignores the speculative option harmlessly
  assert.equal(g.representative('a'), g.representative('a', { speculative: true }));
});

test('a same_as? candidate is revisable — a SEG retract drops it', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'A␟x', label: 'X' });
  log.append({ op: 'INS', id: 'B␟x', label: 'X' });
  const syn = log.append({ op: 'SYN', kind: 'same_as?', from: 'A␟x', to: 'B␟x', label: 'X' });
  assert.equal(projectGraph(log).sameAs.length, 1);
  log.retract(syn.seq, 'distinct after all');
  assert.equal(projectGraph(log).sameAs.length, 0, 'the candidate is gone');
});

// ── Directive — composite emits the held relation behind the flag ────────────

const mk = (text, docId) => parseText(text, { docId });

test('createCompositeDoc default emits a hard crossDoc merge (flag off, golden parity)', () => {
  const a = mk('Tom Turner runs the firm. Tom Turner spoke today.', 'a.txt');
  const b = mk('Tom Turner smiled warmly. Tom Turner left early.', 'b.txt');
  const comp = createCompositeDoc([a, b], { heldIdentity: false });   // the default-off path, pinned
  const syn = comp.crossDocSyn.find(s => /tom/i.test(s.label || ''));
  assert.ok(syn, 'a cross-doc join was proposed');
  assert.equal(syn.kind, 'merge', 'default is the legacy hard merge');
  const g = projectGraph(comp.log);
  assert.equal(g.representative(syn.from), g.representative(syn.to), 'collapsed, as today');
  assert.equal(g.sameAs.length, 0, 'no asterisk held');
});

test('heldIdentity:true emits a same_as? candidate instead of a merge — the asterisk is held', () => {
  const a = mk('Tom Turner runs the firm. Tom Turner spoke today.', 'a.txt');
  const b = mk('Tom Turner smiled warmly. Tom Turner left early.', 'b.txt');
  const comp = createCompositeDoc([a, b], { heldIdentity: true });
  const syn = comp.crossDocSyn.find(s => /tom/i.test(s.label || ''));
  assert.ok(syn, 'a cross-doc proposal exists');
  assert.equal(syn.kind, 'same_as?', 'now HELD, not merged');
  assert.equal(syn.prov?.door, 'enactor', 'tagged REAFFERENCE — the reader proposing, not the world witnessing');
  const g = projectGraph(comp.log);
  assert.notEqual(g.representative(syn.from), g.representative(syn.to), 'held apart in the firm graph');
  assert.equal(g.sameAs.length, 1, 'the asterisk is surfaced');
  assert.equal(g.voids.filter(v => v.kind === 'same_as?').length, 2, 'identity held as a void');
});

// ── The user's own verdict — heaviest-weighted, dominates the discriminators ─

test('a user split resolves an open same_as? candidate, bypassing discriminator EVA entirely', () => {
  // Convergent discriminators would otherwise PROMOTE this pair to a merge —
  // the split must win anyway; the user's own "not the same" outweighs the text.
  const g = twoTurners({ disc: [
    ['A␟tom-turner', 'ceo', 'memphis-logistics', 'Memphis Logistics'],
    ['B␟tom-turner', 'ceo', 'memphis-logistics', 'Memphis Logistics'],
  ] });
  // Sanity: without the split this pair converges.
  assert.equal(g.idMerges.length, 1);

  const log = createLog();
  log.append({ op: 'INS', id: 'A␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'B␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'memphis-logistics', label: 'Memphis Logistics' });
  log.append({ op: 'CON', src: 'A␟tom-turner', tgt: 'memphis-logistics', via: 'ceo', sentIdx: 0 });
  log.append({ op: 'CON', src: 'B␟tom-turner', tgt: 'memphis-logistics', via: 'ceo', sentIdx: 0 });
  log.append({ op: 'SYN', kind: 'same_as?', from: 'A␟tom-turner', to: 'B␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'SYN', kind: 'split', from: 'A␟tom-turner', to: 'B␟tom-turner', user: true });
  const resolved = projectGraph(log);

  assert.equal(resolved.idMerges.length, 0, 'the convergence never fires — split pre-empts EVA');
  assert.equal(resolved.sameAs.length, 0, 'no longer open');
  assert.equal(resolved.splits.length, 1);
  assert.equal(resolved.splits[0].user, true);
  assert.notEqual(resolved.representative('A␟tom-turner'), resolved.representative('B␟tom-turner'));
  assert.notEqual(resolved.representative('A␟tom-turner', { speculative: true }),
                  resolved.representative('B␟tom-turner', { speculative: true }),
    'a confirmed split is not folded speculatively either');
  assert.equal(resolved.voids.filter(v => v.kind === 'same_as?').length, 0,
    'the identity void is discharged — the question is answered, not merely dropped');
});

test('a user split with no open candidate still records, auditable, without a prior same_as?', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'A␟x', label: 'X' });
  log.append({ op: 'INS', id: 'B␟x', label: 'X' });
  log.append({ op: 'SYN', kind: 'split', from: 'A␟x', to: 'B␟x', user: true });
  const g = projectGraph(log);
  assert.equal(g.splits.length, 1);
  assert.equal(g.splits[0].user, true);
  assert.equal(g.sameAs.length, 0);
});

test('a split naming ids already firmly merged elsewhere is inert — cannot silently un-union', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'A␟x', label: 'X' });
  log.append({ op: 'INS', id: 'B␟x', label: 'X' });
  log.append({ op: 'SYN', kind: 'merge', from: 'A␟x', to: 'B␟x' });
  log.append({ op: 'SYN', kind: 'split', from: 'A␟x', to: 'B␟x', user: true });
  const g = projectGraph(log);
  assert.equal(g.representative('A␟x'), g.representative('B␟x'), 'the firm merge stands');
  assert.equal(g.splits.length, 0, 'nothing to record — a real un-merge needs a SEG retract of the merge');
});

test('a user merge resolves an open same_as? candidate, dominating a discriminator conflict', () => {
  // A functional discriminator clash would otherwise force a SPLIT — the user's
  // own "same person" must win anyway.
  const g = twoTurners({ disc: [
    ['A␟tom-turner', 'wife', 'mary', 'Mary'],
    ['B␟tom-turner', 'wife', 'susan', 'Susan'],
  ] });
  assert.equal(g.splits.length, 1, 'sanity: without the user, the clash forks a split');

  const log = createLog();
  log.append({ op: 'INS', id: 'A␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'B␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'INS', id: 'mary', label: 'Mary' });
  log.append({ op: 'INS', id: 'susan', label: 'Susan' });
  log.append({ op: 'CON', src: 'A␟tom-turner', tgt: 'mary', via: 'wife', sentIdx: 0 });
  log.append({ op: 'CON', src: 'B␟tom-turner', tgt: 'susan', via: 'wife', sentIdx: 0 });
  log.append({ op: 'SYN', kind: 'same_as?', from: 'A␟tom-turner', to: 'B␟tom-turner', label: 'Tom Turner' });
  log.append({ op: 'SYN', kind: 'merge', from: 'A␟tom-turner', to: 'B␟tom-turner', user: true });
  const resolved = projectGraph(log);

  assert.equal(resolved.splits.length, 0, 'the conflict never fires — the user merge subsumes the candidate first');
  assert.equal(resolved.sameAs.length, 0);
  assert.equal(resolved.representative('A␟tom-turner'), resolved.representative('B␟tom-turner'));
});

test('normLabel mirrors the perceiver idFor normalization', () => {
  // lowercase, spaces→'-', strip to [a-z0-9-] — exactly idFor, on the trimmed labels
  // admission actually produces.
  assert.equal(normLabel('Tom Turner'), 'tom-turner');
  assert.equal(normLabel('Mr. Samsa'), 'mr-samsa');
  assert.equal(normLabel(null), '');
});
