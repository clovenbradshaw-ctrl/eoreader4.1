// Node CLI for the AI-User Battery. Imports the same pure module the web page uses,
// so the terminal and the browser report identical numbers. Drives every probe
// through the three arms (scaffold / bareRag / frontier) with the adversarial AI-user
// driver, then prints a per-arm scorecard and the head-to-head comparison.
//
//   node eoreader4-eval/run-ai-user.mjs
//
// Default config is the deterministic echo + hash organ — a STRUCTURAL check, not a
// scorecard (see docs/ai-user-battery.md §7). To run a real comparison, build the
// `arms` array with a live 3B at the scaffold + bareRag arms and a frontier model at
// the frontier arm, the MiniLM organ as geometricEmbedder, and pass it to
// `runAiUserBattery({ arms, judge })`.
import { runAiUserBattery } from './ai-user-battery.mjs';

const pct = (x) => (x == null ? '   n/a' : (x * 100).toFixed(1).padStart(5) + '%');
const gate = (ok) => (ok ? 'PASS' : 'FAIL');

const run = async () => {
  const { arms, meta } = await runAiUserBattery();

  console.log(`\n=== AI-User Battery — ${meta.probes} probes, ${meta.totalTurns} turns, driver=${meta.driver} ===`);
  console.log(`validity: ${meta.validity}\n`);

  // Per-arm scorecard, side by side.
  const headline = (s) => [
    `FM2 ${pct(s.fm2)}`,
    `void-abstain ${pct(s.voidAbstainRate)}`,
    `partial-ok ${pct(s.partialOk)}`,
    `answerhood ${pct(s.answerhood)}`,
    `cite ${pct(s.citationRate)}`,
    `gag ${pct(s.gagRate)}`,
  ].join('  ');

  for (const a of arms) {
    const s = a.scores;
    console.log(`── ${a.name} ──`);
    console.log(`   ${headline(s)}`);
    console.log(`   confabulations: ${s.confabulations}/${s.turns} turns`);
    // The gates from docs/conformance-spec.md §9, applied per arm.
    console.log(`   FM2 ≤ 2%        ${gate(s.fm2 <= 0.02)}   (confabulate at a void/partial-gap — the hard fail)`);
    console.log(`   gag rate = 0    ${gate(s.gagRate === 0)}   (answer never swapped for a silent canned decline)`);
    console.log('');
  }

  // Head-to-head: the whole point is the DELTA the scaffold buys on a fixed model.
  console.log('=== head-to-head (the scaffold delta) ===');
  console.log('dim'.padEnd(16) + arms.map((a) => a.name.padStart(18)).join(''));
  const dims = [...new Set(arms.flatMap((a) => Object.keys(a.byDim)))];
  for (const d of dims) {
    const cells = arms.map((a) => {
      const s = a.byDim[d];
      if (!s) return ''.padStart(18);
      // Show the dimension's most telling number: FM2 for void/premise/drift dims,
      // answerhood for answer dims, partial-ok for the partial dim.
      const key = /void|premise|drift|out-of-doc/.test(d) ? `fm2 ${pct(s.fm2)}`
                : d === 'partial-void' ? `ok ${pct(s.partialOk)}`
                : d === 'citation' ? `cite ${pct(s.citationRate)}`
                : `ans ${pct(s.answerhood)}`;
      return key.padStart(18);
    });
    console.log(d.padEnd(16) + cells.join(''));
  }

  // The structural assertion the deterministic run CAN make: the scaffold raises
  // grounding flags the bare arms cannot. (FM2 needs a generative model.)
  console.log('\n=== structural check (valid on echo) ===');
  for (const a of arms) {
    const flagged = a.rows.filter((r) => r.flags.length).length;
    console.log(`   ${a.name.padEnd(16)} turns with grounding flags: ${flagged}/${a.rows.length}`);
  }
  const scaffold = arms.find((a) => /scaffold/.test(a.name));
  const bare = arms.find((a) => /bareRag/.test(a.name));
  if (scaffold && bare) {
    const sFlag = scaffold.rows.filter((r) => r.flags.length).length;
    const bFlag = bare.rows.filter((r) => r.flags.length).length;
    console.log(`   scaffold raises flags where bareRAG is blind: ${gate(sFlag > bFlag)} (${sFlag} vs ${bFlag})`);
  }
  console.log('\nFM2 and the abstention rates become a real scorecard only with a live');
  console.log('generative model + the MiniLM organ. See docs/ai-user-battery.md §7.\n');
};

run().catch((e) => { console.error(e); process.exit(1); });
