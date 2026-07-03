import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runTaskGraph, FIGURE, PATTERN,
  createTaskSpec, planArtifact, withOrgans, runArtifact, createSpecLibrary,
  OUTPUT_ORGANS, organFor, createOutputRegistry,
  textOrgan, musicOrgan, classifyArtifact,
} from '../src/tasks/index.js';

// ── the output membrane: descriptors are the mirror of organs/in ──────────────
test('organFor returns a descriptor, defaulting to text', () => {
  assert.equal(organFor('text').unit, 'tokens');
  assert.equal(organFor('music').unit, 'beats');
  assert.equal(organFor('nonesuch').id, 'text', 'unknown organ falls back to text');
  // the descriptor carries the single-reach ceiling and a floor, per modality
  assert.ok(OUTPUT_ORGANS.text.ceiling > OUTPUT_ORGANS.music.ceiling, 'a paragraph holds more than a phrase');
});

// ── the SAME creator plans a non-text artifact, sized in the organ's unit ─────
test('a melody is planned by the same creator but budgeted in beats, not tokens', () => {
  assert.equal(classifyArtifact('write a melody about spring'), 'melody');
  const spec = createTaskSpec({ request: 'write a melody about spring' });
  assert.equal(spec.kind, 'melody');
  assert.equal(spec.organ, 'music');
  assert.equal(spec.unit, 'beats');
  assert.equal(spec.tokens, undefined, 'a music spec carries no misleading token count');
  assert.ok(spec.sections.every((s) => s.unit === 'beats'));
  // budgets are in beats and within the music ceiling → Figure leaves
  assert.ok(spec.sections.every((s) => s.extent <= organFor('music').ceiling));
  assert.ok(spec.sections.every((s) => s.grain === FIGURE));
});

test('a long melody overflows the MUSIC ceiling (16 beats), not the text one', () => {
  const spec = createTaskSpec({ request: 'write a long melody about spring' });
  const dev = spec.sections.find((s) => s.role === 'development');
  assert.ok(dev.extent > organFor('music').ceiling, 'the development section overflows a phrase');
  assert.equal(dev.grain, PATTERN, 'so it is a Pattern goal the decomposer must split');
  // crucially it overflowed at 16 beats, nowhere near the 256-token text ceiling
  assert.ok(dev.extent < 64, 'still tiny in absolute terms — beats, not tokens');
});

// ── the directive is modality-neutral — one move, lowered two ways ────────────
test('a melody section carries a neutral directive, not baked English', () => {
  const spec = createTaskSpec({ request: 'write a melody about spring' });
  const motif = spec.sections.find((s) => s.role === 'opening motif');
  assert.equal(motif.directive.act, 'open', 'the neutral move is carried');
  assert.equal(motif.directive.subject, 'spring');
  // the goal string is the MUSIC lowering of that directive
  assert.match(motif.goal, /motif/i);
  assert.match(motif.goal, /spring/);
});

test('the SAME directive lowers to a sentence (text) or a phrase (music)', () => {
  const directive = { act: 'open', role: 'opening motif', subject: 'the sea', detail: null };
  const asText = textOrgan.lower(directive);
  const asMusic = musicOrgan.lower(directive);
  assert.notEqual(asText, asMusic, 'two modalities, two renderings of one move');
  assert.match(asText, /^Open the opening motif about the sea/);
  assert.match(asMusic, /motif/i);
  assert.match(asMusic, /phrase/i);
});

test('the text arc carries neutral directives, lowered to sentences', () => {
  const spec = createTaskSpec({ request: 'write an essay about owls' });
  assert.ok(spec.sections.every((s) => s.directive && s.directive.act), 'every section is a neutral move');
  // the text organ lowered the open directive to an English sentence
  assert.match(spec.sections[0].goal, /^Open the opening about owls/);
});

test('an INSTALLED template may use a literal goal string (legacy path), directive null', () => {
  const lib = createSpecLibrary({
    seed: { ['press release']: { organ: 'text', size: 400, sections: [
      { role: 'headline', share: 0.5, goal: (s) => `Write a headline about ${s}.` },
      { role: 'body', share: 1.5, goal: (s) => `Write the body about ${s}.` },
    ] } },
  });
  const spec = createTaskSpec({ request: 'write a press release about a launch', library: lib });
  assert.equal(spec.sections[0].directive, null, 'a literal goal carries no directive');
  assert.match(spec.sections[0].goal, /headline about a launch/i);
});

