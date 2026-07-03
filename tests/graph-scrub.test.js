import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scrubGraphLines } from '../src/turn/stages.js';

// The meaning graph fed to the talker must obey the surface discipline: no codes or ids ever
// reach the model. A COMPOSITE doc namespaces entity ids (web-<hash>␟label); when the label
// lookup misses, the raw id leaks into an arrow. scrubGraphLines is the membrane guard.
test('scrubGraphLines strips a composite id prefix to the human label', () => {
  const out = scrubGraphLines(['Ryan Coogler -> web-30cb0466e65f1f7d␟room : leads']);
  assert.deepEqual(out, ['Ryan Coogler -> room : leads']);
});

test('scrubGraphLines drops a line whose endpoint is an opaque id with no readable label', () => {
  const out = scrubGraphLines([
    'Chris Carter: an executive producer of the reboot',
    'foo -> news-9f3a1b2c4d5e6f : linked-to',     // no label behind the id → drop
  ]);
  assert.deepEqual(out, ['Chris Carter: an executive producer of the reboot']);
});

test('scrubGraphLines leaves clean lines untouched', () => {
  const lines = ['Gregor -> Grete : tends', 'Grete: his sister'];
  assert.deepEqual(scrubGraphLines(lines), lines);
});
