// research/surface.js — the deep-research surface, mountable anywhere.
//
// ONE UI, two hosts: the main app mounts it in an overlay (reader/app.dc.js →
// onOpenDeepResearch) and the standalone deep-research.html page mounts it
// full-screen. Framework-free DOM so it owes nothing to either host's runtime.
//
// The surface is the two projections side by side (docs/deep-research-log.md):
// while the driver runs, the LIVE view (live.js) — the frame panel, the strain
// bar filling toward the REC threshold, the coverage grid filling cell by
// cell, questions surfacing as in-flow cards; when it lands, the REPORT
// (render.js) — every clause tethered to its span, pins, voids, the trace.
// Both are projectReport(log) at a cursor; nothing here is a second state.

import { createResearchSession } from './session.js';
import { liveView, describeEvent } from './live.js';
import { renderReportFragment, renderTraceFragment, renderReportHTML, REPORT_CSS } from './render.js';

const PROXY = 'https://n8n.intelechia.com/webhook';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A small readable-text extraction for fetched pages — enough for the pinned
// corpus; the main app can inject its richer extractor via opts.fetchPage.
const htmlToText = (html) => {
  const noScript = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside|form|noscript)[\s\S]*?<\/\1>/gi, ' ');
  const title = (noScript.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const text = noScript
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 40).join('\n');
  return { title, text };
};

const defaultFetchPage = async (url) => {
  const r = await fetch(PROXY + '/feed?url=' + encodeURIComponent(url));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const { title, text } = htmlToText(await r.text());
  if (text.length < 200) throw new Error('page too thin to pin');
  return { url, title: title || url, text };
};

const SURFACE_CSS = `
.drs{display:flex;flex-direction:column;height:100%;background:#f5f6f8;color:#1a1c20;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px}
.drs *{box-sizing:border-box}
.drs-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 18px;background:#fff;border-bottom:1px solid #e5e7eb}
.drs-head h1{font-size:15px;margin:0;font-weight:700}
.drs-head .drs-sub{font-size:11px;color:#5b6572}
.drs-close{margin-left:auto;width:28px;height:28px;border:1px solid #e5e7eb;background:#fff;border-radius:7px;cursor:pointer;font-size:14px;line-height:1}
.drs-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 18px 40px}
.drs-panel{background:#fff;border:1px solid #e5e7eb;border-radius:11px;padding:14px 16px;margin:0 auto 12px;max-width:820px}
.drs label{display:block;font-size:11px;font-weight:700;color:#5b6572;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px}
.drs input[type=text],.drs textarea{width:100%;border:1px solid #d7dbe2;border-radius:8px;padding:8px 10px;font:inherit;background:#fff}
.drs textarea{min-height:64px;resize:vertical}
.drs-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.drs-btn{border:1px solid #d7dbe2;background:#fff;border-radius:8px;padding:7px 13px;font:inherit;font-weight:600;cursor:pointer}
.drs-btn:hover{background:#eef0f3}
.drs-btn-acc{background:#2563eb;border-color:#2563eb;color:#fff}
.drs-btn-acc:hover{background:#1d4ed8}
.drs-btn[disabled]{opacity:.5;cursor:default}
.drs-src{display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;margin:5px 0;font-size:12.5px;background:#fafbfc}
.drs-src .drs-x{margin-left:auto;border:none;background:none;cursor:pointer;color:#9aa2ad;font-size:13px}
.drs-hint{font-size:11.5px;color:#9aa2ad}
.drs-err{color:#991b1b;font-size:12px;margin-top:6px}
.drs-live{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:820px;margin:0 auto 12px}
.drs-live .drs-panel{margin:0}
.drs-frame-terms{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#3730a3}
.drs-strainbar{height:8px;background:#eef0f3;border-radius:99px;overflow:hidden;margin:8px 0 4px}
.drs-strainbar>div{height:100%;background:linear-gradient(90deg,#60a5fa,#8b5cf6);transition:width .3s}
.drs-grid9{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;font-family:ui-monospace,monospace;font-size:10.5px}
.drs-cell{border:1px dashed #d7dbe2;border-radius:6px;text-align:center;padding:5px 2px;color:#9aa2ad}
.drs-cell.on{border-style:solid;background:#eff6ff;border-color:#bfdbfe;color:#1a1c20}
.drs-cell.cor{background:#dcfce7;border-color:#86efac}
.drs-cell.con{background:#fef3c7;border-color:#fcd34d}
.drs-feed{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#5b6572;max-height:180px;overflow-y:auto;margin:0;padding-left:18px}
.drs-feed li{margin:2px 0}
.drs-ask{border:1px solid #c7d2fe;background:#eef2ff;border-radius:10px;padding:11px 13px;margin:9px 0}
.drs-ask .drs-trig{font-family:ui-monospace,monospace;font-size:10px;font-weight:700;color:#3730a3;background:#e0e7ff;border-radius:99px;padding:1px 8px}
.drs-ask p{margin:6px 0;white-space:pre-wrap}
.drs-report-wrap{background:#fff;border:1px solid #e5e7eb;border-radius:11px;padding:20px 22px;max-width:820px;margin:0 auto}
.drs-badgechip{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;border-radius:99px;padding:2px 10px}
${REPORT_CSS}
@media (max-width:700px){.drs-live{grid-template-columns:1fr}}
`;

