import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runTaskGraph, FIGURE, PATTERN,
  LEAF_MAX_TOKENS,
  artifactKindOf, classifyArtifact, subjectOf, readLength,
  createTaskSpec, planArtifact, withBudgets, runArtifact,
  deriveSpecFromDefinition, createSpecLibrary, acquireSpec, needsResearch, researchQuery,
  GENERIC_SHAPES,
} from '../src/tasks/index.js';

// ── classification is OPEN-VOCABULARY — the kind is whatever noun is named ─────
test('artifactKindOf reads the artifact noun, open-vocabulary', () => {
  assert.equal(artifactKindOf('write an essay about the moon'), 'essay');
  assert.equal(artifactKindOf('draft a report on Q3 sales'), 'report');
  assert.equal(artifactKindOf('write a short story about a fox'), 'story');
  assert.equal(artifactKindOf('compose a cover letter for a job'), 'cover letter');  // two-word kind
  assert.equal(artifactKindOf('write a sonnet about the sea'), 'sonnet');            // never shipped — still a kind
  assert.equal(artifactKindOf('list the planets'), 'list');
  assert.equal(artifactKindOf('what is the capital of France?'), 'answer');          // a question, not a make
  assert.equal(artifactKindOf(''), 'answer');
  assert.equal(classifyArtifact('write an essay'), 'essay', 'classifyArtifact is the alias');
});

test('subjectOf strips the imperative and the detected kind', () => {
  assert.equal(subjectOf('write a short essay about climate change'), 'climate change');
  assert.equal(subjectOf('please draft a detailed report on renewable energy'), 'renewable energy');
  assert.equal(subjectOf('compose a sonnet about the sea'), 'the sea');
  assert.equal(subjectOf('photosynthesis'), 'photosynthesis');
});

test('readLength scales the budget off the request size words', () => {
  assert.equal(readLength('write an essay').scale, 1);
  assert.equal(readLength('write a short essay').scale, 0.5);
  assert.ok(readLength('write a long essay').scale > 1);
});

// ── no shipped guide: an unlearned kind gets the UNIVERSAL ARC floor ──────────
test('an unlearned essay falls back to the universal arc, not a stored essay guide', () => {
  const spec = createTaskSpec({ request: 'write an essay about the sea' });
  assert.equal(spec.kind, 'essay');
  assert.equal(spec.subject, 'the sea');
  assert.equal(spec.source, 'fallback', 'the arc is a floor, not learned/installed');
  assert.deepEqual(spec.sections.map((s) => s.role), ['opening', 'development', 'close']);
  // the arc sections carry NEUTRAL directives (no baked English)
  assert.ok(spec.sections.every((s) => s.directive && s.directive.act));
  const sum = spec.sections.reduce((a, s) => a + s.tokens, 0);
  assert.ok(Math.abs(sum - spec.tokens) <= spec.sections.length, 'budgets ≈ total');
});

test('the arc floor is identical whatever the kind, until the kind is learned', () => {
  const essay = createTaskSpec({ request: 'write an essay about owls' });
  const memo = createTaskSpec({ request: 'write a memo about owls' });
  assert.deepEqual(essay.sections.map((s) => s.role), memo.sections.map((s) => s.role),
    'no per-kind structure is shipped — both get the arc');
});

test('a long request overflows the leaf ceiling and the development nests', () => {
  const spec = createTaskSpec({ request: 'write a long detailed essay about the sea' });
  const dev = spec.sections.find((s) => s.role === 'development');
  assert.ok(spec.tokens > 512, 'length scaled the total up');
  assert.equal(dev.grain, PATTERN);
  assert.ok(dev.tokens > LEAF_MAX_TOKENS);
});

test('a bare question is the degenerate single-leaf plan', () => {
  const spec = createTaskSpec({ request: 'what is the capital of France?' });
  assert.equal(spec.kind, 'answer');
  assert.equal(spec.sections.length, 1);
  assert.equal(spec.sections[0].grain, FIGURE);
});

// ── planArtifact — the decompose face the runner consumes ─────────────────────
test('planArtifact.decompose unravels the root into the arc sections', () => {
  const plan = planArtifact({ request: 'write an essay about bees' });
  const subs = plan.decompose({ goal: plan.goal, depth: 0 });
  assert.equal(subs.length, 3);
  // a Figure section is a leaf (no further split)
  const opening = plan.spec.sections.find((s) => s.role === 'opening');
  assert.deepEqual(plan.decompose({ goal: opening.goal, depth: 1 }), []);
});

