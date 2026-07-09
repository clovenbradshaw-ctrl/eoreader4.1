import { test } from 'node:test';
import assert from 'node:assert/strict';

import { significanceReflectMessages, cleanReflection, SIGNIFICANCE_REFLECT_SYSTEM } from '../src/fold/index.js';

// The significance-reflection prompt asks the reader's own first-person reaction at the
// surprise peak (reafferent by construction — "to you"), and cleanReflection enforces the
// one-plain-sentence form a small model won't hold on its own.

test('the prompt asks for the implicit connection over the folded region (not "what is interesting")', () => {
  const msgs = significanceReflectMessages('Explosive eruptions are driven by dissolved gases expanding as pressure drops.');
  assert.equal(msgs[0].content, SIGNIFICANCE_REFLECT_SYSTEM);
  assert.match(msgs[1].content, /Explosive eruptions are driven/);
  assert.match(msgs[1].content, /connection between these is implied but not stated/);
  assert.ok(!/most surprising|interesting/i.test(msgs[1].content), 'the surfer already found the interesting place — we do not re-ask');
});

test('cleanReflection strips a leaked preamble and keeps one plain sentence', () => {
  assert.equal(
    cleanReflection('Certainly! The most surprising thing is that eruptions are driven by gas, not heat. Also, lava cools fast.'),
    'The most surprising thing is that eruptions are driven by gas, not heat.',
  );
  assert.equal(
    cleanReflection("Here's the point: dolphins name each other with signature whistles."),
    'Dolphins name each other with signature whistles.',   // stripped lead ⇒ capitalized tail
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

test('cleanReflection strips the parroted evaluation frame, leaving the observation', () => {
  // the exact frames the 0.5B model echoed from a "most surprising/interesting" prompt
  assert.equal(
    cleanReflection('The most surprising and interesting aspect of stratovolcanoes is their ability to create long-lasting eruptions.'),
    'Their ability to create long-lasting eruptions.',
  );
  assert.equal(
    cleanReflection("The most surprising and interesting aspect of dolphin behavior I've observed is how they utilize echolocation to navigate and hunt."),
    'How they utilize echolocation to navigate and hunt.',
  );
  assert.equal(
    cleanReflection('The most surprising thing about the reef is that it is built by living animals.'),
    'It is built by living animals.',
  );
  // two pieces that parroted the SAME frame now differ in their surviving tails (de-churned)
  const a = cleanReflection('The most surprising and interesting aspect of dolphins is how they name each other.');
  const b = cleanReflection('The most surprising and interesting aspect of dolphins is how they sleep with half a brain.');
  assert.notEqual(a, b);
  assert.ok(!/most surprising/i.test(a) && !/most surprising/i.test(b));
});

test('cleanReflection strips the parroted CONNECTION frame, leaving the link', () => {
  assert.equal(
    cleanReflection('The connection between echolocation and whistles is that both rely on sound to organise social life.'),
    'Both rely on sound to organise social life.',
  );
  assert.equal(
    cleanReflection('These statements imply that magma composition governs how violently a volcano erupts.'),
    'Magma composition governs how violently a volcano erupts.',
  );
  assert.equal(
    cleanReflection('Together they suggest that the reef and the algae are one organism, not two.'),
    'The reef and the algae are one organism, not two.',
  );
});
