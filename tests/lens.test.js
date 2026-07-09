import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LENS_COLORS, emptyLens, activeId, activeWorkspace, getWorkspace, listWorkspaces,
  createWorkspace, renameWorkspace, updateWorkspace, setColor, setView, setActive,
  deleteWorkspace, moveWorkspace, isPinned, pin, unpin, togglePin, pinnedOf,
  workspacesOf, unpinnedEverywhere, serialize, deserialize,
} from '../src/workspace/lens.js';
import { refKey } from '../src/workspace/index.js';

// The lens layer is the grounding spine — which slice of memory a chat is
// narrowed to — so it must be provably correct without a browser: a lens never
// owns a source (it pins it), the same source pins into many lenses, the last
// lens can't be deleted, and a localStorage round-trip loses nothing.

test('emptyLens seeds one active workspace with the default accent', () => {
  const L = emptyLens();
  assert.equal(activeId(L), 'w0');
  assert.deepEqual(L.order, ['w0']);
  assert.equal(activeWorkspace(L).color, LENS_COLORS[0]);
  assert.deepEqual(activeWorkspace(L).pinned, []);
  assert.equal(activeWorkspace(L).view, 'source');
});

test('createWorkspace is immutable, appends to order, and picks an unused accent', () => {
  const L0 = emptyLens();
  const L1 = createWorkspace(L0, { name: 'Transit', id: 'w1', now: 1 });
  assert.deepEqual(L0.order, ['w0'], 'input not mutated');
  assert.deepEqual(L1.order, ['w0', 'w1']);
  assert.equal(getWorkspace(L1, 'w1').name, 'Transit');
  assert.notEqual(getWorkspace(L1, 'w1').color, LENS_COLORS[0], 'a fresh accent, not the one in use');
  assert.equal(activeId(L1), 'w0', 'creating does not switch active');
});

test('setActive switches the active lens; unknown id is a no-op', () => {
  let L = createWorkspace(emptyLens(), { name: 'B', id: 'w1' });
  L = setActive(L, 'w1');
  assert.equal(activeId(L), 'w1');
  assert.equal(setActive(L, 'ghost'), L, 'unknown id returns same ref');
  assert.equal(setActive(L, 'w1'), L, 're-activating current returns same ref');
});

test('rename / setColor / setView touch only the target lens', () => {
  let L = createWorkspace(emptyLens(), { name: 'B', id: 'w1' });
  L = renameWorkspace(L, 'w1', 'Renamed', 5);
  assert.equal(getWorkspace(L, 'w1').name, 'Renamed');
  L = setColor(L, 'w1', '#123456', 6);
  assert.equal(getWorkspace(L, 'w1').color, '#123456');
  L = setView(L, 'w1', 'chat', 7);
  assert.equal(getWorkspace(L, 'w1').view, 'chat');
  assert.equal(getWorkspace(L, 'w0').view, 'source', 'sibling untouched');
  assert.equal(renameWorkspace(L, 'nope', 'x'), L, 'unknown id no-op');
});

test('updateWorkspace cannot clobber id or pinned', () => {
  let L = pin(emptyLens(), 'w0', 'source:u');
  L = updateWorkspace(L, 'w0', { id: 'HACK', pinned: [], name: 'X' });
  assert.equal(getWorkspace(L, 'w0').id, 'w0');
  assert.deepEqual(getWorkspace(L, 'w0').pinned, ['source:u'], 'pins protected from updateWorkspace');
  assert.equal(getWorkspace(L, 'w0').name, 'X');
});

test('pinning: a source pins into many lenses, toggling is add/remove', () => {
  let L = createWorkspace(emptyLens(), { name: 'B', id: 'w1' });
  const k = refKey('source', 'https://x/y');
  L = pin(L, 'w0', k);
  const same = pin(L, 'w0', k);
  assert.equal(same, L, 'pinning twice is a no-op returning same ref');
  L = pin(L, 'w1', k);
  assert.deepEqual(workspacesOf(L, k).sort(), ['w0', 'w1']);
  assert.ok(isPinned(L, 'w1', k));
  L = togglePin(L, 'w1', k); // now unpins
  assert.equal(isPinned(L, 'w1', k), false);
  assert.deepEqual(pinnedOf(L, 'w0'), [k]);
});

