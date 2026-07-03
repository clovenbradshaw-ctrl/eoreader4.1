import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestCode } from '../src/organs/in/code.js';
import { parseEOT } from '../src/ingest/eot.js';

// A small but representative source file: a module with an import, two top-level
// functions where one calls the other, and a class with a method that extends a base.
const SAMPLE = `
import { helper } from './util/helper.js';
// a leading comment mentioning function fakeOut() that must NOT be extracted
export async function load(url, opts) {
  const data = parse(url);     // calls parse
  return helper(data);
}

function parse(text) {
  return text.trim();
}

export class Widget extends Base {
  render(props) {
    return parse(props);       // method → function call edge
  }
}
`;

const docFor = async () => ingestCode(SAMPLE, { name: 'src/widget.js' });

test('code → EOT is well-formed and lowers with no diagnostics', async () => {
  const doc = await docFor();
  assert.ok(doc.eotText.length > 0, 'emits EOT surface');
  const { diagnostics } = parseEOT(doc.eotText);
  assert.deepEqual(diagnostics, [], 'every emitted line is valid EOT');
  assert.equal(doc.diagnostics.length, 0, 'the lowered doc carries no diagnostics');
});

test('module, functions, class and method are entities', async () => {
  const doc = await docFor();
  const eot = doc.eotText;
  assert.match(eot, /^mod:widget : Module$/m);
  assert.match(eot, /^mod:widget\.lang = typescript$|^mod:widget\.lang = javascript$/m);
  assert.match(eot, /^fn:widget:load : Function$/m);
  assert.match(eot, /^fn:widget:parse : Function$/m);
  assert.match(eot, /^cls:widget:Widget : Class$/m);
  assert.match(eot, /^fn:widget:Widget-render : Method$/m);
});

test('comments and strings are scrubbed — fakeOut is not extracted', async () => {
  const doc = await docFor();
  assert.doesNotMatch(doc.eotText, /fakeOut/);
});

test('relations: import, definedIn, extends, and same-module call edges', async () => {
  const doc = await docFor();
  const eot = doc.eotText;
  assert.match(eot, /^mod:widget -> dep:util-helper : imports$/m);
  assert.match(eot, /^fn:widget:load -> mod:widget : definedIn$/m);
  assert.match(eot, /^cls:widget:Widget -> dep:Base : extends$/m);
  // load() calls parse(); Widget.render() calls parse()
  assert.match(eot, /^fn:widget:load -> fn:widget:parse : calls$/m);
  assert.match(eot, /^fn:widget:Widget-render -> fn:widget:parse : calls$/m);
});

test('the lowered reading is traversable as a graph', async () => {
  const doc = await docFor();
  const g = doc.projectGraph();
  // entities: module + 2 functions + class + method + 1 dep + Base = 7 signs at least
  assert.ok(g.entities.size >= 6, `expected ≥6 entities, got ${g.entities.size}`);
  // the call/membership edges fold into graph relations
  assert.ok((g.relations?.length ?? g.edges?.length ?? 0) > 0, 'graph carries relation edges');
});

test('async / exported / line metadata ride as DEF facts', async () => {
  const doc = await docFor();
  const eot = doc.eotText;
  assert.match(eot, /^fn:widget:load\.async = true$/m);
  assert.match(eot, /^fn:widget:load\.exported = true$/m);
  assert.match(eot, /^fn:widget:load\.line = \d+$/m);
});
