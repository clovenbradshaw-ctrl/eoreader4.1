// research/live.js — the live process view (docs/deep-research-log.md).
//
// The significance loop made visible, because it is the distinctive,
// trust-building thing. NOT a second state machine: liveView(log, cursor) is
// projectReport at a cursor, reshaped for a panel that animates — the current
// frame as a standing panel (terms, a strain bar filling toward the REC
// threshold), the strain as the page's pulse, the coverage grid filling cell by
// cell (solid corroborated, amber contested, hollow empty), the surf as a path
// following measured surprise, questions surfacing as in-flow cards. Nothing
// animates that is not an event.

import { projectReport } from './project.js';
import { RKIND } from './events.js';
import { OPERATORS } from '../core/operators.js';

export const liveView = (log, cursor = null) => {
  const r = projectReport(log, cursor);
  const at = r.cursor;

  // The standing frame panel: the deepest frame still gathering, its current
  // terms (DEF), its strain against a nominal bar. The bar is strain relative
  // to the last REC's firing sum (or 1.5, the skeleton threshold) — a calm
  // topic barely fills it; a contested one keeps breaking it.
  const activeFrame = [...r.frames].reverse().find((f) => f) ?? null;
  const lastRec = r.recs.length ? r.recs[r.recs.length - 1] : null;
  const bar = lastRec?.strainSum || 1.5;
  const framePanel = activeFrame ? {
    id: activeFrame.id, question: activeFrame.question,
    terms: activeFrame.terms, recs: activeFrame.recs,
    strain: activeFrame.strain, strainRatio: Math.max(0, Math.min(1, bar ? activeFrame.strain / bar : 0)),
  } : null;

  // The grid, cell by cell: solid (corroborated), amber (contested), plain
  // (present), hollow (empty). Read off the coverage fold + the con record.
  const contestedOps = new Set(), corroboratedOps = new Set();
  for (const p of r.propositions) {
    const op = p.address?.op;
    if (!op) continue;
    if (p.contradictedBy.length) contestedOps.add(op);
    else if (p.corroboratedBy.length) corroboratedOps.add(op);
  }
  const grid = Object.keys(OPERATORS).map((op) => ({
    op, label: OPERATORS[op].label, count: r.coverage.actFace[op] || 0,
    state: !r.coverage.actFace[op] ? 'empty'
      : contestedOps.has(op) ? 'contested'
      : corroboratedOps.has(op) ? 'corroborated' : 'present',
  }));

  // The surf as a path of measured surprise; the REC moments ride on it so the
  // signature reframe ("this read as X; the third source makes it Y") is one
  // click from the span that forced it.
  const path = r.pulse.map((p) => ({ t: p.t, surprise: p.surprise, strain: p.strain, propId: p.propId }));
  const recMoments = r.recs.map((rec) => ({
    t: rec.t, from: rec.from, to: rec.to, strainSum: rec.strainSum,
    forcedBy: rec.forcedBy,
  }));

  return {
    cursor: at,
    framePanel, grid, path, recMoments,
    questions: r.questions.map(({ ask, answer }) => ({
      id: ask.id, trigger: ask.trigger, text: ask.text, options: ask.options,
      answered: !!answer, reply: answer?.reply ?? null,
    })),
    badge: r.convergence.badge,
    counts: {
      pins: r.pins.length, reads: r.reads.length,
      propositions: r.propositions.length,
      promoted: r.propositions.filter((p) => p.promoted).length,
      recs: r.recs.length, voids: r.voids.length,
    },
    lastEvent: at ? describeEvent(log[at - 1]) : null,
  };
};

