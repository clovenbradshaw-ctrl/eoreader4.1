// chorus-vox — the vox leaf, optional and terminal (docs/chorus.md, "The vox
// leaf"). One fold in, one sentence out, no machinery words, single call. It never
// imports a model; the phrasing surface is injected and here stubbed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createVox } from '../src/chorus/vox.js';
import { foldVoice } from '../src/chorus/fold.js';

const fold = () => foldVoice({ level: 0, face: 'cube', cell: 'CON_Binding_Link', amp: 0.6, weight: 0.4, spans: ['the citation holds the claim'] });

test('the vox turns one fold into one human sentence', async () => {
  const vox = createVox({ phrase: async ({ excerpts }) => `${excerpts[0]}.` });
  const out = await vox.speak(fold());
  assert.equal(out.sentence, 'the citation holds the claim.');
  assert.equal(out.of, 'L0/cube/CON_Binding_Link');
  assert.ok(out.regenerable);
});

test('the discipline strips machinery: no operators, no addresses, no cell keys', () => {
  const vox = createVox({ phrase: () => '' });
  const said = vox.disciplined('The CON_Binding_Link cell binds the Figure to the Ground via a cube marginal.');
  assert.ok(!/CON_Binding_Link/.test(said));
  assert.ok(!/\bCON\b/.test(said));
  assert.ok(!/\bcube\b/i.test(said));
  assert.ok(!/\bFigure\b/.test(said));
});

test('one sentence out — a two-sentence surface is trimmed to the first', () => {
  const vox = createVox({ phrase: () => 'The lodger goes quietly broke. His money goes to his daughters.' });
  const out = vox.disciplined('The lodger goes quietly broke. His money goes to his daughters.');
  assert.equal(out, 'The lodger goes quietly broke.');
});

test('the vox speaks EXACTLY one fold — it cannot be handed two cells', async () => {
  const vox = createVox({ phrase: () => 'x' });
  await assert.rejects(() => vox.speak([fold(), fold()]), /exactly one fold/);
  await assert.rejects(() => vox.speak({ cell: 'CON_Binding_Link' }), /exactly one fold/);
});

test('excerpts override the fold provenance when the reader supplies them', async () => {
  const vox = createVox({ phrase: async ({ excerpts, cell }) => `${cell}: ${excerpts.join(' ')}` });
  const out = await vox.speak(fold(), { excerpts: ['a retired pasta-maker'] });
  // the cell code the stub leaked is stripped by the discipline
  assert.ok(!/CON_Binding_Link/.test(out.sentence));
  assert.ok(/pasta-maker/.test(out.sentence));
});

test('the vox requires an injected phrasing surface — it never imports a model', () => {
  assert.throws(() => createVox({}), /requires an injected phrase/);
});
