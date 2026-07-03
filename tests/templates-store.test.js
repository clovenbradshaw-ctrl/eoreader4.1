import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  templateToJSON, templateFromJSON, TEMPLATE_SCHEMA,
  loadTemplatesDir, saveTemplate, templatePersister,
  loadTemplatesLocal, saveTemplateLocal, removeTemplateLocal, templateLocalPersister,
  createSpecLibrary, acquireSpec, createTaskSpec, needsResearch,
} from '../src/tasks/index.js';

// a minimal in-memory localStorage stand-in
const mockStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ── browser store (localStorage) — the templates.html viewer's backing ────────
test('the localStorage store round-trips a learned shape and forgets it', () => {
  const s = mockStorage();
  const tmpl = { kind: 'sonnet', organ: 'text', size: 600,
    sections: [{ role: 'octave', share: 1, dir: { act: 'open' } }, { role: 'sestet', share: 1, dir: { act: 'close' } }] };
  saveTemplateLocal(tmpl, s);
  const back = loadTemplatesLocal(s);
  assert.equal(back.sonnet.kind, 'sonnet');
  assert.equal(back.sonnet.sections.length, 2);
  removeTemplateLocal('sonnet', s);
  assert.deepEqual(loadTemplatesLocal(s), {}, 'forgotten');
});

test('templateLocalPersister wires a library to localStorage', () => {
  const s = mockStorage();
  const lib = createSpecLibrary({ onLearn: templateLocalPersister(s) });
  lib.define('haiku', { organ: 'text', size: 120, sections: [{ role: 'line', share: 1, dir: { act: 'open' } }] });
  assert.equal(Object.keys(loadTemplatesLocal(s)).length, 1, 'persisted on learn');
  // a fresh library seeded from the store knows it
  const lib2 = createSpecLibrary({ seed: loadTemplatesLocal(s) });
  assert.ok(lib2.learned('haiku'));
});

test('the store degrades to empty when no localStorage is present', () => {
  assert.deepEqual(loadTemplatesLocal(null), {});
  // a no-op, not a throw
  saveTemplateLocal({ kind: 'x', sections: [{ role: 'a', share: 1, dir: { act: 'open' } }] }, null);
});

// ── pure (de)serialization — browser-safe ─────────────────────────────────────
test('templateToJSON / templateFromJSON round-trip a neutral-directive shape', () => {
  const tmpl = {
    kind: 'sonnet', organ: 'text', format: 'prose', size: 600, source: 'learned',
    sections: [
      { role: 'octave', share: 1, dir: { act: 'open', detail: 'pose the problem' } },
      { role: 'sestet', share: 1, dir: { act: 'close', detail: 'resolve it' } },
    ],
  };
  const json = templateToJSON(tmpl);
  assert.equal(json.schema, TEMPLATE_SCHEMA);
  assert.equal(json.sections[0].dir.act, 'open');
  const back = templateFromJSON(json);
  assert.equal(back.kind, 'sonnet');
  assert.equal(back.sections.length, 2);
  assert.equal(back.sections[1].dir.act, 'close');
});

test('the learned content half survives the JSON round-trip', () => {
  const tmpl = {
    kind: 'substack', organ: 'text', format: 'verse', size: 300, source: 'learned',
    content: { lexicon: ['substack', 'culture', 'writers'], phrases: ['great culture'] },
    sections: [{ role: 'stanza 1', share: 1, dir: { act: 'open', detail: '2 lines — about culture' } }],
  };
  const back = templateFromJSON(templateToJSON(tmpl));
  assert.deepEqual([...back.content.lexicon], ['substack', 'culture', 'writers']);
  assert.deepEqual([...back.content.phrases], ['great culture']);
  // a malformed content block is dropped, not fatal
  const noisy = templateFromJSON({ kind: 'x', content: { lexicon: 'nope', phrases: [3] },
    sections: [{ role: 'a', share: 1, dir: { act: 'open' } }] });
  assert.equal(noisy.content, undefined);
});

test('a goal builder serializes via the {subject} placeholder and rehydrates', () => {
  const json = templateToJSON({ kind: 'note', sections: [{ role: 'body', share: 1, goal: (s) => `Write about ${s}.` }] });
  assert.match(json.sections[0].goal, /\{subject\}/);
  const back = templateFromJSON(json);
  assert.equal(back.sections[0].goal('owls'), 'Write about owls.');
});

test('templateFromJSON rejects malformed input (a bad install is skipped, not fatal)', () => {
  assert.equal(templateFromJSON('not json'), null);
  assert.equal(templateFromJSON({ kind: 'x' }), null, 'no sections');
  assert.equal(templateFromJSON({ sections: [{ role: 'a', share: 1, dir: { act: 'open' } }] }), null, 'no kind');
});

// ── the folder: machine writes, fresh library reads, no re-research ────────────
test('a learned shape persists to the folder and a fresh library installs it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eo-tpl-'));
  const lib = createSpecLibrary({ onLearn: templatePersister(dir) });
  const webSearch = async () => [{ text: '1. First quatrain\n2. Second quatrain\n3. Third quatrain\n4. Couplet' }];

  await acquireSpec({ request: 'write a sonnet about the sea', library: lib, webSearch });
  await lib.flush();                                   // wait for the write

  // the file exists and is valid JSON of the right shape
  const onDisk = JSON.parse(await readFile(join(dir, 'sonnet.json'), 'utf8'));
  assert.equal(onDisk.kind, 'sonnet');
  assert.equal(onDisk.sections.length, 4);

  // a brand-new library seeded from the folder already knows the kind
  const lib2 = createSpecLibrary({ seed: await loadTemplatesDir(dir) });
  assert.equal(needsResearch('sonnet', lib2), false, 'installed → no research');
  const spec = createTaskSpec({ request: 'write a sonnet about the sea', library: lib2 });
  assert.equal(spec.source, 'learned', 'provenance survives the round-trip — it was machine-learned');
  assert.equal(spec.sections.length, 4);
});

test('a hand-installed JSON template is picked up from the folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eo-tpl-'));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'haiku.json'), JSON.stringify({
    schema: 1, kind: 'haiku', organ: 'text', size: 120, source: 'installed',
    sections: [
      { role: 'line 1', share: 1, dir: { act: 'open' } },
      { role: 'line 2', share: 1, dir: { act: 'develop' } },
      { role: 'line 3', share: 1, dir: { act: 'close' } },
    ],
  }, null, 2));

  const lib = createSpecLibrary({ seed: await loadTemplatesDir(dir) });
  assert.deepEqual(lib.kinds(), ['haiku']);
  const spec = createTaskSpec({ request: 'write a haiku about rain', library: lib });
  assert.equal(spec.kind, 'haiku');
  assert.deepEqual(spec.sections.map((s) => s.role), ['line 1', 'line 2', 'line 3']);
});

test('loadTemplatesDir on a missing folder is empty, not an error', async () => {
  const seed = await loadTemplatesDir(join(tmpdir(), 'eo-does-not-exist-' + TEMPLATE_SCHEMA));
  assert.deepEqual(seed, {});
});

test('saveTemplate writes <kind>.json, slugging a multi-word kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eo-tpl-'));
  const file = await saveTemplate(dir, { kind: 'cover letter', organ: 'text', size: 400,
    sections: [{ role: 'body', share: 1, dir: { act: 'develop' } }] });
  assert.match(file, /cover-letter\.json$/);
  const back = templateFromJSON(await readFile(file, 'utf8'));
  assert.equal(back.kind, 'cover letter');
});