test('planArtifact.decompose splits a Pattern section into leaf-sized parts', () => {
  const plan = planArtifact({ request: 'write a comprehensive essay about bees' });
  plan.decompose({ goal: plan.goal, depth: 0 });
  const dev = plan.spec.sections.find((s) => s.role === 'development');
  const parts = plan.decompose({ goal: dev.goal, depth: 1 });
  assert.ok(parts.length >= 2, 'an overflowing section splits');
  for (const p of parts) {
    const sec = plan.budgetFor(p.goal);
    assert.ok(sec && sec.tokens <= LEAF_MAX_TOKENS, 'each part fits a small-model reach');
    assert.equal(p.grain, FIGURE);
  }
});

// ── withBudgets — every leaf is handed its small-model contract ───────────────
test('withBudgets hands each leaf its maxTokens, role and format', () => {
  const plan = planArtifact({ request: 'write an essay about owls' });
  const subs = plan.decompose({ goal: plan.goal, depth: 0 });
  const captured = [];
  const gen = withBudgets(plan, (view) => { captured.push(view); return view.goal; });
  gen({ goal: subs[1].goal, depth: 1 });
  const v = captured[0];
  assert.equal(v.role, 'development');
  assert.equal(v.format, 'prose');
  assert.ok(v.maxTokens > 0 && v.maxTokens <= LEAF_MAX_TOKENS);
  assert.equal(v.spec.kind, 'essay');
});

// ── end-to-end through the real runner ────────────────────────────────────────
test('runArtifact builds a graph and generates each section once, within budget', async () => {
  const seen = [];
  const res = await runArtifact({
    request: 'write an essay about the sea',
    generate: (view) => { seen.push(view.role); assert.ok(view.maxTokens > 0); return `[${view.role}]`; },
  });
  assert.deepEqual(seen, ['opening', 'development', 'close'], 'depth-first section order');
  assert.equal(res.spec.kind, 'essay');
  assert.equal(res.progress.total, 3);
  assert.equal(res.progress.done, 3);
  assert.equal(res.incoherent.length, 0, 'budgets match grains → no confab flags');
});

test('a long run nests a section and stays coherent', async () => {
  const res = await runArtifact({
    request: 'write a comprehensive essay about the sea',
    generate: (view) => `[${view.role}]`,
  });
  const depths = [];
  const walk = (n) => { if (n.children?.length) n.children.forEach(walk); else depths.push(n.depth); };
  walk(res.graph.root);
  assert.ok(Math.max(...depths) >= 2, 'a Pattern section split one level deeper');
  assert.equal(res.incoherent.length, 0);
});

// ── the internet-as-brain path: learn the kind, then reuse it ─────────────────
test('needsResearch is true for any unlearned kind (nothing is shipped)', () => {
  const lib = createSpecLibrary();
  assert.equal(needsResearch('essay', lib), true, 'no shipped essay guide');
  assert.equal(needsResearch('sonnet', lib), true);
  assert.equal(needsResearch('answer', lib), false, 'a bare answer needs no shape');
  assert.match(researchQuery('sonnet'), /sonnet/);
});

test('acquireSpec researches an unknown kind, derives a shape, and caches it', async () => {
  const lib = createSpecLibrary();
  const webSearch = async (q) => {
    assert.match(q, /sonnet/);
    return [{ text: '1. First quatrain\n2. Second quatrain\n3. Third quatrain\n4. Final couplet' }];
  };
  const tmpl = await acquireSpec({ request: 'write a sonnet about the sea', library: lib, webSearch });
  assert.ok(tmpl, 'a shape was learned');
  assert.equal(needsResearch('sonnet', lib), false, 'now cached');
  const spec = createTaskSpec({ request: 'write a sonnet about the sea', library: lib });
  assert.equal(spec.source, 'learned');
  assert.deepEqual(spec.sections.map((s) => s.role),
    ['first quatrain', 'second quatrain', 'third quatrain', 'final couplet']);
});

test('runArtifact researches on demand when handed a webSearch', async () => {
  const webSearch = async () => [{ text: '1. Greeting\n2. Body\n3. Sign-off' }];
  const res = await runArtifact({
    request: 'write a cover letter for a job',
    webSearch,
    generate: (view) => `[${view.role}]`,
  });
  assert.equal(res.spec.source, 'learned', 'the kind was learned before planning');
  assert.deepEqual(res.spec.sections.map((s) => s.role), ['greeting', 'body', 'sign-off']);
  assert.ok(res.library.learned('cover letter'), 'and cached for next time');
});

