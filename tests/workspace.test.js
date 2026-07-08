import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  refKey, parseRef, emptyWorkspace,
  createFolder, renameFolder, updateFolder, deleteFolder, moveFolder,
  descendantIds, fileItem, unfileItem, moveItem, foldersOf, itemsIn,
  unfiled, buildTree, flatTree, serialize, deserialize,
} from '../src/workspace/index.js';

// The filing layer is the one piece of the workspace that must be provably
// correct without a browser: folders nest, items file into many folders at
// once, deletes lift the subtree, and a round-trip through localStorage loses
// nothing. These pin all of that on the pure model.

test('refKey / parseRef round-trip, and ids may contain colons (urls)', () => {
  const url = 'https://en.wikipedia.org/wiki/Howard_Shore';
  const k = refKey('source', url);
  assert.equal(k, `source:${url}`);
  assert.deepEqual(parseRef(k), { kind: 'source', id: url });
  assert.deepEqual(parseRef('chat:c123'), { kind: 'chat', id: 'c123' });
  assert.deepEqual(parseRef('bare'), { kind: 'bare', id: '' });
});

test('createFolder is immutable and assigns increasing sibling order', () => {
  const ws0 = emptyWorkspace();
  const ws1 = createFolder(ws0, { name: 'A', id: 'a', now: 1 });
  assert.deepEqual(ws0, emptyWorkspace(), 'input not mutated');
  const ws2 = createFolder(ws1, { name: 'B', id: 'b', now: 2 });
  assert.equal(ws2.folders.a.order, 0);
  assert.equal(ws2.folders.b.order, 1);
  assert.equal(ws2.folders.a.parentId, null);
});

test('nesting: children track their parent and descendantIds walks the subtree', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'root', id: 'r' });
  ws = createFolder(ws, { name: 'child', id: 'c', parentId: 'r' });
  ws = createFolder(ws, { name: 'grand', id: 'g', parentId: 'c' });
  ws = createFolder(ws, { name: 'other', id: 'o' });
  assert.deepEqual(descendantIds(ws, 'r').sort(), ['c', 'g']);
  assert.deepEqual(descendantIds(ws, 'o'), []);
});

test('renameFolder / updateFolder change only the target folder', () => {
  let ws = createFolder(emptyWorkspace(), { name: 'A', id: 'a' });
  ws = renameFolder(ws, 'a', 'Renamed', 5);
  assert.equal(ws.folders.a.name, 'Renamed');
  assert.equal(ws.folders.a.updatedAt, 5);
  ws = updateFolder(ws, 'a', { color: '#f00', icon: '★' }, 6);
  assert.equal(ws.folders.a.color, '#f00');
  assert.equal(ws.folders.a.icon, '★');
  assert.equal(renameFolder(ws, 'nope', 'x'), ws, 'unknown id is a no-op returning same ref');
});

test('fileItem is idempotent and multi-file puts one item in several folders', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'F1', id: 'f1' });
  ws = createFolder(ws, { name: 'F2', id: 'f2' });
  const k = refKey('source', 'https://x/y');
  ws = fileItem(ws, k, 'f1');
  const same = fileItem(ws, k, 'f1');
  assert.equal(same, ws, 'filing the same item twice is a no-op');
  ws = fileItem(ws, k, 'f2');
  assert.deepEqual(foldersOf(ws, k).sort(), ['f1', 'f2']);
  assert.deepEqual(itemsIn(ws, 'f1'), [k]);
  assert.equal(fileItem(ws, k, 'ghost'), ws, 'filing into a missing folder is a no-op');
});

test('unfileItem removes membership and prunes empty lists', () => {
  let ws = createFolder(emptyWorkspace(), { name: 'F', id: 'f' });
  const k = refKey('chat', 'c1');
  ws = fileItem(ws, k, 'f');
  ws = unfileItem(ws, k, 'f');
  assert.deepEqual(itemsIn(ws, 'f'), []);
  assert.equal(ws.members.f, undefined, 'empty member list is pruned');
  assert.equal(foldersOf(ws, k).length, 0);
});

test('moveItem = unfile-then-file across folders', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'A', id: 'a' });
  ws = createFolder(ws, { name: 'B', id: 'b' });
  const k = refKey('doc', 'd1');
  ws = fileItem(ws, k, 'a');
  ws = moveItem(ws, k, 'a', 'b');
  assert.deepEqual(foldersOf(ws, k), ['b']);
});