// mountResearchSurface(el, opts) → { destroy, session }
//   opts.session    a createResearchSession — SHARE the app's session and the
//                   surface stays live: research asked in chat appends to the
//                   same log and this surface re-projects (never a dead artifact)
//   opts.fetchPage  async (url) => { url, title, text } — the host's page fetcher
//   opts.model      { phrase } — the host's talker, for the one checked call/section
//   opts.fetch      network fetch for archive pinning (default window.fetch)
//   opts.onClose    show a close button that calls this
//   opts.sources    pre-seeded [{ url?, title?, text }] (the app hands over open sources)
export const mountResearchSurface = (el, opts = {}) => {
  const fetchPage = opts.fetchPage || defaultFetchPage;
  const netFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const sources = [...(opts.sources || [])];
  const session = opts.session || createResearchSession({ model: opts.model || null, fetch: netFetch, now: () => Date.now() });

  const root = document.createElement('div');
  root.className = 'drs';
  const style = document.createElement('style');
  style.textContent = SURFACE_CSS;
  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', `
    <div class="drs-head">
      <div><h1>Deep research — grounded</h1>
      <div class="drs-sub">every fact an extractive span at a pinned address; the report is a projection of the log</div></div>
      ${opts.onClose ? '<button class="drs-close" title="Close">✕</button>' : ''}
    </div>
    <div class="drs-body">
      <div class="drs-panel drs-setup">
        <label>Research question</label>
        <input type="text" class="drs-q" placeholder="What happened with … ?" />
        <label>Sub-questions <span style="font-weight:400;text-transform:none">(optional, one per line — the frame tree)</span></label>
        <textarea class="drs-subqs" placeholder="Who awarded the contract?&#10;What did the audit find?"></textarea>
        <label>Pinned corpus</label>
        <div class="drs-srclist"></div>
        <div class="drs-row" style="margin-top:6px">
          <input type="text" class="drs-url" placeholder="https:// … add a source by URL" style="flex:1;min-width:200px" />
          <button class="drs-btn drs-addurl">Pin URL</button>
          <button class="drs-btn drs-addpaste">Paste text…</button>
        </div>
        <div class="drs-paste" style="display:none;margin-top:6px">
          <input type="text" class="drs-paste-title" placeholder="Source title (e.g. 'City audit 2021, p.14')" style="margin-bottom:6px" />
          <textarea class="drs-paste-text" placeholder="Paste the source text…"></textarea>
          <div class="drs-row" style="margin-top:6px">
            <button class="drs-btn drs-paste-add">Add pasted source</button>
          </div>
        </div>
        <div class="drs-err" style="display:none"></div>
        <div class="drs-row" style="margin-top:12px">
          <label style="margin:0;text-transform:none">Caution
            <select class="drs-alpha" style="margin-left:6px;font:inherit;border:1px solid #d7dbe2;border-radius:7px;padding:4px 6px">
              <option value="0.01">ask more (α=0.01)</option>
              <option value="0.05" selected>balanced (α=0.05)</option>
              <option value="0.15">ask less (α=0.15)</option>
            </select>
          </label>
          <button class="drs-btn drs-btn-acc drs-run" style="margin-left:auto">Run grounded research</button>
        </div>
        <div class="drs-hint" style="margin-top:8px">Offline-honest: no sources → a measured VOID, never an invented report. ${opts.model ? 'A model is connected — each section gets one bind-checked phrasing call.' : 'No model connected — the report stands on exact spans (add the app’s model for phrased summaries).'}</div>
      </div>
      <div class="drs-live" style="display:none">
        <div class="drs-panel">
          <label style="margin-top:0">Current frame</label>
          <div class="drs-frame-q" style="font-size:12.5px"></div>
          <div class="drs-frame-terms"></div>
          <div class="drs-strainbar"><div style="width:0%"></div></div>
          <div class="drs-hint">strain toward the next reframe · <span class="drs-badgechip"></span></div>
          <label>Coverage — filling cell by cell</label>
          <div class="drs-grid9"></div>
        </div>
        <div class="drs-panel">
          <label style="margin-top:0">The walk (measured, not narrated)</label>
          <ol class="drs-feed"></ol>
          <div class="drs-asks"></div>
        </div>
      </div>
      <div class="drs-report-wrap" style="display:none">
        <div class="drs-row" style="justify-content:flex-end;margin-bottom:6px">
          <button class="drs-btn drs-dl">Download report (self-contained)</button>
          <button class="drs-btn drs-dl-log">Download log (JSONL)</button>
        </div>
        <div class="drs-report-target"></div>
      </div>
    </div>
  `);
  el.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const srcList = $('.drs-srclist');
  const errBox = $('.drs-err');
  const feed = $('.drs-feed');
  const asksBox = $('.drs-asks');

  const showErr = (m) => { errBox.style.display = m ? '' : 'none'; errBox.textContent = m || ''; };

  const renderSources = () => {
    srcList.innerHTML = sources.length
      ? sources.map((s, i) => `<div class="drs-src"><span>📌</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title || s.url || 'pasted text')}</span><span class="drs-hint">${(s.text || '').length.toLocaleString()} chars</span><button class="drs-x" data-i="${i}" title="Remove">✕</button></div>`).join('')
      : '<div class="drs-hint">No sources pinned yet. Add URLs or paste text — the corpus is pinned before it is read.</div>';
    srcList.querySelectorAll('.drs-x').forEach((b) => b.addEventListener('click', () => { sources.splice(+b.dataset.i, 1); renderSources(); }));
  };
  renderSources();

  if (opts.onClose) $('.drs-close').addEventListener('click', () => opts.onClose());

  $('.drs-addurl').addEventListener('click', async () => {
    const url = $('.drs-url').value.trim();
    if (!/^https?:\/\//.test(url)) return showErr('Enter a full http(s) URL.');
    showErr('');
    const btn = $('.drs-addurl');
    btn.disabled = true; btn.textContent = 'Fetching…';
    try {
      sources.push(await fetchPage(url));
      $('.drs-url').value = '';
      renderSources();
    } catch (e) { showErr(`Could not fetch ${url}: ${e.message}. Paste its text instead — the pin still records the hash.`); }
    btn.disabled = false; btn.textContent = 'Pin URL';
  });
  $('.drs-addpaste').addEventListener('click', () => {
    const p = $('.drs-paste');
    p.style.display = p.style.display === 'none' ? '' : 'none';
  });
  $('.drs-paste-add').addEventListener('click', () => {
    const text = $('.drs-paste-text').value.trim();
    if (text.length < 40) return showErr('Pasted source is too short to ground anything.');
    sources.push({ title: $('.drs-paste-title').value.trim() || null, text });
    $('.drs-paste-text').value = ''; $('.drs-paste-title').value = '';
    $('.drs-paste').style.display = 'none';
    showErr('');
    renderSources();
  });

  // In-flow question cards: the driver's mechanical asks land here and the run
  // WAITS on the card (siblings would keep running in a threaded driver; the
  // sequential driver parks on the answer or the skip).
  const askUserInFlow = (askEvent) => new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'drs-ask';
    card.innerHTML = `<span class="drs-trig">${esc(askEvent.trigger)}</span><p>${esc(askEvent.text)}</p>
      <div class="drs-row"><input type="text" class="drs-ask-in" placeholder="Answer (optional)" style="flex:1;min-width:120px"/>
      <button class="drs-btn drs-ask-ok">Answer</button><button class="drs-btn drs-ask-skip">Leave open</button></div>`;
    asksBox.appendChild(card);
    card.querySelector('.drs-ask-ok').addEventListener('click', () => {
      const v = card.querySelector('.drs-ask-in').value.trim();
      card.querySelector('.drs-row').innerHTML = v ? `<div class="drs-hint">↳ ${esc(v)}</div>` : '<div class="drs-hint">left open</div>';
      resolve(v || null);
    });
    card.querySelector('.drs-ask-skip').addEventListener('click', () => {
      card.querySelector('.drs-row').innerHTML = '<div class="drs-hint">left open</div>';
      resolve(null);
    });
  });

  const paintLive = (log) => {
    const v = liveView(log);
    $('.drs-frame-q').textContent = v.framePanel?.question || '';
    $('.drs-frame-terms').textContent = v.framePanel?.terms?.length ? 'DEF: ' + v.framePanel.terms.join(' · ') : '';
    $('.drs-strainbar > div').style.width = Math.round((v.framePanel?.strainRatio || 0) * 100) + '%';
    const chip = $('.drs-badgechip');
    chip.textContent = v.badge;
    chip.style.background = { settled: '#dcfce7', converging: '#dcfce7', contested: '#fef3c7', thrash: '#fee2e2', open: '#e0e7ff' }[v.badge] || '#e0e7ff';
    $('.drs-grid9').innerHTML = v.grid.map((c) =>
      `<div class="drs-cell ${c.state === 'empty' ? '' : c.state === 'corroborated' ? 'on cor' : c.state === 'contested' ? 'on con' : 'on'}" title="${esc(c.label)}"><b>${c.op}</b> ${c.count || '—'}</div>`).join('');
    const last = log[log.length - 1];
    if (last) {
      const li = document.createElement('li');
      li.textContent = describeEvent(last);
      feed.appendChild(li);
      feed.scrollTop = feed.scrollHeight;
    }
  };

  // The live tether: anything that appends to the session's log — this panel's
  // Run button OR a research ask from the host's chat — repaints the live view
  // event by event, and re-projects the report when the run settles. The
  // surface adjusts because the report is a projection, not a saved artifact.
  const paintReport = () => {
    if (!session.log.length) return;
    $('.drs-report-target').innerHTML =
      renderReportFragment(session.report()) + renderTraceFragment(session.log);
    $('.drs-report-wrap').style.display = '';
  };
  const unsubscribe = session.subscribe((log, event) => {
    if (event) { $('.drs-live').style.display = ''; paintLive(log); }
    else if (!session.running) paintReport();
  });
  if (session.log.length) { $('.drs-live').style.display = ''; paintReport(); }

  $('.drs-run').addEventListener('click', async () => {
    if (session.running) return;
    const q = $('.drs-q').value.trim();
    if (!q) return showErr('A research question first.');
    showErr('');
    const runBtn = $('.drs-run');
    runBtn.disabled = true; runBtn.textContent = 'Running…';
    asksBox.innerHTML = '';
    $('.drs-live').style.display = '';
    const subQuestions = $('.drs-subqs').value.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      await session.research(q, {
        sources: sources.map((s) => ({ ...s })),
        subQuestions,
        model: opts.model || null,
        fetch: netFetch,
        now: () => Date.now(),
        alpha: parseFloat($('.drs-alpha').value) || 0.05,
        ask: askUserInFlow,
      });
      $('.drs-q').value = '';
    } catch (e) {
      showErr('Run failed: ' + (e?.message || e));
    }
    runBtn.disabled = false; runBtn.textContent = 'Run grounded research';
  });

  const download = (name, content, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('.drs-dl').addEventListener('click', () => {
    if (!session.log.length) return;
    download('deep-research-report.html', renderReportHTML(session.report(), { log: session.log }), 'text/html');
  });
  $('.drs-dl-log').addEventListener('click', () => {
    if (!session.log.length) return;
    download('deep-research-log.jsonl', session.exportJSONL(), 'application/x-ndjson');
  });

  return { destroy: () => { unsubscribe(); root.remove(); }, session };
};