test('deriveSpecFromDefinition parses real web markdown (bold, numbered, ## headings)', () => {
  // the shape the live Emily Dickinson research actually returned
  const text = `Major Characteristics

1. **Lyric Form** - Short poems with a single speaker.
2. **Common Meter** - Alternating lines of eight and six syllables.
3. **Slant Rhyme** - Uses approximate rhyme.
## Dashes
Her signature dashes function as breath marks.`;
  const tmpl = deriveSpecFromDefinition('emily dickinson poem', text);
  assert.ok(tmpl, 'a shape was derived from real markdown');
  const roles = tmpl.sections.map((s) => s.role);
  assert.ok(roles.includes('lyric form'), 'bold heading parsed');
  assert.ok(roles.includes('common meter') && roles.includes('slant rhyme'));
  assert.equal(tmpl.sections[0].dir.act, 'open');
});

test('artifactKindOf keeps a style modifier with the artifact noun', () => {
  assert.equal(artifactKindOf('write an emily dickinson poem'), 'emily dickinson poem');
  assert.equal(artifactKindOf('write a poem'), 'poem');
  assert.equal(artifactKindOf('compose a cover letter for a job'), 'cover letter');
});

test('offline (no webSearch) falls back to the arc, never invents a guide', async () => {
  const res = await runArtifact({
    request: 'write a sonnet about the sea',
    generate: (view) => `[${view.role}]`,
  });
  assert.equal(res.spec.source, 'fallback');
  assert.deepEqual(res.spec.sections.map((s) => s.role), ['opening', 'development', 'close']);
});

// ── deriveSpecFromDefinition — the parse, with neutral directives ─────────────
test('deriveSpecFromDefinition parses roles and maps them to arc directives', () => {
  const definition = `A good essay has these parts:
1. Introduction — the hook and the thesis
2. Body paragraphs — each develops one point with evidence
3. Conclusion — restate the thesis and close`;
  const tmpl = deriveSpecFromDefinition('essay', definition);
  assert.ok(tmpl);
  const roles = tmpl.sections.map((s) => s.role);
  assert.ok(roles.includes('introduction') && roles.includes('conclusion'));
  assert.equal(tmpl.sections[0].dir.act, 'open', 'first element → open');
  assert.equal(tmpl.sections.at(-1).dir.act, 'close', 'last element → close');
  assert.equal(tmpl.source, 'learned');
});

test('deriveSpecFromDefinition returns null on unusable text (arc floor stands)', () => {
  assert.equal(deriveSpecFromDefinition('essay', ''), null);
  assert.equal(deriveSpecFromDefinition('essay', 'just prose with no structure named at all'), null);
});

// ── the library ───────────────────────────────────────────────────────────────
test('the library returns the arc floor until a kind is learned, then the learned shape', () => {
  const lib = createSpecLibrary();
  assert.equal(lib.learned('report'), null, 'nothing learned yet');
  assert.equal(lib.get('report').source, 'fallback', 'get falls back to the arc');

  lib.defineFromDefinition('report', 'Sections:\n- Background\n- Analysis\n- Recommendation');
  const spec = createTaskSpec({ request: 'write a report on water use', library: lib });
  assert.equal(spec.source, 'learned');
  assert.deepEqual(spec.sections.map((s) => s.role), ['background', 'analysis', 'recommendation']);
});

// ── grounding the claim: the degenerate plan is one generation ────────────────
test('runArtifact on a bare answer is byte-identical to one generate call', async () => {
  let calls = 0;
  const res = await runArtifact({
    request: 'what is the capital of France?',
    generate: () => { calls += 1; return 'Paris.'; },
    runner: runTaskGraph,
  });
  assert.equal(calls, 1, 'one leaf, one generation');
  assert.equal(res.output, 'Paris.');
  assert.equal(res.graph.root.children.length, 0, 'no nesting — the root is the leaf');
});

// the only shipped shapes are the universal arc (a floor, not a guide)
test('GENERIC_SHAPES holds only the universal arc, per organ', () => {
  assert.deepEqual(Object.keys(GENERIC_SHAPES).sort(), ['music', 'text']);
  for (const shape of Object.values(GENERIC_SHAPES)) {
    assert.equal(shape.source, 'fallback');
    assert.deepEqual(shape.sections.map((s) => s.dir.act), ['open', 'develop', 'close']);
  }
});