test('deleteFolder lifts children to the grandparent and drops its members', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'root', id: 'r' });
  ws = createFolder(ws, { name: 'mid', id: 'm', parentId: 'r' });
  ws = createFolder(ws, { name: 'leaf', id: 'l', parentId: 'm' });
  const only = refKey('source', 'u-only');
  const shared = refKey('source', 'u-shared');
  ws = fileItem(ws, only, 'm');
  ws = fileItem(ws, shared, 'm');
  ws = fileItem(ws, shared, 'r');
  ws = deleteFolder(ws, 'm');
  assert.equal(ws.folders.m, undefined);
  assert.equal(ws.folders.l.parentId, 'r', 'grandchild re-parented to grandparent');
  assert.equal(ws.members.m, undefined, 'deleted folder members dropped');
  assert.deepEqual(foldersOf(ws, only), [], 'item filed only there becomes unfiled');
  assert.deepEqual(foldersOf(ws, shared), ['r'], 'item filed elsewhere is untouched');
});

test('moveFolder re-homes a folder but refuses to create a cycle', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'A', id: 'a' });
  ws = createFolder(ws, { name: 'B', id: 'b' });
  ws = createFolder(ws, { name: 'C', id: 'c', parentId: 'a' });
  ws = moveFolder(ws, 'a', 'b');
  assert.equal(ws.folders.a.parentId, 'b');
  // a is now under b, c under a. Moving a into c (its own descendant) must fail.
  const blocked = moveFolder(ws, 'a', 'c');
  assert.equal(blocked, ws, 'cycle-forming move is refused');
  assert.equal(moveFolder(ws, 'a', 'a'), ws, 'move into self is refused');
});

test('unfiled returns live refKeys that are in no folder', () => {
  let ws = createFolder(emptyWorkspace(), { name: 'F', id: 'f' });
  const a = refKey('source', 'a');
  const b = refKey('source', 'b');
  const c = refKey('chat', 'c');
  ws = fileItem(ws, a, 'f');
  assert.deepEqual(unfiled(ws, [a, b, c]).sort(), [b, c].sort());
});

test('buildTree nests, sorts by order, and counts direct members; flatTree pre-orders', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'Zeta', id: 'z', now: 2 });
  ws = createFolder(ws, { name: 'Alpha', id: 'al', now: 1 });
  ws = createFolder(ws, { name: 'kid', id: 'k', parentId: 'al' });
  ws = fileItem(ws, refKey('source', 'x'), 'al');
  const tree = buildTree(ws);
  assert.deepEqual(tree.map((n) => n.folder.id), ['z', 'al'], 'sorted by order');
  const alpha = tree.find((n) => n.folder.id === 'al');
  assert.equal(alpha.count, 1);
  assert.equal(alpha.children[0].folder.id, 'k');
  assert.equal(alpha.children[0].depth, 1);
  assert.deepEqual(flatTree(ws).map((n) => n.folder.id), ['z', 'al', 'k']);
});

test('serialize / deserialize is a faithful round-trip', () => {
  let ws = emptyWorkspace();
  ws = createFolder(ws, { name: 'A', id: 'a', now: 1 });
  ws = createFolder(ws, { name: 'B', id: 'b', parentId: 'a', now: 2 });
  ws = fileItem(ws, refKey('source', 'https://x/y'), 'b');
  const back = deserialize(serialize(ws));
  assert.deepEqual(back, ws);
});

test('deserialize is tolerant of garbage, nulls, and dangling members', () => {
  assert.deepEqual(deserialize('not json'), emptyWorkspace());
  assert.deepEqual(deserialize(null), emptyWorkspace());
  assert.deepEqual(deserialize('{}'), emptyWorkspace());
  // members pointing at a non-existent folder are dropped; folder fields normalized.
  const raw = JSON.stringify({
    folders: { a: { name: 'A' } },
    members: { a: ['source:u', 'source:u', 'source:v'], ghost: ['source:z'] },
  });
  const ws = deserialize(raw);
  assert.equal(ws.folders.a.parentId, null);
  assert.equal(ws.folders.a.order, 0);
  assert.deepEqual(ws.members.a, ['source:u', 'source:v'], 'duplicates removed, order kept');
  assert.equal(ws.members.ghost, undefined, 'dangling member list dropped');
});
