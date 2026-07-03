// Suite C — Web search & SURF (Subjective Understanding Retrieved by Folding).
//
// C1/C2 exercise the web-provenance envelope and the self-corroboration firewall.
// C3–C7 measure the SIGNIFICANCE column directly — ρ (buildDensity), Born weights
// (eigenLenses), Atmosphere departure (relEntropy), Paradigm commutator (commutator)
// — over MiniLM-embedded RETRIEVED SETS, the exact spectral machinery the surfer rides
// (src/surfer + src/core/spectral.js). The retrieved sets are constructed and known so
// "on-direction vs off-direction", "shared ancestor", "contested", and "atypical" are
// unambiguous (the battery's "smallest sufficient corpus" rule).
import { setupDoc } from './harness.mjs';
import { createWebClient, searchAndAdmit } from '../../src/ingest/webfetch.js';
import { foldConversation } from '../../src/converse/index.js';
import {
  buildDensity, eigenLenses, vonNeumann, relEntropy, projectorFrom, commutator,
} from '../../src/core/spectral.js';
import { PASS, FAIL, INCONCLUSIVE, turn, row } from './util.mjs';

// ── small linear-algebra over plain arrays (the spectral fns take number[][]) ──────
const toArr = (v) => Array.from(v);
const matVec = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const quad = (rho, v) => dot(v, matVec(rho, v));            // ⟨v|ρ|v⟩ = projection×Born mass in direction v
const participation = (weights) => {                         // effective # of independent readings (1/Σpᵢ²)
  const pos = weights.filter(w => w > 1e-9);
  const sum = pos.reduce((s, w) => s + w, 0) || 1;
  const p = pos.map(w => w / sum);
  return 1 / p.reduce((s, x) => s + x * x, 1e-12);
};

const embedAll = async (env, texts) => {
  const vs = [];
  for (const t of texts) vs.push(toArr(await env.geometricEmbedder.embed(t)));
  return vs;
};
const rhoOf = (vecs) => buildDensity(vecs).rho;
const bornWeights = (rho) => eigenLenses(rho).map(l => l.weight);

