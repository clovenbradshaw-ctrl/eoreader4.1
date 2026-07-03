import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';
import {
  limn, selectScope, synthesizeSpec, checkGrounding,
  layout, render, emitRender, validateSpec, viewSpecSchema, specHash,
} from '../src/organs/out/limner/index.js';

// A small synthetic document log: three figures admitted (INS), bound by two
// relations (CON), plus a carved absence (a void) — enough to exercise every
// kind. Built directly on the append-only log, the same shape ingestion emits.
const buildLog = () => {
  const log = createLog({ docId: 'limner-test' });
  log.append({ op: 'INS', id: 'alice', label: 'Alice', sentIdx: 0 });
  log.append({ op: 'INS', id: 'bob',   label: 'Bob',   sentIdx: 1 });
  log.append({ op: 'INS', id: 'carol', label: 'Carol', sentIdx: 2 });
  log.append({ op: 'INS', id: 'alice', label: 'Alice', sentIdx: 3 }); // a second sighting
  log.append({ op: 'CON', src: 'alice', tgt: 'bob',   via: 'knows', sentIdx: 1 });
  log.append({ op: 'CON', src: 'bob',   tgt: 'carol', via: 'trusts', sentIdx: 2 });
  log.append({ op: 'CON', src: 'alice', tgt: 'carol', via: 'employs', sentIdx: 3 });
  log.append({ op: 'DEF', kind: 'void', node: 'carol', rel: 'spouse', sentIdx: 2 });
  return log;
};

const docFor = () => {
  const log = buildLog();
  return { docId: 'limner-test', log, projectGraph: (frame = {}) => projectGraph(log, frame) };
};

test('SEG: selectScope narrows the graph and exposes the ref set', () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  assert.equal(sub.nodes.length, 3, 'three figures admitted');
  assert.ok(sub.refSet.has('alice') && sub.refSet.has('bob') && sub.refSet.has('carol'));
  assert.equal(sub.edges.length, 3, 'three CON edges kept');
  assert.equal(sub.voids.length, 1, 'one carved absence kept');
  // Most-sighted first: alice (2 sightings) leads.
  assert.equal(sub.nodes[0].id, 'alice');
});

test('SEG: focus keeps a node and its neighbours', () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), { focus: 'bob' });
  const ids = new Set(sub.nodes.map(n => n.id));
  assert.ok(ids.has('bob') && ids.has('alice') && ids.has('carol'), 'bob + neighbours present');
});

test('SIG: synthesized spec is grounded by construction — every ref resolves', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  assert.equal(spec.kind, 'graph');
  // Every node ref is a real entity id in the subgraph.
  for (const n of spec.nodes) assert.ok(sub.refSet.has(n.ref), `ref ${n.ref} resolves`);
  // Operators ride through verbatim — CON edges report CON.
  assert.ok(spec.edges.every(e => e.operator === 'CON'));
  // No structural problems against the dynamic ref enum.
  assert.deepEqual(validateSpec(spec, { refEnum: [...sub.refSet] }), []);
});

test('grounding: a forged ref is vetoed and stripped', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  // Inject an illegal node referencing something outside the subgraph.
  const forged = { ...spec, nodes: [...spec.nodes, { id: 'nX', ref: 'r#ghost', label: 'Ghost', salience: 0.5, role: 'concept' }] };
  const report = checkGrounding(forged, sub);
  assert.equal(report.ok, false);
  assert.ok(report.fired.some(f => f.ref === 'r#ghost'));
});

test('grounding: label-support hook strips an unsupported label', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  // A checkLabel that rejects everything → every label flagged for strip.
  const report = checkGrounding(spec, sub, { checkLabel: () => false });
  assert.equal(report.ok, false);
  assert.equal(report.stripped.length, spec.nodes.filter(n => n.label).length);
});

test('layout is deterministic and within bounds for every kind', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  for (const kind of ['graph', 'timeline', 'void_map', 'path']) {
    const spec = await synthesizeSpec(sub, { kind });
    const g1 = layout(spec, {});
    const g2 = layout(spec, {});
    assert.deepEqual(g1, g2, `${kind} layout is a pure function`);
    for (const n of g1.nodes) {
      assert.ok(n.x >= 0 && n.x <= g1.width, `${kind} node x in bounds`);
      assert.ok(n.y >= 0 && n.y <= g1.height, `${kind} node y in bounds`);
    }
  }
});

