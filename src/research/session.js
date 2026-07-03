// research/session.js — the LIVE research surface's state: one append-only log
// across many chat asks (docs/deep-research-log.md).
//
// The surface is not a dead artifact. It is projectReport(log) over a log that
// KEEPS GROWING: every further research ask via chat appends a new frame tree
// (and its pins, reads, extracts, evas, cons, recs, voids, asks, promotes,
// phrases) to the SAME log, and every subscriber re-projects. The report
// populates and adjusts because it was never stored — it is always the log
// made visible. Coverage, corroboration, the convergence badge, and the
// residue all aggregate across asks for free, because they are folds.
//
// The chat gets its reply from the same run: formatChatReply reads the newest
// run's sections off the projection — the phrased, bind-checked sentences with
// their citation numbers, the voids stated as measured absences — so the chat
// answer and the surface are one projection, never two stories.

import { runGroundedResearch } from './driver.js';
import { projectReport } from './project.js';
import { liveView } from './live.js';

export const createResearchSession = (defaults = {}) => {
  const log = [];
  const listeners = new Set();
  let running = false;
  let runs = 0;

  const notify = (event) => {
    for (const fn of listeners) { try { fn(log, event); } catch { /* a broken view never stops the log */ } }
  };

  // One more research ask, appended to the SAME log. Per-ask opts override the
  // session defaults (fresh sources, a different alpha); the log and the run's
  // root id are the session's. Serialized: a second ask queues behind the
  // first by awaiting the same promise chain (the log is append-only and the
  // arrow of time is per-log, so two interleaved runs would shuffle t).
  let chain = Promise.resolve();
  const research = (question, opts = {}) => {
    const p = chain.then(async () => {
      running = true;
      notify(null);
      try {
        const rootId = runs === 0 ? 'root' : `r${runs}`;
        runs++;
        const { report } = await runGroundedResearch(question, {
          ...defaults, ...opts,
          log, rootId,
          onEvent: (e, l) => { notify(e); if (opts.onEvent) opts.onEvent(e, l); else if (defaults.onEvent) defaults.onEvent(e, l); },
        });
        return { log, report, rootId };
      } finally {
        running = false;
        notify(null);
      }
    });
    chain = p.catch(() => {});
    return p;
  };

  return {
    get log() { return log; },
    get running() { return running; },
    get runs() { return runs; },
    research,
    report: (cursor = null) => projectReport(log, cursor),
    view: (cursor = null) => liveView(log, cursor),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    exportJSONL: () => log.map((e) => JSON.stringify(e)).join('\n'),
  };
};

// The chat-side rendering of one run: the phrased summary with its glue marked
// and citations numbered, the grounded spans, the measured absences, and the
// audit line. Plain text/markdown-ish, for a chat bubble; the surface carries
// the full projection. `rootId` scopes the reply to the frames of THAT ask.
export const formatChatReply = (report, rootId = 'root') => {
  const secs = report.sections.filter((s) => s.frameId === rootId || s.frameId.startsWith(rootId + '.'));
  if (!secs.length) return 'Nothing was researched — no frames opened.';
  const num = new Map(report.propositions.map((p, i) => [p.id, i + 1]));
  const lines = [];
  for (const sec of secs) {
    if (sec.frameId !== rootId) lines.push(`\n**${sec.question}**`);
    if (sec.phrase) {
      lines.push(sec.phrase.sentences.map((s) =>
        s.glue ? s.text : `${s.text} [${num.get(s.boundTo) ?? '•'}]`).join(' '));
    }
    for (const v of sec.voids) {
      lines.push(`The pinned record is silent here (${v.terrain}${v.term ? `: ${v.term}` : ''}) — ${v.receipt}.`);
    }
    if (!sec.phrase && sec.propositions.length) {
      // No model — the reply IS the spans, significance-ordered.
      for (const p of sec.propositions.slice(0, 5)) lines.push(`[${num.get(p.id)}] “${p.span.text}”`);
    }
  }
  // The citations QUOTE their spans. A bare footnote number pointing at a URL
  // is the severed link this whole design exists to refuse — the reader must be
  // able to see, under every [n], the exact bytes the claim stands on.
  const cited = new Set();
  for (const sec of secs) for (const p of sec.propositions) cited.add(p.id);
  if (cited.size) {
    lines.push('');
    for (const p of report.propositions.filter((p) => cited.has(p.id))) {
      const pin = report.pinById[p.pinId];
      const where = pin?.snapshotUrl || pin?.url || pin?.title || (pin ? `local pin ${pin.contentHash.slice(0, 12)}…` : '');
      lines.push(`[${num.get(p.id)}] “${p.span.text}”`);
      lines.push(`    — ${where} · chars ${p.span.start}–${p.span.end}${p.recForcing ? ' · REC-forcing' : ''}${p.contradictedBy.length ? ' · ⚠ contradicted' : ''}${p.corroboratedBy.length ? ` · corroborated ×${p.corroboratedBy.length}` : ''}`);
    }
  }
  if (report.verify.sections) {
    lines.push(`_VERIFY: ${report.verify.bound}/${report.verify.sentences} sentences bind, ${report.verify.glue} glue._`);
  }
  return lines.join('\n');
};