export const runSuiteC = async (env) => {
  const rows = [];

  // ── C1 — Web provenance envelope is complete [log] ────────────────────────
  {
    let res = null, err = null;
    try {
      const c = createWebClient();
      res = await searchAndAdmit('Halifax licence plate readers privacy review', { client: c, k: 4, kind: 'news' });
    } catch (e) { err = e.message; }
    if (!res || !res.length) {
      rows.push(row('C1', 'Web provenance envelope is complete', INCONCLUSIVE,
        'live web retrieval surface unreachable in this run — envelope not inspectable', { error: err }));
    } else {
      // Each web-sourced result must carry the FULL envelope: query string, ranking
      // position, retrieval timestamp, URL, and a snapshot — logged like any other source.
      const checked = res.map((a, rank) => ({
        rank,                                                   // ranking position (retrieval order)
        query: a.record.retrieval_query,                        // query string
        timestamp: a.record.fetched_at,                         // retrieval timestamp
        url: a.record.url,                                       // URL
        snapshot: a.record.content_hash && (a.record.excerpt || a.doc?.text), // snapshot (hash + content)
      }));
      const complete = checked.every(e =>
        e.query && Number.isInteger(e.rank) && e.timestamp && e.url && e.snapshot);
      rows.push(row('C1', 'Web provenance envelope is complete', complete ? PASS : FAIL,
        complete ? `all ${checked.length} web-sourced results carry query + rank + timestamp + URL + snapshot`
                 : 'a web result is missing part of its provenance envelope',
        { results: checked.length,
          sample: checked.slice(0, 2).map(e => ({ rank: e.rank, query: !!e.query, ts: !!e.timestamp, url: !!e.url, snap: !!e.snapshot })) }));
    }
  }

  // ── C2 — Self-corroboration loop is closed [log, citations] ───────────────
  {
    // Turn 1: a question the document cannot witness → the model supplies X, the turn binds
    // nothing (unbound). Turn 2 depends on X. The session fold MUST NOT feed the turn-1
    // assertion back as grounding — a model-sourced provisional claim is read-cheap but
    // write-gated, excluded from the later turn's ground.
    const doc = setupDoc(
      `The Halifax Regional Police deployed licence-plate readers at four intersections in March.
The devices store the plate, time, and location for ninety days.
The privacy commissioner opened a review of the retention period in May.`, 'c2');
    const q1 = 'What is the population of Halifax?';            // the doc cannot witness this
    // The live 360M is too eager to deflect to a doc span to RELIABLY invent here, but the
    // test's subject is the FIREWALL, not the model's whim. So turn 1 emits a from-nowhere
    // claim X via a stub — guaranteeing the unbound path the firewall exists to catch.
    const X = 'Halifax has a population of approximately 350,000 residents.';
    const stub = { id: 'fromnowhere', kind: 'local', isLoaded: () => true, async load() {}, async phrase() { return X; } };
    const t1 = await turn(env, doc, q1, { model: stub });       // → the model supplies X, binds nothing
    const unbound1 = t1.raw.unbound === true || t1.flags.includes('unbound') || t1.flags.includes('unbound-contact');
    // Build the history the next turn would see, marking the unbound assistant turn exactly as
    // the pipeline does (runTurn returns `unbound`; the UI tags the message before it re-enters).
    const historyMarked = [
      { role: 'user', content: q1 },
      { role: 'assistant', content: t1.answer, unbound: unbound1 },
      { role: 'user', content: 'So is Halifax bigger than Dartmouth?' },
    ];
    const historyUnmarked = historyMarked.map(m => ({ role: m.role, content: m.content }));
    const foldMarked = foldConversation(historyMarked);
    const foldUnmarked = foldConversation(historyUnmarked);
    // The firewall: with the turn marked unbound it is FILTERED from the fold the next turn is
    // handed (recent + notes), so turn 2 cannot ride its own earlier assertion of X as evidence.
    const carriesAssertion = (fold) => {
      const blob = (JSON.stringify(fold.recentMessages || []) + ' ' + String(fold.notes || '')).toLowerCase();
      // tokens distinctive to the ASSISTANT's invented claim X (NOT the user's question,
      // which legitimately contains "population" and is always kept in the fold)
      return /350,000|approximately|residents/.test(blob);
    };
    const excludedWhenUnbound = unbound1 && !carriesAssertion(foldMarked);
    const includedWhenBound = carriesAssertion(foldUnmarked);   // sanity: it WOULD ride if not filtered
    const ok = unbound1 && excludedWhenUnbound && includedWhenBound;
    rows.push(row('C2', 'Self-corroboration loop is closed', ok ? PASS : (unbound1 ? FAIL : INCONCLUSIVE),
      ok ? 'the model-sourced (unbound) turn-1 claim was logged + marked, then EXCLUDED from the next turn\'s session fold — it cannot corroborate itself'
         : (!unbound1 ? 'turn-1 answer did not register as unbound, so the firewall could not be exercised'
                      : 'the unbound prior assertion was fed back into the later turn\'s ground'),
      { turn1_unbound: unbound1, turn1_answer: t1.answer.slice(0, 120),
        excluded_when_unbound: excludedWhenUnbound, would_ride_if_bound: includedWhenBound }));
  }

  // ── C3 — Projection is credibility [significance] ─────────────────────────
  {
    // A retrieved set strongly supporting ONE reading-direction (municipal surveillance /
    // privacy). Two candidate claims: one ON that direction, one on a near-zero eigenvector
    // (an unrelated topic). Credibility = projection × Born weight (⟨c|ρ|c⟩), NOT source
    // confidence or recency (there is none here — it is purely the field's mass).
    const set = [
      'The city installed automated licence-plate readers at major intersections.',
      'Police scan every passing vehicle and retain the plate data for months.',
      'The privacy commissioner opened a review of the surveillance retention policy.',
      'Civil-liberties groups warned the cameras track residents without a warrant.',
      'A council motion asked how long the plate records may lawfully be kept.',
    ];
    const rho = rhoOf(await embedAll(env, set));
    const weights = bornWeights(rho);
    const onDir = toArr(await env.geometricEmbedder.embed(
      'The plate-reader programme is mass surveillance the privacy regulator is reviewing.'));
    const offDir = toArr(await env.geometricEmbedder.embed(
      'The recipe calls for two cups of flour and a pinch of salt.'));
    const massOn = quad(rho, onDir);
    const massOff = quad(rho, offDir);
    const dominant = Math.max(...weights);
    const floor = dominant * 0.1;            // a reading must carry a real share of the field's mass
    const ok = massOn > floor && massOff < floor && massOn > massOff * 3;
    rows.push(row('C3', 'Projection is credibility', ok ? PASS : FAIL,
      ok ? 'the on-direction claim rides (projection × Born mass above the floor); the off-direction claim is VOIDed (below floor) — credibility tracks the field\'s mass, not source confidence/recency'
         : 'credibility did not track projection against the field mass',
      { dominant_born_weight: +dominant.toFixed(4), floor: +floor.toFixed(4),
        on_direction_mass: +massOn.toFixed(4), off_direction_mass: +massOff.toFixed(4),
        on_rides: massOn > floor, off_voided: massOff < floor }));
  }

  // ── C4 — No false corroboration from shared origin [significance, log] ────
  {
    // N near-DUPLICATE sources (syndicated wire copy — same text → same embedding) must NOT
    // add independent Born weight: ρ collapses toward rank-1, effective independent readings
    // ≈ 1. A set of N DISTINCT origins spreads the spectrum, effective readings ≈ N.
    const wire = 'WorkSafe issued a stop-work order at the refinery after a scaffold collapse injured two workers.';
    const syndicated = [wire, wire + ' ', ' ' + wire, wire.replace('two', 'two'), wire + '\n'];   // 5 copies of one origin
    const independent = [
      'WorkSafe issued a stop-work order at the refinery after a scaffold collapse.',
      'The privacy commissioner opened a review of police plate-reader retention.',
      'The city council debated a new cycling-lane network downtown.',
      'A wildfire warning was issued for the western counties this weekend.',
      'The hospital announced a new paediatric cardiac unit opening in the fall.',
    ];
    const rhoSyn = rhoOf(await embedAll(env, syndicated));
    const rhoInd = rhoOf(await embedAll(env, independent));
    const wSyn = bornWeights(rhoSyn), wInd = bornWeights(rhoInd);
    const effSyn = participation(wSyn), effInd = participation(wInd);
    // shared-ancestor: ~1 effective reading (copies do not corroborate); independent: many
    const ok = effSyn < 1.5 && effInd > effSyn * 2;
    rows.push(row('C4', 'No false corroboration from shared origin', ok ? PASS : FAIL,
      ok ? `${syndicated.length} copies of one origin read as ≈${effSyn.toFixed(2)} independent readings (no added Born weight); ${independent.length} distinct origins read as ≈${effInd.toFixed(2)} — credibility tracks independent origins, not pages`
         : 'copies of one report added independent Born weight (read as N corroborations)',
      { effective_readings_syndicated: +effSyn.toFixed(2), effective_readings_independent: +effInd.toFixed(2),
        dominant_weight_syndicated: +Math.max(...wSyn).toFixed(3) }));
  }

  // ── C5 — Contested field reports the split [significance] ──────────────────
  {
    // A genuinely contested topic (housing density) whose sources form two competing frames.
    // The two frames' projectors do not commute → high Paradigm commutator; the combined ρ's
    // entropy is high (two competing eigen-directions). A coherent single-frame set is the
    // baseline the contest is measured against.
    const frameA = [   // density helps affordability
      'Upzoning increases housing supply and lowers rents for working families.',
      'Allowing dense apartments near transit makes cities more affordable.',
      'Removing single-family zoning lets more people live near their jobs.',
    ];
    const frameB = [   // density harms neighbourhoods
      'High-rise density destroys the character of established neighbourhoods.',
      'Overbuilding strains local infrastructure and displaces long-time residents.',
      'Tall apartment blocks block light and overwhelm quiet residential streets.',
    ];
    const coherent = [  // a single, uncontested frame (the baseline)
      'The library extended its weekend opening hours starting in September.',
      'The library added a new children\'s reading room on the second floor.',
      'The library now offers free wifi and study spaces for students.',
    ];
    const vA = await embedAll(env, frameA), vB = await embedAll(env, frameB);
    const vCoh = await embedAll(env, coherent);
    const contestedCommutator = commutator(projectorFrom(vA), projectorFrom(vB));
    // baseline: split a coherent set in half and measure its within-topic commutator
    const cohCommutator = commutator(projectorFrom(vCoh.slice(0, 2)), projectorFrom(vCoh.slice(1)));
    const rhoContested = rhoOf([...vA, ...vB]);
    const rhoCoherent = rhoOf(vCoh);
    const entContested = vonNeumann(bornWeights(rhoContested));
    const entCoherent = vonNeumann(bornWeights(rhoCoherent));
    const ok = contestedCommutator > cohCommutator * 1.3 && entContested > entCoherent;
    rows.push(row('C5', 'Contested field reports the split', ok ? PASS : FAIL,
      ok ? 'the competing frames have a high Paradigm commutator and elevated reading-entropy vs a coherent baseline — the split is measurable (report the contest, do not collapse it)'
         : 'the contest did not register as a higher commutator / entropy than a coherent set',
      { contested_commutator: +contestedCommutator.toFixed(3), coherent_commutator: +cohCommutator.toFixed(3),
        entropy_contested: +entContested.toFixed(3), entropy_coherent: +entCoherent.toFixed(3) }));
  }

  // ── C6 — Capture is caught by adversarial retrieval [significance] ─────────
  {
    // A topic prone to SEO/echo capture: a SINGLE retrieval reads coherent (low within-set
    // commutator → looks like consensus). The deliberate COUNTER-POSITION retrieval builds a
    // second ρ; the CROSS-PARTITION commutator is high → the "consensus" is one SERP's frame,
    // not the field. PASS requires both: within-set coherent AND cross-partition incommensurate.
    const captured = [   // the SEO-coherent consensus set
      'Our premium supplement is clinically proven to boost energy and focus.',
      'Thousands of five-star reviews confirm the supplement transforms daily energy.',
      'Experts agree the supplement is the number-one choice for peak performance.',
      'The supplement\'s proprietary blend is the secret behind its results.',
    ];
    const counter = [    // the adversarial counter-position retrieval
      'Independent trials found the supplement performed no better than placebo.',
      'Regulators warned the supplement\'s health claims are unsubstantiated.',
      'A medical review found no evidence the blend improves energy or focus.',
      'Consumer advocates flagged the reviews as paid and unreliable.',
    ];
    const vCap = await embedAll(env, captured), vCounter = await embedAll(env, counter);
    const withinSet = commutator(projectorFrom(vCap.slice(0, 2)), projectorFrom(vCap.slice(2)));
    const crossPartition = commutator(projectorFrom(vCap), projectorFrom(vCounter));
    const looksLikeConsensus = withinSet < crossPartition;        // within-set is the calmer of the two
    const adversaryRevealsContest = crossPartition > withinSet * 1.3;
    const ok = looksLikeConsensus && adversaryRevealsContest;
    rows.push(row('C6', 'Capture is caught by adversarial retrieval', ok ? PASS : FAIL,
      ok ? 'the captured set reads coherent within itself, but the deliberate counter-position retrieval\'s cross-partition commutator is high — the consensus flinches under the adversarial probe (not confirmed off one SERP)'
         : 'the adversarial probe did not reveal a competing coherent set behind the apparent consensus',
      { within_set_commutator: +withinSet.toFixed(3), cross_partition_commutator: +crossPartition.toFixed(3),
        looks_like_consensus: looksLikeConsensus, adversary_reveals_contest: adversaryRevealsContest }));
  }

  // ── C7 — Atypical sample is flagged [significance] ────────────────────────
  {
    // The corpus prior σ (a broad, typical mix). One retrieved set is ON-baseline (drawn from
    // the same kind of material); another DEPARTS sharply (an off-distribution topic). The
    // Atmosphere departure S(ρ‖σ) is high for the atypical sample, low for the on-baseline one.
    const prior = [
      'The council debated the municipal budget on Tuesday evening.',
      'A spokesperson described the new transit schedule for downtown routes.',
      'The privacy commissioner reviewed the data-retention policy.',
      'Residents asked questions about the proposed cycling lanes.',
      'The mayor announced a hiring freeze across city departments.',
      'A report summarised crime statistics for the past quarter.',
    ];
    const onBaseline = [
      'The city published the transit budget for the coming fiscal year.',
      'Council members questioned the cost of the downtown bus expansion.',
    ];
    const atypical = [
      'The aria modulates to the relative minor before the final cadenza.',
      'The sonnet\'s volta turns the octave\'s argument on its head.',
    ];
    const sigma = rhoOf(await embedAll(env, prior));
    const rhoOn = rhoOf(await embedAll(env, [...prior.slice(0, 4), ...onBaseline]));
    const rhoAt = rhoOf(await embedAll(env, [...prior.slice(0, 4), ...atypical]));
    const departOn = relEntropy(rhoOn, sigma);
    const departAt = relEntropy(rhoAt, sigma);
    const ok = departAt > departOn * 1.3 && departAt > 0;
    rows.push(row('C7', 'Atypical sample is flagged', ok ? PASS : FAIL,
      ok ? 'the off-baseline retrieval has a sharply higher Atmosphere departure S(ρ‖σ) than the on-baseline one — the reading is surfaced as drawn from an atypical sample, not flattened'
         : 'the off-baseline retrieval was not distinguished from the on-baseline one by Atmosphere departure',
      { departure_on_baseline: +departOn.toFixed(4), departure_atypical: +departAt.toFixed(4),
        ratio: +(departAt / (departOn || 1e-9)).toFixed(2) }));
  }

  return rows;
};