test('pinnedOf defaults to the active lens', () => {
  let L = createWorkspace(emptyLens(), { name: 'B', id: 'w1' });
  L = pin(L, 'w1', 'source:a');
  L = setActive(L, 'w1');
  assert.deepEqual(pinnedOf(L), ['source:a'], 'no id → active lens pins');
});

test('unpin prunes and pin into a missing lens is a no-op', () => {
  let L = pin(emptyLens(), 'w0', 'source:a');
  assert.equal(pin(L, 'ghost', 'source:z'), L, 'pin into missing lens no-op');
  L = unpin(L, 'w0', 'source:a');
  assert.deepEqual(pinnedOf(L, 'w0'), []);
  assert.equal(unpin(L, 'w0', 'source:a'), L, 'unpin absent key no-op');
});

test('deleteWorkspace refuses the last lens and re-homes active', () => {
  let L = emptyLens();
  assert.equal(deleteWorkspace(L, 'w0'), L, 'cannot delete the only lens');
  L = createWorkspace(L, { name: 'B', id: 'w1' });
  L = createWorkspace(L, { name: 'C', id: 'w2' });
  L = setActive(L, 'w1');
  L = deleteWorkspace(L, 'w1');
  assert.equal(getWorkspace(L, 'w1'), null);
  assert.equal(activeId(L), 'w0', 'active fell back to the previous sibling');
  assert.deepEqual(L.order, ['w0', 'w2']);
});

test('moveWorkspace reorders the switcher', () => {
  let L = emptyLens();
  L = createWorkspace(L, { name: 'B', id: 'w1' });
  L = createWorkspace(L, { name: 'C', id: 'w2' });
  L = moveWorkspace(L, 'w2', 0);
  assert.deepEqual(L.order, ['w2', 'w0', 'w1']);
  assert.equal(moveWorkspace(L, 'ghost', 0), L, 'unknown id no-op');
});

test('unpinnedEverywhere returns live refKeys pinned in no lens', () => {
  let L = createWorkspace(emptyLens(), { name: 'B', id: 'w1' });
  const a = refKey('source', 'a'), b = refKey('source', 'b'), c = refKey('source', 'c');
  L = pin(L, 'w0', a);
  L = pin(L, 'w1', b);
  assert.deepEqual(unpinnedEverywhere(L, [a, b, c]), [c]);
});

test('listWorkspaces follows order and skips dangling ids', () => {
  let L = emptyLens();
  L = createWorkspace(L, { name: 'B', id: 'w1' });
  assert.deepEqual(listWorkspaces(L).map((w) => w.id), ['w0', 'w1']);
});

test('serialize / deserialize is a faithful round-trip', () => {
  let L = emptyLens();
  L = createWorkspace(L, { name: 'Transit', id: 'w1', now: 2 });
  L = pin(L, 'w1', refKey('source', 'https://x/y'));
  L = setActive(L, 'w1');
  L = setColor(L, 'w1', '#0f766e');
  const back = deserialize(serialize(L));
  assert.deepEqual(back, L);
});

test('deserialize tolerates garbage and reconciles order + active', () => {
  assert.deepEqual(deserialize('not json'), emptyLens());
  assert.deepEqual(deserialize(null), emptyLens());
  assert.deepEqual(deserialize('{}'), emptyLens(), 'no workspaces → fresh lens');
  // order forgot w2, active points at a ghost, pins carry a dupe.
  const raw = JSON.stringify({
    active: 'ghost',
    order: ['w1', 'missing'],
    workspaces: {
      w1: { name: 'A', color: '#111', pinned: ['source:u', 'source:u'] },
      w2: { name: 'B' },
    },
  });
  const L = deserialize(raw);
  assert.deepEqual(L.workspaces.w1.pinned, ['source:u'], 'dupes removed');
  assert.equal(L.workspaces.w2.view, 'source', 'missing fields normalized');
  assert.deepEqual(L.order, ['w1', 'w2'], 'dangling order dropped, forgotten id appended');
  assert.equal(L.active, 'w1', 'ghost active reconciled to a real lens');
});
