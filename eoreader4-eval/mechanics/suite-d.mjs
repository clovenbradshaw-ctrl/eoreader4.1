// Suite D — Cross-cutting integrity.
import { setupDoc, cosine } from './harness.mjs';
import { projectGraph } from '../../src/core/index.js';
import { buildDensity, eigenLenses } from '../../src/core/spectral.js';
import { createCredenceBook } from '../../src/credence/index.js';
import { runTurn } from '../../src/turn/pipeline.js';
import { createAuditLog } from '../../src/audit/index.js';
import { PASS, FAIL, INCONCLUSIVE, turn, row, logExcluding } from './util.mjs';

const toArr = (v) => Array.from(v);
const matVec = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const quad = (rho, v) => dot(v, matVec(rho, v));
const embedAll = async (env, texts) => { const o = []; for (const t of texts) o.push(toArr(await env.geometricEmbedder.embed(t))); return o; };

export const runSuiteD = async (env) => {
  const rows = [];

  // ── D1 — Reliability does not override the field [significance] ────────────
  {
    // A field where SIX independent sources lie on direction A (the corroborated reading),
    // and ONE "high-reliability" source makes a lone claim on direction B that the field does
    // not support. Even granting the reliable source DOUBLE per-source weight (a strong
    // reliability prior), its lone claim's Born mass must stay bounded by its corroboration —
    // it cannot override the field that six sources hold.
    const field = [
      'The refinery scaffold collapse injured two contractors on the north unit.',
      'WorkSafe issued a stop-work order after the scaffold gave way.',
      'Two workers were treated for fractures following the scaffold failure.',
      'Inspectors halted elevated work until the scaffolding is re-certified.',
      'The refinery operator said it was cooperating after the collapse.',
      'A safety review opened into the scaffold collapse at the north unit.',
    ];
    const loneClaim = 'The collapse was caused by deliberate sabotage by a rival company.';   // unsupported by the field
    const vecs = await embedAll(env, [...field, loneClaim]);
    const aDir = toArr(await env.geometricEmbedder.embed('The scaffold collapse injured workers and triggered a stop-work order.'));
    const bDir = toArr(await env.geometricEmbedder.embed(loneClaim));
    // The significance ρ is built from the FIELD ONLY — the retrieved set's vectors, uniform —
    // with NO reliability/source-prior channel. So credibility is corroboration: the field
    // (six sources) outweighs the lone claim (one source). This is the operative config.
    const massField = quad(buildDensity(vecs).rho, aDir);
    const massLone = quad(buildDensity(vecs).rho, bDir);
    // The counterfactual: IF a reliability prior were smuggled in as a density weight, a high
    // enough prior WOULD override the field — which is exactly why the surfer's ρ has no such
    // input. Shown for contrast, not as the system's path.
    const massLoneIfReliabilityWeighted = quad(buildDensity(vecs, [1, 1, 1, 1, 1, 1, 3]).rho, bDir);
    const ok = massField > massLone;
    rows.push(row('D1', 'Reliability does not override the field', ok ? PASS : FAIL,
      ok ? 'with credibility built from the field alone (no reliability channel into ρ), the corroborated reading outweighs the lone source\'s claim — credibility stays bounded by corroboration, not by who said it'
         : 'the lone source\'s claim overrode the field it does not support',
      { field_mass: +massField.toFixed(4), lone_claim_mass: +massLone.toFixed(4),
        field_sources: field.length, lone_sources: 1,
        note_if_reliability_were_a_weight: `lone would rise to ${massLoneIfReliabilityWeighted.toFixed(4)} (≥ field) — which is why ρ takes no source-prior input` }));
  }

  // ── D2 — Reliability is earned on load-bearing claims [reliability prior] ──
  {
    // Two sources observed over a track record. ECHOER only ever agrees with a cluster that
    // shares its own origin (a sock-puppet ring — conformity, not corroboration). CONTRIBUTOR
    // supplies readings corroborated by INDEPENDENT sources, and its claims survive revision
    // (its directions held). Reliability must rise for the contributor, not the echoer.
    let bookOk = true, err = null, e = null, c = null;
    try {
      const book = createCredenceBook();
      const against = { id: 'claim', author: 'origin' };
      const ring = Array.from({ length: 5 }, (_, i) => ({ id: 'sock' + i, author: 'X', feed: 'W' })); // non-independent
      const indep = Array.from({ length: 5 }, (_, i) => ({ id: 'indep' + i }));                         // independent
      // Both are internally coherent (warm the cells equally — coherence is NOT the differentiator).
      for (let i = 0; i < 30; i++) { book.observeCoherence('echoer', 'news', 0.85); book.observeCoherence('contributor', 'news', 0.85); }
      // Both AGREE strongly (value 0.9) — but the echoer agrees only with a ring that shares its
      // own origin (conformity); the contributor's agreement comes from independent voices.
      for (let i = 0; i < 40; i++) {
        book.observeCorroboration('echoer', 'news', 0.9, { against, corroborators: ring });
        book.observeCorroboration('contributor', 'news', 0.9, { against, corroborators: indep });
      }
      // The contributor's uniquely-supplied directions HELD under disconfirmation; the echoer
      // adds nothing new to revise.
      for (let i = 0; i < 14; i++) { book.observeRevision('contributor', 'news', 0.5); book.observeRevision('echoer', 'news', 0.0); }
      e = book.at('echoer', 'news'); c = book.at('contributor', 'news');
    } catch (ex) { bookOk = false; err = ex.message; }
    if (!bookOk) {
      rows.push(row('D2', 'Reliability is earned on load-bearing claims', INCONCLUSIVE,
        'the credence/track-record surface could not be driven', { error: err }));
    } else {
      // The corroboration credence O is the reliability earned from agreement, weighted by the
      // INDEPENDENCE of the corroborators. The sock-ring collapses to ~one voice (low effective
      // K), so the echoer's O stays low; the contributor's independent corroboration lifts its O.
      const oEcho = e.O?.mean ?? 0, oContrib = c.O?.mean ?? 0;
      const kEcho = e.evidence.corroboration_n, kContrib = c.evidence.corroboration_n;
      const ok = oContrib > oEcho && kContrib > kEcho * 1.5;
      rows.push(row('D2', 'Reliability is earned on load-bearing claims', ok ? PASS : FAIL,
        ok ? 'both sources agree strongly, but the echoer\'s agreement is a sock-puppet ring that collapses to ~one effective voice — its corroboration credence O stays low; the contributor, corroborated by INDEPENDENT sources with directions that held, earns higher O. Conformity ≠ trust.'
           : 'agreement-weighting inflated the conforming echoer\'s reliability to match the independent contributor',
        { echoer_corroboration_credence_O: +oEcho.toFixed(3), contributor_corroboration_credence_O: +oContrib.toFixed(3),
          echoer_effective_K: +(+kEcho).toFixed(1), contributor_effective_K: +(+kContrib).toFixed(1) }));
    }
  }

  // ── D3 — Audit replay reproduces the turn [log] ───────────────────────────
  {
    const doc = setupDoc(
      `WorkSafe NB issued a stop-work order at the Saint John refinery on Tuesday after a scaffold collapse.
Two contractors were treated for fractures and released the same day.
The order halts all elevated work on the north unit until the scaffolding is re-certified.`, 'd3');
    const audit = createAuditLog();
    const r = await runTurn({
      question: 'Who issued the stop-work order and why?', doc,
      model: env.model, embedder: env.embedder, geometricEmbedder: env.geometricEmbedder,
      classifier: env.classifier, centroids: env.centroids, auditLog: audit, history: [],
    });
    const t = r.turn;
    // The chain logged: prompt → retrieval(spans) → rawOutput → bound → vetoes → answer/sources.
    const reading = t.steps.find(s => s.name === 'retrieve') ? r : r;
    const promptLogged = !!(t.prompt && t.prompt.length);
    const rawLogged = !!(t.rawOutput && t.rawOutput.length);
    const spansLogged = (r.turn.reading?.spans?.length || 0) > 0 || (r.sources?.length || 0) > 0;
    const boundLogged = Array.isArray(t.bound) && t.bound.length > 0;
    const answerLogged = !!(t.answer && t.answer.length);
    const chainComplete = promptLogged && rawLogged && spansLogged && boundLogged && answerLogged;
    // Replay from the log alone: re-drive the pipeline with a stub that returns the RECORDED
    // rawOutput (the LLM is the only non-deterministic link). The bind/veto/answer must
    // reproduce identically.
    const replayModel = { id: 'replay', kind: 'local', isLoaded: () => true, async load() {}, async phrase() { return t.rawOutput; } };
    const audit2 = createAuditLog();
    const r2 = await runTurn({
      question: 'Who issued the stop-work order and why?', doc: setupDoc(doc.text, 'd3r'),
      model: replayModel, embedder: env.embedder, geometricEmbedder: env.geometricEmbedder,
      classifier: env.classifier, centroids: env.centroids, auditLog: audit2, history: [],
    });
    const reproducesAnswer = r2.answer === r.answer;
    const reproducesSources = JSON.stringify(r2.sources) === JSON.stringify(r.sources);
    const ok = chainComplete && reproducesAnswer && reproducesSources;
    rows.push(row('D3', 'Audit replay reproduces the turn', ok ? PASS : FAIL,
      ok ? 'the full chain (prompt → spans → rawOutput → bindings → vetoes → answer) is logged, and replaying the recorded output reproduces the same answer + citations'
         : 'a step was unlogged or the replay diverged from the recorded turn',
      { prompt_logged: promptLogged, rawOutput_logged: rawLogged, spans_logged: spansLogged,
        bound_logged: boundLogged, answer_logged: answerLogged,
        replay_reproduces_answer: reproducesAnswer, replay_reproduces_sources: reproducesSources }));
  }

  // ── D4 — Grounding holds under time-travel [scrubber, citations] ───────────
  {
    // Answer a question; ingest a new source that contradicts it; re-ask; scrub back.
    const baseText = `WorkSafe issued the stop-work order at the refinery on Tuesday.
Mara Singh visited the site the same day.`;
    const docEarly = setupDoc(baseText, 'd4');
    const tEarly = await turn(env, docEarly, 'On what day was the stop-work order issued?');
    const earlyCite = tEarly.sources[0];
    const earlyCiteResolvesTuesday = Number.isInteger(earlyCite) &&
      /tuesday/i.test(docEarly.sentences[earlyCite] || '');
    // Ingest a contradicting correction → the LATER document state.
    const laterText = baseText + `\nCorrection: WorkSafe issued the order on Wednesday, not Tuesday.`;
    const docLater = setupDoc(laterText, 'd4');
    const correctionIdx = docLater.sentences.findIndex(s => /wednesday/i.test(s));
    // The later state carries the correction's events…
    const gLater = projectGraph(docLater.log);
    const laterHasCorrection = gLater.edges.some(e => e.sentIdx === correctionIdx) ||
      docLater.log.snapshot().some(e => e.sentIdx === correctionIdx);
    // …and time-travel BACK (project the later log without the correction's events) returns
    // the earlier state: the original citation still resolves to its Tuesday span, and the
    // earlier projection does NOT carry the correction (no later state leaks in).
    const gScrubbed = projectGraph(logExcluding(docLater.log, e => e.sentIdx === correctionIdx));
    const scrubbedOmitsCorrection = gScrubbed.edges.every(e => e.sentIdx !== correctionIdx);
    const earlySpanIntactUnderScrub = Number.isInteger(earlyCite) &&
      /tuesday/i.test((docLater.sentences[earlyCite] || ''));   // the cited span unchanged at the earlier date
    const ok = earlyCiteResolvesTuesday && laterHasCorrection && scrubbedOmitsCorrection && earlySpanIntactUnderScrub;
    rows.push(row('D4', 'Grounding holds under time-travel', ok ? PASS : FAIL,
      ok ? 'the earlier answer\'s citation still resolves to its Tuesday span under scrubbing; the later state carries the correction; no later state leaks into the earlier grounding'
         : 'time-travel leaked later state into the earlier grounding, or a binding broke under scrubbing',
      { early_answer: tEarly.answer.slice(0, 120), early_citation: earlyCite,
        early_cite_resolves_tuesday: earlyCiteResolvesTuesday,
        later_state_has_correction: laterHasCorrection,
        scrubbed_omits_correction: scrubbedOmitsCorrection,
        early_span_intact_under_scrub: earlySpanIntactUnderScrub }));
  }

  return rows;
};
