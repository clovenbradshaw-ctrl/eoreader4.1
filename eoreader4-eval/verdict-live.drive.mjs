// verdict-live.drive.mjs — the two classifiers (fold/verdict.js) against a LIVE local
// model (no CDN, no browser).
//
//   npm run verdict:drive
//
// The unit suite (tests/verdict.test.js) exercises the classifiers over synthetic
// successor streams; this drive runs the whole live path once, end to end:
//
//   1. a REAL document with a real contradiction → detectTensions mints the held
//      eo:Tension through the actual parser (no hand-built structure);
//   2. deep reading + seeded reflections → enacted EVAs, the reading holding the
//      contested referent (the successor stream's Relate touches);
//   3. connect() with the LIVE MiniLM meaning organ → the Born-gated echo, plus the
//      bears-on CON that touches the tension BY ITS OWN ID;
//   4. classifyTensions → the successor-mode verdict + EVA-row fates over that
//      live-gated stream; routeSubstrate → the sayability partition.
//
// The honest expectation: every verdict here is SUSTAINED. Nothing in the reading
// spends a tension — sustain is the substrate's default, and the spends (sarcasm ·
// sublation · metaphor …) are covered per-fate by the unit suite. What the live run
// proves is the wiring: a tension minted from raw text, held again by enacted EVAs,
// juxtaposed by a connection the live model's substrate pass produced, and routed
// narrate-only — with the firewall intact on every deposited act.

import { parseText } from '../src/perceiver/parse/index.js';
import { structureSurface } from '../src/perceiver/index.js';
import { surfFold } from '../src/surfer/index.js';
import { canWitness } from '../src/core/index.js';
import {
  createDeepReader, buildReflection, connect,
  buildSubstrate, readReflections, readConnections,
  classifyTensions, routeSubstrate,
} from '../src/fold/index.js';
import { createMiniLM } from './mechanics/harness.mjs';

const log = (...a) => console.log(...a);
const rule = (s) => log('\n' + s + '\n' + '─'.repeat(s.length));

// A document that holds two readings of one referent — the competing-fills shape the
// Significance face keeps open. The copular pair is the pattern the parser's DEF
// heuristics admit, so the tension below comes from the real pipeline, not a fixture.
const TEXT =
  'Gregor Samsa was a traveling salesman. He supported the family with his wages. ' +
  'Gregor was a monstrous insect. The family did not enter the room. ' +
  'Grete fed the creature, then fed it less. In the end the door stayed locked.';

