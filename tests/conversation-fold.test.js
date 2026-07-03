import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  projectFold, routeStance, stanceDescOf, isExplicitCompose, switchesFromCompose,
  composeKind, composeSubject, transitionPrompt, clearFoldMemo,
} from '../src/core/conversation-fold.js';

// The conversation event log is a chat's message list. An assistant turn tagged
// with a `stance` (and optional `focus`) is an enacted EVA the fold reduces over.
// All fixtures are fixed logs → deterministic, CI-safe (§10).

const compose = (kind, subject) => ({ role: 'asst', stance: 'compose', focus: { kind, subject: subject || null } });
const ground  = (sources) => ({ role: 'asst', stance: 'ground', sources: sources || [] });
const user    = (text) => ({ role: 'user', text });

// ---------------------------------------------------------------------------
// §10.1 — Fold purity + fields.

test('fold reads compose stance and tracks focus.kind / focus.subject', () => {
  clearFoldMemo();
  const thread = [
    user('write me a poem about the sea'), compose('poem', 'the sea'),
  ];
  const f = projectFold(thread, { chatId: 'c1' });
  assert.equal(f.stance, 'compose');
  assert.equal(f.focus.kind, 'poem');
  assert.equal(f.focus.subject, 'the sea');
});

test('focus.subject updates after "now one about the city", kind carries forward', () => {
  clearFoldMemo();
  const thread = [
    user('write me a poem about the sea'), compose('poem', 'the sea'),
    user('now one about the city'),        compose('', ''),   // kind/subject re-derived from user text
  ];
  const f = projectFold(thread, { chatId: 'c1' });
  assert.equal(f.stance, 'compose');
  assert.equal(f.focus.kind, 'poem');       // carried forward
  assert.equal(f.focus.subject, 'the city'); // updated
});

test('turn 1 (empty / no enacted turn) has null stance', () => {
  clearFoldMemo();
  assert.equal(projectFold([], { chatId: 'c1' }).stance, null);
  assert.equal(projectFold([user('hi')], { chatId: 'c1' }).stance, null);
});

test('pending (still-streaming) turns are excluded — fold is N-1 turns', () => {
  clearFoldMemo();
  const thread = [
    user('write a haiku'), compose('haiku', null),
    user('another'), { role: 'asst', stance: 'compose', pending: true },
  ];
  const f = projectFold(thread, { chatId: 'c1' });
  assert.equal(f.stance, 'compose');
  assert.equal(f.focus.kind, 'haiku');
});

test('memo: same (events, frame) returns an identical fold object', () => {
  clearFoldMemo();
  const thread = [user('write a poem'), compose('poem', null)];
  const a = projectFold(thread, { chatId: 'c1' });
  const b = projectFold(thread, { chatId: 'c1' });
  assert.equal(a, b);   // identity — served from the memo
});

test('impurity guard: changing the decay config changes the fold (config is in the key)', () => {
  clearFoldMemo();
  const thread = [
    user('q1'), ground(['s:a']),
    user('q2'), ground(['s:b']),
    user('q3'), ground(['s:c']),
  ];
  const wide = projectFold(thread, { chatId: 'c1', foldRules: { warmWindow: 3 } });
  const narrow = projectFold(thread, { chatId: 'c1', foldRules: { warmWindow: 1 } });
  assert.notEqual(wide, narrow);                       // distinct memo entries
  assert.deepEqual(narrow.warm.map((w) => w.ref), ['s:c']);       // only the last turn
  assert.equal(wide.warm.length, 3);                    // all three in window
});

// ---------------------------------------------------------------------------
// §10.2 — Continuation-by-default (the offline anaphora fix).

test('after a compose turn, "write me one" routes to compose with the model COLD', () => {
  clearFoldMemo();
  const f = projectFold([user('write a poem about the sea'), compose('poem', 'the sea')], { chatId: 'c1' });
  assert.equal(routeStance('write me one', f), 'compose');
  assert.equal(routeStance('do it', f), 'compose');
  assert.equal(routeStance('now one about the city', f), 'compose');
  assert.equal(routeStance('make it shorter', f), 'compose');
});

test('a self-contained question switches OUT of a compose thread (cold-path §5 seed)', () => {
  clearFoldMemo();
  const f = projectFold([user('write an emily dickinson poem'), compose('emily dickinson poem', null)], { chatId: 'c1' });
  // Fresh, self-contained questions leave the compose path (→ null, the app's ground/web path).
  assert.equal(routeStance('what is 237 * 637?', f), null);
  assert.equal(routeStance('who wrote Hamlet?', f), null);
  assert.equal(routeStance('how do HTML forms work?', f), null);
  // Anaphoric compose follow-ups still continue — the switch seed is narrow by design.
  assert.equal(routeStance('write me one', f), 'compose');
  assert.equal(routeStance('make it shorter', f), 'compose');
  assert.equal(routeStance('now one about the city', f), 'compose');
  assert.equal(routeStance('can you make it shorter?', f), 'compose');   // question-shaped but anaphoric
  assert.equal(routeStance('what if it were about the sea?', f), 'compose');
});

