import { test } from 'node:test';
import assert from 'node:assert/strict';

import { significanceReflectMessages, cleanReflection, SIGNIFICANCE_REFLECT_SYSTEM } from '../src/fold/index.js';

// The significance-reflection prompt asks the reader's own first-person reaction at the
// surprise peak (reafferent by construction — "to you"), and cleanReflection enforces the
// one-plain-sentence form a small model won't hold on its own.

test('the prompt is first-person and surprise-oriented, over the folded region', () => {
  const msgs = significanceReflectMessages('Explosive eruptions are driven by dissolved gases expanding as pressure drops.');
  assert.equal(msgs[0].content, SIGNIFICANCE_REFLECT_SYSTEM);
  assert.match(msgs[1].content, /Explosive eruptions are driven/);
  assert.match(msgs[1].content, /what is most surprising and\/or interesting about this to you\?/);
});

test('cleanReflection strips a leaked preamble and keeps one plain sentence', () => {
  assert.equal(
    cleanReflection('Certainly! The most surprising thing is that eruptions are driven by gas, not heat. Also, lava cools fast.'),
    'The most surprising thing is that eruptions are driven by gas, not heat.',
  );
  assert.equal(
    cleanReflection("Here's the point: dolphins name each other with signature whistles."),
    'dolphins name each other with signature whistles.',
  );
});

test('cleanReflection strips a list lead and unwraps a quote', () => {
  assert.equal(cleanReflection('- The reef is an animal, not a rock.'), 'The reef is an animal, not a rock.');
  assert.equal(cleanReflection('“Bees vote on where to nest.”'), 'Bees vote on where to nest.');
});

test('cleanReflection rejects a pure-scaffold or empty residue', () => {
  assert.equal(cleanReflection('Certainly!'), '');
  assert.equal(cleanReflection(''), '');
  assert.equal(cleanReflection('   '), '');
});

test('cleanReflection passes a clean single sentence through unchanged', () => {
  const s = 'The press did not just copy books faster; it made a fixed, shareable text possible.';
  assert.equal(cleanReflection(s), s);
});