const main = async () => {
  rule('VERDICT · live run (MiniLM meaning organ, q8, cpu)');
  const embedder = await createMiniLM({ onProgress: (m) => process.stderr.write(`  · ${m}\n`) });
  log(`embedder: ${embedder.model} · measuresMeaning=${embedder.measuresMeaning}`);

  const doc = parseText(TEXT, { docId: 'verdict-live', genderCoref: true });

  // ── the tension, minted from raw text ──────────────────────────────────────────
  rule('TENSION · detectTensions over the real parse');
  const idxs = (doc.units || doc.sentences).map((_, i) => i);
  const structure = structureSurface(doc, idxs);

  // ── the reading holds the referent — deep reading, then two seeded EVAs ────────
  // The deep reader deposits wherever ITS interest peaks; the seeded pair (the same
  // holding, twice, in different words) makes the drive deterministic and gives the
  // live organ a real paraphrase to gate — exactly weave-demo's probe pattern.
  const deep = createDeepReader({ doc, surf: surfFold }).arrive({ anchor: 0 });
  log(`deep reading deposited ${deep.reflections.length} reflection(s) of its own`);
  // The seeded field mirrors weave-demo's probe: one real paraphrase pair on the
  // contested referent, plus unrelated reflections. The unrelated ones matter — the
  // Born null derives from the field's OWN cosines, so a field that is all one topic
  // holds every echo (measured: the pair at 0.839 held under a 0.871 null in a
  // Gregor-only field). A mixed field is the realistic case, and there the pair
  // stands out from the noise the way a genuine same-thought should.
  const seed = [
    { cursor: 0, focus: 'Gregor Samsa', verdict: 'strain', body: 'the document holds Gregor as a salesman and as an insect at once' },
    { cursor: 2, focus: 'Gregor Samsa', verdict: 'strain', body: 'the text keeps Gregor as both a salesman and an insect at the same time' },   // paraphrase
    { cursor: 4, focus: 'Grete', verdict: 'confirm', body: 'the sister feeds him and then feeds him less' },                                     // distractors —
    { cursor: 3, focus: 'the lodgers', verdict: 'confirm', body: 'the lodgers demand hot dinners and clean linen' },                             //   unrelated
    { cursor: 5, focus: 'the window', verdict: 'confirm', body: 'rain streaks the window over the hospital across the street' },                 //   unrelated
  ];
  for (const s of seed) doc.log.append(buildReflection(s));

  const substrate = buildSubstrate({ structure, reflections: readReflections(doc) });
  for (const t of substrate.tensions) log(`  ${t.id} [${t.kind}] ${t.label}`);

  // ── the live half: Born-gated echo + the bears-on that touches the tension ─────
  rule('CONNECT · the live organ gates the echo; bears-on touches the tension by id');
  const woven = await connect(doc, { embedder, substrate, alpha: 0.05 });
  log(`embedder live: ${woven.live} · ${woven.items} reflections compared`);
  for (const c of woven.connections) {
    const tail = c.kind === 'echo' ? `sim ${c.sameness} > null ${c.boundary}` : `→ ${c.b}`;
    log(`  · [${c.kind}] ${tail}\n      ${c.body}`);
  }

  // ── the verdict: successor mode over the enacted stream ────────────────────────
  rule('VERDICT · classifyTensions over the enacted successors');
  const successors = [...readReflections(doc), ...readConnections(doc)];
  log(`${successors.length} enacted successors (EVA reflections + CON connections)\n`);
  const verdicts = classifyTensions(substrate, successors);
  for (const v of verdicts) {
    log(`  ${v.tension} [${v.kind}] → ${v.verdict.toUpperCase()} (fate: ${v.fate})`);
    log(`    trajectory: ${v.trajectory.map((m) => `${m.op}:${m.fate}`).join(' → ') || '(untouched)'}`);
  }

  // ── the router: what may be phrased, what must be handed over marked ───────────
  rule('ROUTER · routeSubstrate (verbalizable vs narrate-only)');
  const routed = routeSubstrate(substrate);
  log(`${routed.verbalizable.length} verbalizable · ${routed.narrateOnly.length} narrate-only`);
  for (const n of routed.narrateOnly) log(`  narrate-only: ${n.group}/${n.id} — ${n.reason}`);

  // ── the firewall: every deposited act is reafference, held void ────────────────
  rule('FIREWALL · every deposited act cannot witness');
  let checked = 0, breached = 0;
  for (const e of [...readReflections(doc), ...readConnections(doc)]) {
    checked++;
    if (canWitness(e.prov) !== false || e.band !== 'void') breached++;
  }
  log(`  ${checked} acts checked · ${breached} breaches — ${breached === 0 ? 'FIREWALL HOLDS ✓' : 'FIREWALL BREACHED ✗'}`);

  // ── the gate ────────────────────────────────────────────────────────────────────
  const tension = verdicts.find((v) => v.kind === 'competing-fills');
  const echoed = woven.connections.some((c) => c.kind === 'echo');
  const bearsOn = tension?.trajectory.some((m) => m.op === 'CON' && m.fate === 'juxtaposed');
  const heldAgain = tension?.trajectory.some((m) => m.op === 'EVA' && m.fate === 'irony');
  const sustained = tension?.verdict === 'sustained';
  const routedHeld = routed.narrateOnly.some((n) => n.group === 'tensions');

  log(`\n  tension minted from raw text: ${tension ? 'YES ✓' : 'no'}`);
  log(`  organ live + echo cleared the Born null: ${woven.live && echoed ? 'YES ✓' : 'no'}`);
  log(`  held again by an enacted EVA (irony): ${heldAgain ? 'YES ✓' : 'no'}`);
  log(`  touched by a CON on its own id (juxtaposed): ${bearsOn ? 'YES ✓' : 'no'}`);
  log(`  current verdict sustained — nothing spends it: ${sustained ? 'YES ✓' : 'no'}`);
  log(`  router holds the tension narrate-only: ${routedHeld ? 'YES ✓' : 'no'}`);

  const ok = !!tension && woven.live && echoed && heldAgain && !!bearsOn && sustained && routedHeld && breached === 0;
  log(`\n${ok ? '✓ live verdict run OK' : '✗ something is off — see above'}`);
  process.exit(ok ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
