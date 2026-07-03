import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { localeOf, conversationCast } from '../src/converse/reference.js';
import { readingAt } from '../src/perceiver/reading.js';

// Appearance time vs connection cursor (scripts/appearance-time.mjs). Two clocks:
//   APPEARANCE TIME   — when the referent first appeared in the text (the INS-by-
//                       appearance), dated to the EARLIEST birth in the merge class.
//   CONNECTION CURSOR — when we discovered the binding (a SYN merge). Always ≥
//                       appearance time, and it must never move appearance: "not yet
//                       connected" is not "never INS'd" — a later merge can reveal the
//                       birth was earlier all along.
//
// A FORCED LATER-ROOT merge is the adversary: the role referent ("his sister") appears
// EARLY (s0); the proper name (Grete) appears LATE (s10); the connection folds the role
// into the NAME, so the union-find root is the later-appearing id. This is the naming
// scene's `SYN merge from: roleRef, to: m.name` (pipeline.js:397) in miniature — the
// surname alias never produces it (it roots on the earlier id), so the leak hides until
// a merge roots late.
const laterRootLog = () => {
  const log = createLog({ docId: 'later-root' });
  log.append({ op: 'INS', id: 'sister', label: 'his sister', sentIdx: 0 });   // earliest birth
  log.append({ op: 'INS', id: 'grete',  label: 'Grete',      sentIdx: 10 });  // the late name
  log.append({ op: 'SYN', kind: 'merge', from: 'sister', to: 'grete' });      // root = grete (later)
  return log;
};

test('THE LAW: the projection back-dates firstSeen to the earliest birth, not the connected root', () => {
  const g = projectGraph(laterRootLog());
  const root = g.representative('sister');
  // Both surface forms collapse to one referent...
  assert.equal(g.representative('grete'), root, 'the merge canonicalises both aliases to one root');
  // ...and even though the merge ROOTED on the late name (grete, seq 1 / s10), the
  // referent's first appearance is the EARLIEST member's seq (the role at seq 0). The
  // connection landing late does not push the birth forward.
  assert.equal(g.entities.get(root).firstSeen, 0,
    'firstSeen dates to the earliest INS in the class, never to the later-rooted id');
});

test('localeOf reads the appearance class: the locus is the earliest line, not the connection line', () => {
  const log = laterRootLog();
  const doc = { log, admission: { labelOf: (id) => ({ grete: 'Grete', sister: 'his sister' }[id] || id) } };
  const root = projectGraph(log).representative('sister');
  // With no incident edge, localeOf falls back to the first instantiation. Reading the
  // connected id alone would return the late name line (10); the appearance class returns
  // the earliest birth (0) — where the referent is actually established.
  assert.equal(localeOf(doc, root), 0,
    'localeOf returns the earliest appearance (0), not the cursor the connection landed at (10)');
});

test('conversationCast pools a rename into ONE warm figure, summing its warmth across aliases', () => {
  // "Gregor Samsa" then bare "Samsa", both before the question cursor: one person, two
  // surface forms. Reading raw ids splits the warmth into two figures and ranks the later
  // mention hotter; pooling on the appearance class warms the single referent.
  const cast = conversationCast(
    [{ role: 'user', content: 'Gregor Samsa woke. Samsa dressed slowly.' }],
    'Was he late?',
  );
  assert.equal(cast.length, 1, `a renamed referent is one figure, got ${JSON.stringify(cast.map(c => c.label))}`);
  assert.match(cast[0].label, /Gregor Samsa/, 'the canonical (earliest-INS) label leads, not the later alias');
});

test('a single (un-renamed) figure is unchanged — the pooling never invents or drops a referent', () => {
  // Parity guard: with no alias to pool, the cast is exactly the figures named. "Monk"
  // is one form, so one figure, warm — byte-identical to the pre-pooling read.
  const cast = conversationCast(
    [{ role: 'user', content: 'who is the musician?' },
     { role: 'assistant', content: 'Thelonious Monk, an American jazz pianist.' }],
    'but what is his name?',
  );
  assert.ok(cast.length >= 1 && /Monk/.test(cast[0].label), 'the named figure stays warm and named');
});

test('RESIDUE (pinned): readingAt still reads a rename as a fresh INS on the default path', () => {
  // The deepest manifestation, and the one NOT changed here: the forward reader keys
  // novelty on the raw id, so a referent re-entering under a new surface form reads as a
  // fresh entrance even though the alias is already in the log at this cursor. This sits
  // on the core surprise loop behind the byte-identical parity gate, so the default path
  // is pinned as-is. This lock is written to FAIL the day the projection-pooled reading
  // ships (behind RULES_REV) — the signal that the residue has been closed.
  const doc = parseText(
    'Monk drifts through the room. The pianist plays alone. Thelonious Monk finally speaks.',
    { docId: 'rename' });
  const r = readingAt(doc, 2);
  const freshIns = r.surprises.some(s => s.op === 'INS' && /Thelonious Monk enters/.test(s.text));
  assert.equal(freshIns, true,
    'default reading fires a fresh-INS surprise for the rename — the documented, parity-gated residue');
});
