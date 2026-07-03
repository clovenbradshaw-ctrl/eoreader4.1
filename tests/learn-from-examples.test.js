import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  learnStructureFromExamples, exampleQuery, parsePoem,
  createSpecLibrary, acquireSpec, createTaskSpec, runArtifact,
} from '../src/tasks/index.js';

// Real public-domain Emily Dickinson poems — the EXAMPLES the engine reads.
const DICKINSON = [
`Because I could not stop for Death –
He kindly stopped for me –
The Carriage held but just Ourselves –
And Immortality.

We slowly drove – He knew no haste
And I had put away
My labor and my leisure too,
For His Civility –`,

`Hope is the thing with feathers –
That perches in the soul –
And sings the tune without the words –
And never stops – at all –

And sweetest – in the Gale – is heard –
And sore must be the storm –
That could abash the little Bird
That kept so many warm –`,
];

test('parsePoem splits into stanzas and lines', () => {
  const p = parsePoem(DICKINSON[0]);
  assert.equal(p.length, 2, 'two stanzas');
  assert.equal(p[0].length, 4, 'a quatrain');
  assert.match(p[0][0], /Because I could not stop/);
});

test('learnStructureFromExamples reads the poems and learns the form', () => {
  const tmpl = learnStructureFromExamples('emily dickinson poem', DICKINSON);
  assert.ok(tmpl, 'a shape was learned');
  assert.equal(tmpl.source, 'learned');
  assert.equal(tmpl.provenance.via, 'examples', 'learned by reading, not from an authority');
  // the signature form, inferred — not hardcoded
  assert.equal(tmpl.form.linesPerStanza, 4, 'quatrains');
  assert.deepEqual(tmpl.form.syllablePattern, [8, 6, 8, 6], 'common meter, learned from syllable counts');
  assert.equal(tmpl.form.terminator, '–', "Dickinson's dash, learned as the line terminator");
  // the core engine ran the SEG cut and scored it
  assert.equal(typeof tmpl.form.segF1, 'number');
  // sections are stanzas, with arc acts
  assert.ok(tmpl.sections.length >= 1);
  assert.equal(tmpl.sections[0].dir.act, 'open');
  assert.equal(tmpl.sections.at(-1).dir.act, 'close');
  // the learned meter rides into each leaf instruction
  assert.match(tmpl.sections[0].dir.detail, /8-6-8-6/);
});

test('the learner reads the CONTENT too — lexicon, and per-section themes in the details', () => {
  const tmpl = learnStructureFromExamples('emily dickinson poem', DICKINSON);
  // the kind's lexicon: open-class words off the examples, no grammar words
  assert.ok(tmpl.content, 'a content half was learned');
  assert.ok(tmpl.content.lexicon.length > 0);
  assert.ok(tmpl.content.lexicon.includes('carriage'), 'the poems\' own words, not just counts');
  assert.ok(tmpl.content.lexicon.every((w) => !['the', 'and', 'that', 'could'].includes(w)), 'stopwords stay out');
  // each section's directive says what that position is ABOUT, not just the meter
  assert.match(tmpl.sections[0].dir.detail, /about carriage|death/, 'stanza 1 carries its matter');
  assert.match(tmpl.sections[0].dir.detail, /8-6-8-6/, '…alongside its form');
});

test('repeated word runs are learned as the kind\'s stock phrases', () => {
  const copy = [
`The subscription network for independent writers and creators.
Substack is the home for great culture.

Start writing. Start podcasting. Start a community.
Substack gives you a direct line to your audience.

Great culture is worth paying for.
Writers and creators earn real money on Substack.`,
  ];
  const tmpl = learnStructureFromExamples('substack', copy);
  assert.ok(tmpl.content.phrases.includes('great culture'), 'the refrain surfaces');
  assert.ok(tmpl.content.phrases.includes('writers and creators'));
  assert.ok(tmpl.content.lexicon.includes('substack'), 'the copy\'s own vocabulary is the lexicon');
});

test('learnStructureFromExamples returns null on non-poems (arc floor stands)', () => {
  assert.equal(learnStructureFromExamples('x', []), null);
  assert.equal(learnStructureFromExamples('x', ['']), null);
});

test('exampleQuery asks for examples of the kind, not a how-to', () => {
  assert.match(exampleQuery('sonnet'), /sonnet/);
  assert.match(exampleQuery('sonnet'), /examples?/i);
  assert.doesNotMatch(exampleQuery('sonnet'), /how to/i);
});

// ── acquireSpec prefers learning from examples over a definition ──────────────
test('acquireSpec learns from an injected exampleSearch and caches it', async () => {
  const lib = createSpecLibrary();
  let asked = null;
  const exampleSearch = async (q) => { asked = q; return DICKINSON.map((text) => ({ text })); };
  const tmpl = await acquireSpec({ request: 'write an emily dickinson poem', library: lib, exampleSearch });
  assert.ok(tmpl, 'learned from examples');
  assert.match(asked, /examples/i, 'it searched for examples');
  assert.equal(tmpl.provenance.via, 'examples');
  // cached: the spec now uses the learned stanza form
  const spec = createTaskSpec({ request: 'write an emily dickinson poem', library: lib });
  assert.equal(spec.source, 'learned');
  assert.equal(spec.format, 'verse');
  assert.ok(spec.sections.every((s) => /stanza/.test(s.role)));
});

test('runArtifact learns from examples on demand, then builds with the learned form', async () => {
  const exampleSearch = async () => DICKINSON.map((text) => ({ text }));
  const seen = [];
  const res = await runArtifact({
    request: 'write an emily dickinson poem',
    exampleSearch,
    generate: (view) => { seen.push(view.role); return `[${view.role}]`; },
  });
  assert.equal(res.spec.source, 'learned');
  assert.equal(res.spec.format, 'verse');
  assert.ok(seen.every((r) => /stanza/.test(r)), 'leaves are stanzas');
  assert.ok(res.library.learned('emily dickinson poem'), 'cached for next time');
});

test('examples beat a definition when both are offered', async () => {
  const lib = createSpecLibrary();
  const exampleSearch = async () => DICKINSON.map((text) => ({ text }));
  const webSearch = async () => [{ text: '1. Introduction\n2. Body\n3. Conclusion' }];
  const tmpl = await acquireSpec({ request: 'write an emily dickinson poem', library: lib, exampleSearch, webSearch });
  assert.equal(tmpl.provenance.via, 'examples', 'the example path wins');
});
