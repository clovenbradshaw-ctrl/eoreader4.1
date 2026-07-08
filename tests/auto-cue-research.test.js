import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// AUTO-CUE RESEARCH: when the offline grounded answer tells you, in the model's own words, that
// what you've read doesn't cover the question (a not-found / need-more-context abstention), the
// reader escalates to a web walk on its own instead of leaving you to type "do more research".
// The gate is _answerAbstains — a pure text read on the settled answer. These pin what it must
// catch (the real reported miss and its kin) and what it must NOT (an ordinary grounded answer,
// including one that states a factual absence while still answering).

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's full source from the app class body by balanced-brace matching.
const methodOf = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `method ${name} not found`);
  let i = src.indexOf('{', at);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return src.slice(at + 1, i + 1);
};

const harness = () => {
  const src = readFileSync(join(root, 'src/reader/app.dc.js'), 'utf8');
  const Cls = new Function(`return class H { ${methodOf(src, '_answerAbstains')} }`)();
  return new Cls();
};

test('_answerAbstains catches the reported miss — didn’t find any info / article doesn’t provide / needs more context', () => {
  const h = harness();
  // The exact shape from the bug report (dolphins/trap-fish).
  assert.equal(h._answerAbstains(
    "Unfortunately, I didn't find any information on how the trap fish behave or interact with the " +
    "dolphins that trap them. The article doesn't provide any insight into the relationship between " +
    "the trapped fish and the dolphins. It's possible that the user may need to provide more context " +
    "or clarify what they mean by \"trap fish\"."), true);
});

test('_answerAbstains catches its kin', () => {
  const h = harness();
  const yes = [
    "I couldn't find any details about that in what you've read.",
    "I was not able to locate that in the source.",
    "The text doesn't mention his birthplace.",
    "The reading does not cover the treaty's terms.",
    "That isn't discussed in the passage you shared.",
    "You'd need to provide more context for me to answer.",
    "Could you clarify what you mean by that?",
    "I don't have information on the 2024 results.",
  ];
  for (const s of yes) assert.equal(h._answerAbstains(s), true, `should abstain: ${s}`);
});

test('_answerAbstains does NOT trip on an ordinary grounded answer', () => {
  const h = harness();
  const no = [
    "Dolphins use their conical teeth to capture fast-moving prey such as forage fish, coleoids and shrimps.",
    "In Shark Bay, Australia, dolphins catch fish by trapping them in huge conch shells.",
    "The treaty was signed in 1848 and ceded the territory to the United States.",
    "There is strong evidence that the population declined after 1900.",   // factual claim, not an abstention
    "",
  ];
  for (const s of no) assert.equal(h._answerAbstains(s), false, `should NOT abstain: ${s}`);
});
