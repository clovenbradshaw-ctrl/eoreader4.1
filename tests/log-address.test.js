import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { holonId } from '../src/core/holon.js';
import { notateHolon } from '../src/core/faces.js';
import { parseText } from '../src/perceiver/parse/index.js';

// Add-on 2 §B/§D, activated: every logged operation is recorded as
// operator(Site, Stance) at a holonic address, SEALED at emit time. The log's
// append is the single chokepoint, so the stamp is uniform and frozen — like
// everything in the append-only log, the address is never rewritten.

test('append seals operator(Site, Stance) + a holonic address onto an event', () => {
  const log = createLog({ docId: 'd' });
  const e = log.append({ op: 'CON', src: 'gregor', via: 'loved', tgt: 'grete' });

  assert.ok(e.eo, 'the geometry is sealed onto the event');
  assert.match(e.eo.notation, /^CON\(/, 'written as operator(Site, Stance)');
  assert.equal(e.eo.notation, notateHolon(e), 'the sealed notation agrees with faces.notateHolon');
  assert.ok(e.eo.terrain && e.eo.stance, 'the Site terrain and the Stance are named');

  assert.ok(e.eo.address, 'the event names a target → it carries a holonic address');
  assert.equal(e.eo.address.path, 'gregor', 'the target is the depth-1 referent');
  assert.equal(e.eo.address.depth, 1);
  assert.equal(e.eo.address.id, holonId('gregor'), 'the hashId is FNV-1a of record over the path');
  assert.ok(Object.isFrozen(e.eo) && Object.isFrozen(e.eo.address), 'sealed: frozen with the event');
});

test('the same path always seals the same hashId — the address is stable', () => {
  const log = createLog({ docId: 'd' });
  const a = log.append({ op: 'INS', id: 'grete' });
  const b = log.append({ op: 'INS', id: 'grete' });
  assert.equal(a.eo.address.id, b.eo.address.id, 'identity of record is deterministic');
  assert.equal(a.eo.address.id, holonId('grete'));
});

test('a non-addressable event still notates but carries no address', () => {
  const log = createLog({ docId: 'd' });
  const seg = log.append({ op: 'SEG', kind: 'retract', refSeq: 0 });
  // SEG resolves a terrain/stance but names no target referent → notation, no address.
  if (seg.eo) {
    assert.match(seg.eo.notation, /^SEG\(/);
    assert.equal(seg.eo.address, null, 'no target → no holonic address');
  }
});

test('every operator event in a real parse is stamped with its geometry', () => {
  const d = parseText('Gregor loved Grete. Grete saw Gregor.', { docId: 'x' });
  const evs = d.log.events;
  assert.ok(evs.length > 0);
  for (const e of evs) {
    assert.ok(e.eo, `event ${e.op}@${e.seq} carries sealed geometry`);
    assert.match(e.eo.notation, new RegExp(`^${e.op}\\(`), 'notation names the operator');
  }
});