test('withOrgans hands the renderer the neutral directive', async () => {
  const seen = [];
  const registry = createOutputRegistry({ music: (view) => { seen.push(view); return '♪'; } });
  const plan = planArtifact({ request: 'write a melody about spring' });
  const subs = plan.decompose({ goal: plan.goal, depth: 0 });
  await withOrgans(plan, registry)({ goal: subs[0].goal, depth: 1 });
  assert.equal(seen[0].directive.act, 'open', 'the renderer can read the move, not just the lowered text');
});

// ── withOrgans dispatches each leaf to its organ's renderer ───────────────────
test('withOrgans routes a music leaf through the music renderer with maxBeats', async () => {
  const seen = [];
  const registry = createOutputRegistry({
    music: (view) => { seen.push(view); return '♪' + view.role + '♪'; },
  });
  const plan = planArtifact({ request: 'write a melody about spring' });
  const face = withOrgans(plan, registry);
  const subs = plan.decompose({ goal: plan.goal, depth: 0 });
  await face({ goal: subs[0].goal, depth: 1 });
  const v = seen[0];
  assert.equal(v.organ, 'music');
  assert.equal(v.unit, 'beats');
  assert.equal(v.maxBeats, v.extent, 'the music renderer translated extent → maxBeats');
  assert.equal(v.maxTokens, undefined, 'no token ceiling leaked into a music leaf');
});

test('an untagged (text) leaf still flows through the text renderer — strict superset', async () => {
  const seen = [];
  const registry = createOutputRegistry({ text: (view) => { seen.push(view); return view.goal; } });
  const plan = planArtifact({ request: 'write an essay about owls' });
  const face = withOrgans(plan, registry);
  const subs = plan.decompose({ goal: plan.goal, depth: 0 });
  await face({ goal: subs[1].goal, depth: 1 });
  assert.equal(seen[0].organ, 'text');
  assert.equal(seen[0].maxTokens, seen[0].extent, 'text renderer translated extent → maxTokens');
});

// ── end-to-end: the SAME runTaskGraph runs a melody ───────────────────────────
test('runArtifact renders a melody end-to-end through the music organ', async () => {
  const res = await runArtifact({
    request: 'write a melody about the sea',
    organs: { music: (view) => `♪[${view.role}|${view.maxBeats}b]♪` },
  });
  assert.equal(res.spec.organ, 'music');
  assert.equal(res.spec.unit, 'beats');
  assert.equal(res.progress.total, 3, 'opening motif · development · cadence');
  assert.equal(res.progress.done, 3);
  assert.equal(res.incoherent.length, 0);
  assert.match(res.output, /♪\[opening motif\|\d+b\]♪/);
});

test('a long melody nests sub-phrases via the music ceiling, still coherent', async () => {
  const res = await runArtifact({
    request: 'write a long melody about the sea',
    organs: { music: (view) => `♪[${view.role}]♪` },
  });
  const depths = [];
  const walk = (n) => { if (n.children?.length) n.children.forEach(walk); else depths.push(n.depth); };
  walk(res.graph.root);
  assert.ok(Math.max(...depths) >= 2, 'the development section split into sub-phrases');
  assert.equal(res.incoherent.length, 0, 'split, not jammed — the music ceiling drove it');
});

// ── the text path is unchanged by the generalization (regression guard) ───────
test('an essay still runs through runArtifact via the single-modality shorthand', async () => {
  const res = await runArtifact({
    request: 'write an essay about the sea',
    generate: (view) => { assert.ok(view.maxTokens > 0); return `[${view.role}]`; },
  });
  assert.equal(res.spec.organ, 'text');
  assert.equal(res.spec.unit, 'tokens');
  assert.equal(res.spec.tokens, res.spec.extent, 'text keeps the back-compat tokens alias');
  assert.equal(res.progress.total, 3, 'the text arc: opening · development · close');
});