test('graph force vs layered hint pick different engines, both deterministic', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const force = await synthesizeSpec(sub, { kind: 'graph', layoutHint: 'force' });
  const layered = await synthesizeSpec(sub, { kind: 'graph', layoutHint: 'layered' });
  const gf = layout(force, {});
  const gl = layout(layered, {});
  // Different engines → generally different coordinates for the same nodes.
  assert.notDeepEqual(gf.nodes.map(n => [n.x, n.y]), gl.nodes.map(n => [n.x, n.y]));
});

test('render is byte-stable and well-formed SVG', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  const geom = layout(spec, {});
  const a = render(geom, {});
  const b = render(geom, {});
  assert.equal(a, b, 'same geometry → byte-identical SVG');
  assert.match(a, /^<svg /);
  assert.match(a, /<\/svg>$/);
  // Each figure's label appears (full text lives in <title>).
  assert.ok(a.includes('Alice') && a.includes('Bob') && a.includes('Carol'));
});

test('void_map renders a frontier hull from the carved absence', async () => {
  const doc = docFor();
  // Need ≥3 voids for a hull; add two more to the log.
  doc.log.append({ op: 'DEF', kind: 'void', node: 'alice', rel: 'pet', sentIdx: 0 });
  doc.log.append({ op: 'DEF', kind: 'void', node: 'bob', rel: 'title', sentIdx: 1 });
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'void_map' });
  assert.ok(spec.nodes.some(n => n.role === 'void'), 'void nodes present');
  const geom = layout(spec, {});
  assert.ok(geom.regions.length >= 1, 'a frontier region was laid out');
  const svg = render(geom, {});
  assert.ok(svg.includes('limner-frontier'), 'frontier outline drawn');
});

test('INS: emitRender logs exactly one view event with content addresses', async () => {
  const doc = docFor();
  const before = doc.log.length;
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  const geom = layout(spec, {});
  const svg = render(geom, {});
  const { eventId, spec_hash, render_hash } = emitRender(doc.log, spec, svg, {});
  assert.equal(doc.log.length, before + 1, 'one event appended');
  const ev = doc.log.events[eventId];
  assert.equal(ev.op, 'INS');
  assert.equal(ev.kind, 'view');
  assert.equal(ev.resolution.render_hash, render_hash);
  assert.equal(ev.resolution.spec_hash, spec_hash);
  assert.match(render_hash, /^fnv:/);
});

test('the view INS does NOT pollute the document graph', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  const svg = render(layout(spec, {}), {});
  emitRender(doc.log, spec, svg, {});
  // Re-project after logging the render: still exactly three figures, no phantom.
  const g2 = projectGraph(doc.log, {});
  assert.equal(g2.entities.size, 3, 'no view node leaked into the graph');
});

test('limn() end-to-end: deterministic SVG + one INS, vetoed null', async () => {
  const doc = docFor();
  const r1 = await limn({ doc, kind: 'graph' });
  assert.match(r1.svg, /^<svg /);
  assert.equal(r1.vetoed, null, 'projector output is grounded by construction');
  assert.equal(typeof r1.eventId, 'number');
  assert.ok(r1.spec.view_id && r1.spec.source.snapshot_hash, 'host stamped provenance');

  // Same doc/cursor → same view_id and byte-identical SVG (a stable content address).
  const doc2 = docFor();
  const r2 = await limn({ doc: doc2, kind: 'graph' });
  assert.equal(r1.svg, r2.svg, 'render is reproducible across logs');
  assert.equal(r1.spec.view_id, r2.spec.view_id);
});

test('viewSpecSchema binds the ref enum (Level-2 grounding seam)', () => {
  const schema = viewSpecSchema({ refEnum: ['alice', 'bob'] });
  assert.deepEqual(schema.properties.nodes.items.properties.ref.enum, ['alice', 'bob']);
  // Without an enum the ref is a free string (Level-1 schema validity only).
  const open = viewSpecSchema({});
  assert.equal(open.properties.nodes.items.properties.ref.enum, undefined);
});

test('headless render (no log) still returns content addresses', async () => {
  const doc = docFor();
  const sub = selectScope(doc.projectGraph({}), {});
  const spec = await synthesizeSpec(sub, { kind: 'graph' });
  const svg = render(layout(spec, {}), {});
  const out = emitRender(null, spec, svg, {});
  assert.equal(out.eventId, null);
  assert.match(out.render_hash, /^fnv:/);
});
