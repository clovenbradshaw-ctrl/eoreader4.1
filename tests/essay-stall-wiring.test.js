import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The stall the screenshot caught: "The essay could not complete: the chat model stalled", with
// nothing streamed. The organ (organs/out/essay.js) heartbeats its two UNSTREAMED decodes — the
// outline plan (before onPlan) and the corrective regen (its tokens are replaced on finalize, never
// painted) — through hooks.onPlanToken / hooks.onPulse. tests/essay-stall-heartbeat.test.js pins the
// organ side. But the heartbeat only keeps the no-progress stall guard armed if the CONSUMER wires
// those hooks to guard.feed(). The reader ships as TWO inlined copies (index.html and
// src/reader/app.dc.js), and the fix originally landed in only one — index.html's essay path fed the
// guard on the streamed hooks but not on onPlanToken/onPulse, so a slow-but-live plan decode over a
// grounded corpus crossed the deadline with zero feeds and tripped. This guard holds the wiring in
// BOTH copies so a future edit to either can't silently drop the heartbeat again.

for (const page of ['index.html', 'src/reader/app.dc.js']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: the essay compose feeds the stall guard on both unstreamed decodes`, () => {
    // The two liveness-only feeds must be wired to guard.feed() — this is the load-bearing fix.
    assert.match(src, /onPlanToken\s*:\s*\(\s*\)\s*=>\s*guard\.feed\(\)/,
      `${page} no longer feeds the stall guard from the outline decode (onPlanToken) — a slow plan will trip it`);
    assert.match(src, /onPulse\s*:\s*\(\s*\)\s*=>\s*guard\.feed\(\)/,
      `${page} no longer feeds the stall guard from the corrective regen (onPulse) — a slow regen will trip it`);
  });

  test(`${page}: the essay stall budget is widened and the walk fails soft, not dead`, () => {
    // Planning a ≥2,500-word essay on a 3B CPU model can be slow to its first token — the essay
    // guard runs at the widened 90s budget, not the default.
    assert.match(src, /_stallGuard\(90000\)/,
      `${page} no longer runs the essay at the widened 90s stall budget`);
    // A stall with nothing streamed degrades to the reading's own structural answer rather than
    // dead-ending on the bare failure — the fail-soft note the answer path already carries.
    assert.match(src, /Answered from your reading — /,
      `${page} no longer fails the essay soft into the reading's structural answer on a stall`);
  });
}
