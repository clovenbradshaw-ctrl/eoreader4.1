import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { scanVocatives } from '../src/perceiver/parse/relations.js';
import { discoverNamings } from '../src/perceiver/parse/naming.js';
import { projectGraph } from '../src/core/project.js';
import { areDisjoint, typeOf } from '../src/core/index.js';

// The naming-scene discovery: a role epithet ("his sister") and a name ("Grete")
// are the same referent, learned from the dialogue turn — the mother cries the NAME
// and the narrator attributes the ANSWER to the ROLE. The discovery emits a SYN
// (identity join), and the projection's union-find carries the kinship edge onto the
// name. Kafka keeps the name and the role in separate sentences by design, so this
// is the apposition-free bridge the elimination trigger could not bootstrap.

// ---------------------------------------------------------------------------
// scanVocatives — direct address, interjections filtered.

test('scanVocatives is a pure orthographic detector — a name before ! or ?', () => {
  // The interjection question ("Oh God!") is a LEDGER class (conventions.isStarter),
  // applied downstream in discoverNamings — not baked into this primitive.
  assert.deepEqual(scanVocatives('"Grete!" she then cried.').map(v => v.name), ['Grete']);
  assert.deepEqual(scanVocatives('"Mother?" his sister called.').map(v => v.name), ['Mother']);
  assert.deepEqual(scanVocatives('"Oh, God!" called his mother.').map(v => v.name), ['God']); // raw; gated later
  assert.deepEqual(scanVocatives('She left quietly.').map(v => v.name), []);                   // no address
});

// ---------------------------------------------------------------------------
// The end-to-end bridge: vocative name answered by the role → SYN → kinship edge.

// "Grete" is admitted (she acts), "Gregor's sister" sets the named owner, and the
// naming scene ("Grete!" … "his sister answered") is the only thing tying them — no
// apposition, no adjacency of name and role outside the call-and-response.
const NAMED =
  'Gregor Samsa woke. Gregor worked. Grete brought food. ' +
  "Gregor's sister cared for him. " +
  '"Grete!" cried his mother. "Mother?" his sister answered from the other side.';

test('a naming scene SYN-merges the role referent into the name', () => {
  const doc = parseText(NAMED, { docId: 'n1', rolesConflict: areDisjoint });
  const syn = doc.log.events.filter(e => e.op === 'SYN' && e.kind === 'merge' && String(e.from).startsWith('role:'));
  assert.ok(syn.some(e => e.to === 'grete'), 'the sister role referent merges into Grete');
});

test('the merge carries Gregor → sister → Grete into the projection, no cascade', () => {
  const doc = parseText(NAMED, { docId: 'n2', rolesConflict: areDisjoint });
  const g = projectGraph(doc.log);
  const rep = g.representative;
  const sib = g.edges.find(e => typeOf(e.via)?.type === 'sibling'
    && [e.from, e.to].map(rep).includes(rep('grete'))
    && [e.from, e.to].map(rep).includes(rep('gregor-samsa')));
  assert.ok(sib, 'a Gregor↔Grete sibling edge emerges via the SYN merge');
  // No phantom role-referent survives as its own figure — it collapses into Grete.
  assert.ok(![...g.entities.keys()].some(k => String(k).startsWith('role:')), 'role referent absorbed, not a phantom');
});

// ---------------------------------------------------------------------------
// The guards.

test('owner-distinctness: a vocative of the owner never names the role (no self-sister)', () => {
  const doc = parseText(
    'Gregor Samsa woke. Gregor worked. Grete cooked. ' +
    "Gregor's sister cared for him. " +
    '"Gregor!" cried his mother. "Yes?" his sister answered.',
    { docId: 'n3', rolesConflict: areDisjoint });
  const syn = doc.log.events.filter(e => e.op === 'SYN' && e.kind === 'merge' && String(e.from).startsWith('role:sister'));
  assert.equal(syn.length, 0, 'Gregor is the owner — he cannot be his own sister');
});

test('two names answering one role HOLD (sticky abstention) — the role stays unnamed', () => {
  // Both Grete and Marta answer "his sister"; with no discriminator the honest verdict
  // is INDETERMINATE — emit no SYN, leave the sister referent unnamed, never guess.
  const doc = parseText(
    'Gregor Samsa woke. Grete cooked. Marta cleaned. ' +
    "Gregor's sister cared for him. " +
    '"Grete!" cried his mother. "Mother?" his sister answered. ' +
    '"Marta!" called his father. "Yes?" his sister replied.',
    { docId: 'n4', rolesConflict: areDisjoint });
  const syn = doc.log.events.filter(e => e.op === 'SYN' && e.kind === 'merge' && String(e.from).startsWith('role:sister'));
  assert.equal(syn.length, 0, 'an ambiguous role is held, not merged');
  const g = projectGraph(doc.log);
  assert.ok(!g.edges.some(e => typeOf(e.via)?.type === 'sibling'
    && [e.from, e.to].map(g.representative).includes(g.representative('grete'))),
    'no sibling edge is fabricated for the tied candidates');
});

// ---------------------------------------------------------------------------
// discoverNamings as a unit — returns guarded proposals in slug space.

test('discoverNamings returns the guarded proposal in slug space', () => {
  const doc = parseText(NAMED, { docId: 'n5', rolesConflict: areDisjoint });
  const merges = discoverNamings(doc.sentences, {
    admission: doc.admission, corefField: doc.corefField, conventions: doc.conventions, rolesConflict: areDisjoint,
  });
  assert.deepEqual(merges, [{ role: 'sister', ownerId: 'gregor-samsa', name: 'grete' }]);
});

test('with no naming scene there is nothing to discover (the META elimination case is untouched)', () => {
  // No vocative, no role-attributed answer — discoverNamings is inert, so the
  // descriptor channel's own elimination trigger is the only thing that can fire.
  const doc = parseText(
    'Gregor Samsa woke. His sister had gone. Grete returned. Grete cooked. Gregor\'s sister smiled.',
    { docId: 'n6', rolesConflict: areDisjoint });
  assert.deepEqual(discoverNamings(doc.sentences, {
    admission: doc.admission, corefField: doc.corefField, rolesConflict: areDisjoint,
  }), []);
});