// A one-line narration of an event — for the feed. Reads the event, never
// invents; the live view is a rendering of the log, not a second truth. Each
// line names WHAT the event touched — the source, the span it read, the terms
// it reframed around — so a run of them reads as a research trail rather than a
// column of opaque hashes.
export const describeEvent = (e) => {
  if (!e) return '';
  switch (e.kind) {
    case RKIND.OPEN: return `frame opened — ${e.question}`;
    case RKIND.PIN: return describePin(e);
    case RKIND.READ: return e.span?.text
      ? `read “${clip(e.span.text)}” — binds ${e.bind?.overlap ?? '?'} frame term${e.bind?.overlap === 1 ? '' : 's'}`
      : `read a span (binds ${e.bind?.overlap ?? '?'} terms)`;
    case RKIND.EXTRACT: return `extracted: “${clip(e.span.text)}”`;
    case RKIND.EVA: return e.verdict === 'strain' ? `strain +${e.strainDelta} (sum ${e.strain})` : 'confirms the frame';
    case RKIND.CON: return `${e.relation}: ${e.a} ↔ ${e.b}`;
    case RKIND.REC: return `frame broke — reconceived around ${e.to.join(', ')}`;
    case RKIND.VOID: return `measured absence (${e.terrain}) — ${e.receipt}`;
    case RKIND.ASK: return `question (${e.trigger}): ${clip(e.text, 90)}`;
    case RKIND.ANSWER: return `answered: ${clip(e.reply, 90)}`;
    case RKIND.PROMOTE: return `${e.propId} enters the report`;
    case RKIND.PHRASE: return `phrased section — ${e.sentences.filter((s) => !s.glue).length}/${e.sentences.length} sentences bind`;
    default: return e.kind;
  }
};

// A pin narrated for a human: WHICH source, how big, and — the part the old
// line hid — WHY it landed where it did. An archive snapshot is the strong case
// (the citation can never rot). A LOCAL pin is the honest fallback, not a
// failure: the exact bytes are still fingerprinted and embedded, so the claim
// stands on the quote itself and the link was only ever corroboration. The two
// local cases read differently because they ARE different — archive.org
// unreachable vs. a pasted source that never had a URL — and both facts were
// already in the event, just never surfaced.
const describePin = (e) => {
  const name = sourceName(e);
  const size = e.chars ? ` · ${humanChars(e.chars)}` : '';
  if (e.snapshotUrl) return `pinned ${name} to archive.org @ ${shortStamp(e.capturedAt ?? e.snapshotId)}${size}`;
  const why = e.url
    ? 'archive.org didn’t answer, so the embedded quote is the record'
    : 'no URL to archive, so the pasted text is the record';
  return `embedded ${name} locally${size} — ${why}`;
};

// A readable label for a source: a prettified URL (a Wikipedia slug reads back
// as its title) beats a bare link; a human-given title beats a hash; a short
// hash is the last resort so a line is never empty.
const sourceName = (e) => {
  const viaUrl = e.url ? prettyUrl(e.url) : null;
  if (viaUrl) return `“${viaUrl}”`;
  const t = String(e.title || '').trim();
  if (t && !/^https?:\/\//i.test(t)) return `“${clip(t, 60)}”`;
  const viaTitle = prettyUrl(t);
  if (viaTitle) return `“${viaTitle}”`;
  return `a source (${String(e.contentHash || '').slice(0, 12)}…)`;
};

// A URL reduced to its readable core: the last path segment (decoded, de-
// underscored, de-suffixed) at its host — ".../wiki/Bottlenose_dolphin" →
// "Bottlenose dolphin · en.wikipedia.org". Null when the input is not a URL.
const prettyUrl = (u) => {
  try {
    const url = new URL(String(u));
    const host = url.hostname.replace(/^www\./, '');
    const seg = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_+]/g, ' ').trim();
    return seg ? `${seg} · ${host}` : host;
  } catch { return null; }
};

const humanChars = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M chars`
  : n >= 1e3 ? `${Math.round(n / 1e3)}k chars` : `${n} chars`;

const shortStamp = (s) => {
  const m = String(s ?? '').match(/(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s ?? '');
};

const clip = (s, n = 70) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
