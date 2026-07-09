import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  foldGraph, nodeLabel, recordsOf, edgeDataStr, connectionsOf,
  tableEvent, nodeEvents, edgeTypeEvent, edgeEvents, edgeDeleteEvent,
  seedEvents, serialize, deserialize,
} from '../src/workspace/relationships.js';

// The typed-edge database is a pure fold of an append-only log: records fold in,
// edges carry their own fields, a retraction removes a connection, and a
// round-trip through storage loses nothing. These pin all of that off-DOM.

test('foldGraph builds tables, records, edge-types, and data-carrying edges', () => {
  const g = foldGraph(seedEvents());
  assert.deepEqual(g.tableList.map((t) => t.id).sort(), ['metros', 'operators']);
  assert.equal(recordsOf(g, 'metros').length, 6);
  assert.equal(recordsOf(g, 'operators').length, 6);
  assert.equal(g.etypeList.length, 2);
  assert.equal(g.edges.length, 8, '6 operated_by + 2 benchmarks');
  const sing = g.edges.find((e) => e.id === 'edge/op-sing');
  assert.equal(sing.v.since, 1987);
  assert.equal(sing.v.model, 'Regulated concession');
});

test('nodeLabel resolves name, then city, then falls back to id', () => {
  const g = foldGraph(seedEvents());
  assert.equal(nodeLabel(g, 'operator/lta'), 'Land Transport Authority');
  assert.equal(nodeLabel(g, 'metro/singapore'), 'Singapore');
  assert.equal(nodeLabel(g, 'metro/ghost'), 'metro/ghost');
});

test('edgeDataStr renders the edge fields in schema order', () => {
  const g = foldGraph(seedEvents());
  const sing = g.edges.find((e) => e.id === 'edge/op-sing');
  assert.equal(edgeDataStr(g, sing), 'Since 1987 · Ownership model Regulated concession');
});

test('connectionsOf lists both endpoints with type + data', () => {
  const g = foldGraph(seedEvents());
  const conns = connectionsOf(g, 'metro/singapore');
  assert.equal(conns.length, 1);
  assert.equal(conns[0].otherLabel, 'Land Transport Authority');
  assert.equal(conns[0].typeName, 'operated by');
  assert.equal(conns[0].data, 'Since 1987 · Ownership model Regulated concession');
  // Tokyo touches an operator AND a benchmark edge → two connections.
  assert.equal(connectionsOf(g, 'metro/tokyo').length, 2);
});

test('edgeEvents adds a typed connection; edgeDeleteEvent retracts it', () => {
  const events = [
    tableEvent('a', 'A'), tableEvent('b', 'B'),
    ...nodeEvents('a/1', 'a', { name: 'One' }),
    ...nodeEvents('b/1', 'b', { name: 'Two' }),
    edgeTypeEvent('rel', 'relates to', 'a', 'b', '#123', [{ field: 'since', name: 'Since', type: 'year' }]),
    ...edgeEvents('e1', 'rel', 'a/1', 'b/1', { since: 2020 }),
  ];
  let g = foldGraph(events);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].v.since, 2020);
  g = foldGraph([...events, edgeDeleteEvent('e1')]);
  assert.equal(g.edges.length, 0, 'retraction removes the edge from the fold');
});

test('edgeEvents drops empty field values', () => {
  const evs = edgeEvents('e1', 'rel', 'a/1', 'b/1', { since: 2020, model: '', note: null });
  assert.deepEqual(evs.filter((e) => e.op === 'DEF').map((e) => e.field), ['since']);
});

test('serialize / deserialize round-trips the log; garbage falls back to seed', () => {
  const events = seedEvents();
  const back = deserialize(serialize(events));
  assert.deepEqual(back, events);
  assert.ok(deserialize('not json').length > 0, 'bad JSON → seed');
  assert.ok(deserialize(null).length > 0, 'null → seed');
  assert.ok(deserialize('{"events":[]}').length > 0, 'empty log → seed');
  // a bare array of events is tolerated too
  assert.equal(deserialize(JSON.stringify(events)).length, events.length);
});