test('switchesFromCompose fires only on self-contained, non-compose questions', () => {
  assert.equal(switchesFromCompose('what is 237 * 637?'), true);
  assert.equal(switchesFromCompose('who wrote Hamlet?'), true);
  assert.equal(switchesFromCompose('write me another poem'), false);    // explicit compose stays compose
  assert.equal(switchesFromCompose('do it'), false);                    // not question-shaped
  assert.equal(switchesFromCompose('make it shorter'), false);
  assert.equal(switchesFromCompose('what if it were shorter?'), false); // anaphoric refinement
});

test('after a ground turn, a follow-up continues as ground (today’s behavior preserved)', () => {
  clearFoldMemo();
  const f = projectFold([user('who is X'), ground(['s:a'])], { chatId: 'c1' });
  assert.equal(routeStance('and what about Y', f), 'ground');
});

test('a fresh turn with an explicit compose request seeds compose; a bare question does not', () => {
  clearFoldMemo();
  const fresh = projectFold([], { chatId: 'c1' });
  assert.equal(routeStance('write me a haiku about rain', fresh), 'compose');
  assert.equal(routeStance('what is the capital of France', fresh), null);   // → app's ground/web path
});

// ---------------------------------------------------------------------------
// §10.3 — Warm activation + decay (turn-distance).

test('warm holds recently-touched sources and drops them after the window', () => {
  clearFoldMemo();
  const thread = [
    user('about A'), ground(['s:A']),
    user('more A'), ground(['s:A']),
    user('now B'), ground(['s:B']),
    user('more B'), ground(['s:B']),
  ];
  const f = projectFold(thread, { chatId: 'c1', foldRules: { warmWindow: 2 } });
  const refs = f.warm.map((w) => w.ref).sort();
  assert.deepEqual(refs, ['s:B']);   // A cooled off after 2 turns off its topic
});

// ---------------------------------------------------------------------------
// §10.4 — Transition override (warm model), and its fallback contract.

const warmModel = (verdict) => ({ warm: true, transitionVerdict: () => verdict });

test('a warm model overrides continuation only on a clean switch verdict', () => {
  clearFoldMemo();
  const f = projectFold([user('write a poem'), compose('poem', null)], { chatId: 'c1' });
  assert.equal(routeStance('what did the report say about X', f, { model: warmModel('GROUND') }), 'ground');
  assert.equal(routeStance('another', f, { model: warmModel('COMPOSE') }), 'compose');
  assert.equal(routeStance('unrelated thing', f, { model: warmModel('ISOLATE') }), null);
});

test('a garbage / empty / stalled verdict degrades to the continuation baseline', () => {
  clearFoldMemo();
  const f = projectFold([user('write a poem'), compose('poem', null)], { chatId: 'c1' });
  assert.equal(routeStance('write me one', f, { model: warmModel('CONTINUE') }), 'compose');
  assert.equal(routeStance('write me one', f, { model: warmModel('') }), 'compose');
  assert.equal(routeStance('write me one', f, { model: warmModel('blah blah') }), 'compose');
  assert.equal(routeStance('write me one', f, { model: { warm: true, transitionVerdict() { throw new Error('stall'); } } }), 'compose');
  // A cold model is never consulted — pure continuation.
  assert.equal(routeStance('write me one', f, { model: { warm: false, transitionVerdict: () => 'GROUND' } }), 'compose');
});

test('a structural marker sets stance directly, ahead of continuation', () => {
  clearFoldMemo();
  const f = projectFold([user('write a poem'), compose('poem', null)], { chatId: 'c1' });
  assert.equal(routeStance('anything', f, { marker: 'ground' }), 'ground');
  assert.equal(routeStance('anything', f, { marker: 'isolate' }), null);
});

// ---------------------------------------------------------------------------
// Helpers used by the app router / labels.

test('isExplicitCompose needs a compose verb AND a creative kind', () => {
  assert.equal(isExplicitCompose('write me a haiku'), true);
  assert.equal(isExplicitCompose('compose a sonnet about the sea'), true);
  assert.equal(isExplicitCompose('write me one'), false);       // no kind → anaphora, not explicit
  assert.equal(isExplicitCompose('what is a haiku'), false);    // no verb → a question
});

test('composeKind / composeSubject extract the kind and the running subject', () => {
  assert.equal(composeKind('write me an emily dickinson poem'), 'emily dickinson poem');
  assert.equal(composeKind('write me one'), '');
  assert.equal(composeSubject('now one about the city'), 'the city');
  assert.equal(composeSubject('make it shorter'), '');
});

test('stanceDescOf renders the router phrase', () => {
  assert.equal(stanceDescOf({ stance: 'compose', focus: { kind: 'poem', subject: 'the sea' } }),
    'composing a poem about the sea');
  assert.equal(stanceDescOf({ stance: 'ground', warm: [{ ref: 's:a' }, { ref: 's:b' }] }),
    'grounding in 2 sources');
  assert.equal(stanceDescOf(null), 'an isolated assistant chat');
});

test('transitionPrompt asks "did it switch", never "what kind"', () => {
  const p = transitionPrompt('write me one', 'composing a poem about the sea');
  assert.match(p, /Current stance: composing a poem about the sea/);
  assert.match(p, /CONTINUE/);
  assert.doesNotMatch(p, /what kind/i);
});
