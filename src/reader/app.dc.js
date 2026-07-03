
class Component extends DCLogic {
  constructor(props){
    super(props);
    this.PROXY='https://n8n.intelechia.com/webhook';
    this.MAX_PASSAGE=600;   // a real prose sentence rarely exceeds this; beyond it is a list/table/directory segmentation artifact, never a passage to quote
    this.STOP=new Set('the a an of to in on at for and or but with by from as is are was were be been being this that these those it its their his her our your they we you i he she him them us me year years some most many few what who whom which when where how why than then so if not no nor only also just very more less new over under into out up down off above below'.split(' '));
    this.MONTHS=new Set('january february march april may june july august september october november december jan feb mar apr jun jul aug sept sep oct nov dec'.split(' '));
    this.DOW=new Set('monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun'.split(' '));
    this.TEMPORAL=new Set('today yesterday tomorrow morning afternoon evening night noon midnight week weeks month months year years day days hour hours minute minutes second seconds decade decades century centuries quarter weekday weekend weekends am pm utc gmt est pst date dates time times'.split(' '));
    // Common adjectives / nouns that frequently OPEN a sentence or title and so get a
    // stray capital ("Soft coral…", "Deep reefs…"). Used only with the positional test.
    this.COMMON_OPENER=new Set('soft hard new old great small large big high low good bad deep shallow light dark long short full empty open close closed free real true false main key top best worst early late recent modern ancient warm cold hot cool dry wet rich poor strong weak fast slow young many most other several various such few more less same different general common special major minor local global natural human social public private red blue green white black grey gray brown clear bright wide narrow thick thin heavy soft northern southern eastern western central upper lower inner outer first second third final next last whole half single double total active passive primary secondary'.split(' '));
    this.SUGG=[];  // filled on mount by loadSuggestions(): a random Wikipedia page + random English books
    this.PALETTE=['#2563eb','#7c3aed','#0e7490','#b45309','#dc2626','#15803d','#be185d','#4f46e5','#0891b2','#9333ea'];
    this.THEMES=[{name:'EO Violet',hex:'#5b34d6'},{name:'Indigo',hex:'#4f46e5'},{name:'Royal',hex:'#2563eb'},{name:'Teal',hex:'#0d9488'},{name:'Forest',hex:'#15803d'},{name:'Magenta',hex:'#be185d'},{name:'Amber',hex:'#b45309'},{name:'Slate',hex:'#475569'}];
    // ── e-book reading: paper themes + type families, applied to the book iframe ──
    this.READ_THEMES={light:{bg:'#ffffff',fg:'#23272e',fg2:'#9aa1ab',rule:'#eef0f3'},sepia:{bg:'#f4ecd9',fg:'#473f30',fg2:'#9a8e72',rule:'#e6dac0'},dark:{bg:'#14171c',fg:'#c8ccd3',fg2:'#71777f',rule:'#262a31'}};
    this.READ_FONTS={serif:'Georgia,"Iowan Old Style","Times New Roman",serif',sans:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif'};
    this._defaultRead={fs:19,lh:1.7,w:720,theme:'light',font:'serif'};
    let savedAccent=null,savedHL=null,savedAudit=null,savedHoverPivot=null,savedClickAct=null,savedHoverDelay=null,savedLink=null,savedRead=null,savedWebBrain=null,savedViewMode=null;try{savedAccent=localStorage.getItem('eo_accent');savedHL=localStorage.getItem('eo_highlight');savedAudit=localStorage.getItem('eo_audit');savedHoverPivot=localStorage.getItem('eo_hoverpivot');savedClickAct=localStorage.getItem('eo_clickact');savedHoverDelay=localStorage.getItem('eo_hoverdelay');savedLink=localStorage.getItem('eo_linkmode');savedRead=JSON.parse(localStorage.getItem('eo_readprefs')||'null');savedWebBrain=localStorage.getItem('eo_webbrain');savedViewMode=localStorage.getItem('eo_viewmode');}catch(e){}
    this._busy=false; this._svoRun=0; this._panelStack=[]; this._gzDrag=null; this._gzMoved=false;
    // Live model-generation tracking: every stall guard registers here so a single Stop can abort
    // whatever's decoding; `_stopGen` latches a user stop until the next turn starts.
    this._activeGuards=new Set(); this._stopGen=false;
    this._muted=new Set(); try{this._muted=new Set(JSON.parse(localStorage.getItem('eo_muted')||'[]'));}catch(e){}
    this.state={ ready:false, engineErr:null, pages:[], selId:null, query:'', url:'', busy:false, feed:[],
      // In-flight imports — a file starts here THE MOMENT it's picked, so it shows in the
      // Sources panel instantly (with a live "what it's doing" status) instead of only
      // appearing once the slow extractor — whisper, pdf.js, Tesseract — has finished. Each:
      // { id, name, kind, status, error?, done?, chatId? }. On success it's dropped and the
      // real read source lands in master.pages; on failure it stays, with its error, until dismissed.
      imports:[],
      // Entity panel width — persisted + clamped. Chat column width (chatW) likewise.
      panelW:(()=>{try{return Math.max(300,Math.min(820,+localStorage.getItem('eo_panelw')||380));}catch(e){return 380;}})(),
      chatW:(()=>{try{return Math.max(320,Math.min(640,+localStorage.getItem('eo_chatw')||420));}catch(e){return 420;}})(),
      // Viewport width drives the responsive tier (wide / mid / phone). Updated by a
      // resize listener; pane is the active region when in single-pane phone mode.
      vw:(typeof window!=='undefined'?window.innerWidth:1400), pane:'doc',
      gz:{k:1,x:0,y:0},
      hoverSrc:null, pinSrc:null, openSrc:null, mode:'breadth', direction:'', hoverEnt:null, hoverHref:null, hoverAhead:null, hoverXY:{x:0,y:0}, rev:0, sortMode:'updated',
      llm:true, llmAvail:false, svoBusy:false, svoStatus:'', pasteOpen:false, pasteText:'',
      srcWide:false, srcTab:'page', srcDoc:null, srcLoading:false, srcErr:null, linkMode:savedLink==='0'?false:true, linkChoice:null,
      viewUrl:null, detect:true, pageDoc:null, bookView:false, pageLoading:false, pageErr:null, rightOpen:true, panelSel:null, panelLens:null, panelMode:'overview', previewWiki:null, memOpen:false, memTab:'sources', memExpand:null,
      // The "+" new-tab surface: a blank tab with nothing chosen yet, offering the three
      // kinds a tab can be — a chat, a live website, or a page in reader view. Set by newTab()
      // and cleared the moment a destination is picked (a URL, a chat, an entity, a book).
      newTabOpen:false,
      // How a READ source renders in the center: 'reader' is the stripped book view (clean
      // prose, chrome/ads gone, engine TOC + flagged passages); 'native' is the real fetched
      // page with its own layout, given the same contents nav + highlighted passages on top.
      // A toolbar toggle flips it; an UNread URL always shows native (no prose to strip yet).
      // Default is 'native' — render the real page as HTML first; switch to the stripped
      // reader view only on request (the toggle persists 'reader' for those who prefer it).
      viewMode:(savedViewMode==='reader'?'reader':'native'),
      accent:savedAccent||null, highlightStyle:savedHL||'marker', settingsOpen:false, templatesOpen:false,
      hoverPivot:savedHoverPivot||'dwell', clickAction:savedClickAct||'ask', hoverDelay:Math.max(150,Math.min(2000,+savedHoverDelay||1100)),
      // THE REGISTER (docs/creative-grounded-modes.md): how the next answers are written.
      // 'auto' grounds on whatever the turn gathers and falls back honestly; 'grounded' holds
      // strictly to sources (declines rather than inventing); 'creative' writes freely from
      // the model, gathering nothing. Every settled turn is BADGED with the register it
      // actually used, whichever was asked for. Persisted under eo_answermode.
      answerMode:(()=>{try{const m=localStorage.getItem('eo_answermode');return (m==='grounded'||m==='creative')?m:'auto';}catch(e){return 'auto';}})(),
      auditMode:savedAudit==='1', auditCollapsed:false, auditCopied:false, provOpen:false, panelProvOpen:false,
      hoverCite:null, liveResearch:{on:false},
      // WEB AS BRAIN — on by default. A 3B chat model knows little, so by default a question it
      // can't ground in what's already been read+folded sends the engine to the web first (fetch,
      // fold, then answer from the new reading) instead of letting the model guess. Turning it off
      // (the composer toggle) makes the chat answer ONLY from what you've read — no web at all.
      webBrain:(savedWebBrain!=='0'),
      // HOW MUCH research — the arc's coverage policy, surfaced. shallow takes the strongest
      // answer; deep covers the subject from several angles; obsessive exhausts the threads.
      // It scales the battery size, the hop budget, pages-per-thread, and leash patience.
      researchDepth:(()=>{try{return localStorage.getItem('eo_depth')||'deep';}catch(e){return 'deep';}})(),
      leftOpen:true, openGroups:{}, summaries:{}, wikiDefs:{}, learnedOpen:false,
      // Entities the reader has explicitly RESEARCHED (the ✦ button). Once an entity
      // has been researched, its side-panel profile leads with the cross-source reading
      // — what the newly folded sources add — instead of staying pinned to the page line.
      researched:{},
      // Temporal cursor on the entity summary. Keyed by entity id → a fraction in
      // [0,1] of the way through that entity's attested record. Undefined means the
      // latest (right edge); dragging left rewinds the summary to what the record
      // said about the entity earlier in the reading.
      entCursor:{},
      // Chat — first-class alongside sources. Each chat is a thread grounded in what
      // has been read; answers are built from the read graph/sentences (no LLM; an
      // LLM refines them only if window.claude is present). Chats live in the left panel.
      chats:[], activeChat:null, chatInput:'', chatBusy:false, groundOpen:{},
      // THE OUTPUT PICKER on the composer: the selected output FORMAT (essay is wired; report/
      // summary/poem are scaffolds) and, within a format, its KIND. `essayType` is the kind under
      // the essay format (a template that LEARNS — organs/out/essay-types.js). All persisted like
      // the other toggles. `outputExpanded` is which format's kinds are open in the menu accordion
      // (null → the selected format expands by default).
      outputType:(()=>{try{return localStorage.getItem('eo_output_type')||'essay';}catch(e){return 'essay';}})(),
      // The Write control is a TOGGLE, not a one-shot: armed, every sent turn is composed as the
      // selected essay (the box text is the topic), so you type a prompt and hit Enter like any chat
      // rather than reaching for a separate button each time. Persisted so the mode survives reloads.
      essayArmed:(()=>{try{return !!localStorage.getItem('eo_essay_armed');}catch(e){return false;}})(),
      outputExpanded:null,
      essayType:(()=>{try{return localStorage.getItem('eo_essay_type')||'argument';}catch(e){return 'argument';}})(),
      essayMenuOpen:false,
      // Project Gutenberg — "a source of sources". A non-URL query searches the catalog;
      // a chosen book is fetched and READ FULLY before it joins the sources (and so can
      // be chatted with). gutenReading holds the id while a book is being read.
      gutenResults:null, gutenLoading:false, gutenQuery:'', gutenReading:null,
      // E-book reading preferences (font size/spacing/width/paper theme/typeface),
      // applied live to the book iframe and persisted. bookToc is the detected
      // chapter list; bookProgress is the live read fraction (0–1).
      readPrefs:Object.assign({},this._defaultRead,(savedRead&&typeof savedRead==='object')?savedRead:{}), bookToc:[], tocOpen:false, bookProgress:0,
      // Auto-bookmarks: spots the reading flags as SURPRISING (connectivity + novelty).
      // bookmarkMode shows them (in-book highlight + scrollbar markers); bookmarks holds
      // the detected spots; bmRail holds their live scroll fractions for the marker rail.
      bookmarkMode:(()=>{try{return localStorage.getItem('eo_marks')==='1';}catch(e){return false;}})(), bookmarks:[], bmRail:[],
      // Panel layout: swap the left (sources/chats) and right (entities) sides.
      swapped:(()=>{try{return localStorage.getItem('eo_swap')==='1';}catch(e){return false;}})(),
      // Chat model — like the old app. Loaded lazily on first chat; grounded in what
      // you've read when relevant, a normal assistant otherwise. Falls back to a
      // structural answer if the model can't load.
      backend:(()=>{try{return localStorage.getItem('eo_backend')||'webllm';}catch(e){return 'webllm';}})(), modelStatus:'' };
  }
  // ── theme helpers ─────────────────────────────────────────────────────
  _hx(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
  mixWhite(hex,amt){const c=this._hx(hex);const m=v=>Math.round(v+(255-v)*amt);return 'rgb('+m(c.r)+','+m(c.g)+','+m(c.b)+')';}
  hexA(hex,a){const c=this._hx(hex);return 'rgba('+c.r+','+c.g+','+c.b+','+a+')';}
  curAccent(){return this.state.accent||(this.props&&this.props.accent)||'#5b34d6';}
  setAccent(hex){try{localStorage.setItem('eo_accent',hex);}catch(e){}this._decoToken=null;this.setState({accent:hex});}
  setHighlight(s){try{localStorage.setItem('eo_highlight',s);}catch(e){}this._decoToken=null;this.setState({highlightStyle:s});}
  setHoverPivot(v){try{localStorage.setItem('eo_hoverpivot',v);}catch(e){}this.setState({hoverPivot:v});}
  setClickAction(v){try{localStorage.setItem('eo_clickact',v);}catch(e){}this.setState({clickAction:v});}
  setHoverDelay(v){v=Math.max(150,Math.min(2000,+v||1100));try{localStorage.setItem('eo_hoverdelay',String(v));}catch(e){}this.setState({hoverDelay:v});}
  // ── e-book reading preferences ────────────────────────────────────────
  // Each setter persists, re-renders the toolbar, and applies the change LIVE to the
  // open book iframe via CSS variables — no reload, so scroll position and the entity
  // decoration both survive. _bookHtml seeds the same vars so a fresh open matches.
  setReadPref(patch){const rp=Object.assign({},this.state.readPrefs,patch);try{localStorage.setItem('eo_readprefs',JSON.stringify(rp));}catch(e){}this.setState({readPrefs:rp});const d=this._bookDoc();if(d)this.applyReadCSS(d,rp);}
  bumpFont(d){const rp=this.state.readPrefs;this.setReadPref({fs:Math.max(14,Math.min(30,(rp.fs||19)+d))});}
  bumpLine(d){const rp=this.state.readPrefs;this.setReadPref({lh:Math.max(1.3,Math.min(2.2,Math.round(((rp.lh||1.7)+d)*10)/10))});}
  cycleReadTheme(){const o=['light','sepia','dark'];const i=o.indexOf(this.state.readPrefs.theme||'light');this.setReadPref({theme:o[(i+1)%o.length]});}
  cycleWidth(){const o=[600,720,860];const i=o.indexOf(this.state.readPrefs.w||720);this.setReadPref({w:o[(i+1)%o.length]});}
  toggleReadFont(){this.setReadPref({font:(this.state.readPrefs.font==='sans')?'serif':'sans'});}
  _bookDoc(){const ifr=document.querySelector('iframe[data-eo-center]');return (ifr&&ifr.contentDocument)?ifr.contentDocument:null;}
  applyReadCSS(d,rp){rp=rp||this.state.readPrefs;const t=this.READ_THEMES[rp.theme]||this.READ_THEMES.light;const r=d.documentElement&&d.documentElement.style;if(!r)return;
    r.setProperty('--eo-fs',(rp.fs||19)+'px');r.setProperty('--eo-lh',String(rp.lh||1.7));r.setProperty('--eo-maxw',(rp.w||720)+'px');
    r.setProperty('--eo-ff',this.READ_FONTS[rp.font]||this.READ_FONTS.serif);
    r.setProperty('--eo-bg',t.bg);r.setProperty('--eo-fg',t.fg);r.setProperty('--eo-fg2',t.fg2);r.setProperty('--eo-rule',t.rule);r.setProperty('--eo-acc',this.curAccent());
    try{d.body.style.background=t.bg;}catch(e){}}
  // Per-book reading position: a 0–1 scroll fraction, keyed by the source url.
  _readKey(url){return 'eo_pos_'+(url||'');}
  loadReadPos(url){try{const v=localStorage.getItem(this._readKey(url));const f=v==null?0:parseFloat(v);return isFinite(f)?Math.max(0,Math.min(1,f)):0;}catch(e){return 0;}}
  saveReadPos(url,pct){try{localStorage.setItem(this._readKey(url),String(Math.max(0,Math.min(1,pct))));}catch(e){}}
  // ── document structure: found emergently, not from a keyword list ─────────
  // No vocabulary of "chapter"/"canto"/… is hardcoded (see docs/structure.md). A heading
  // is discovered as a recurring line-FORM: detectStructure groups short non-sentence lines
  // by their shape — a lead word + a numeral at a fixed position (`chapter|R@1`,
  // `canto|R@2`), markdown depth, a decimal section number — then keeps a family only when
  // its members (a) number their way through a run, (b) span the document, and (c) partition
  // it regularly and sparsely. The marker word "canto" is never matched against a list; it
  // is admitted because lines of that form recur and tile the text — the category is the
  // output of the reading, not its input. When no form recurs, sections fall back to the
  // engine's projected entity field. The same boundaries let the cursor move by section.
  _roman(r){if(!/^[ivxlcdm]+$/i.test(r))return null;const m={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let n=0;r=String(r).toUpperCase();for(let i=0;i<r.length;i++){const a=m[r[i]],b=m[r[i+1]];if(b&&a<b){n+=b-a;i++;}else n+=a;}return n;}
  _sentencey(t){return /[.!?]["')”]?$/.test(t)&&(t.match(/\b[a-z]{2,}\b/g)||[]).length>=2;}
  // Classify a short line by FORM only. Returns {fam,kind,level,val,label} or null. The
  // family key carries the lead word + numeral position so a real chapter line groups apart
  // from a caption that merely mentions the word ("Heading to Chapter I. 1").
  _lineForm(t){t=this.norm(t);if(t.length<1||t.length>72)return null;const words=t.split(/\s+/);if(words.length>9)return null;
    const md=t.match(/^(#{1,6})\s+(\S.*)$/);if(md)return {fam:'md'+md[1].length,kind:'decl',level:md[1].length,label:md[2].replace(/\s*#+$/,'')};
    if(this._sentencey(t))return null;
    let idx=-1,cls=null,depth=1,val=null;
    for(let k=0;k<words.length;k++){const w=words[k].replace(/^[^\w#]+|[^\w]+$/g,'');
      if(k===0&&/^\d+(?:\.\d+)+$/.test(w)&&w.split('.').every(x=>+x<=400)){idx=k;cls='D';depth=w.split('.').length;break;}
      if(/^\d{1,3}$/.test(w)){idx=k;cls='N';val=+w;break;}
      const r=this._roman(w);if(r!=null){idx=k;cls='R';val=r;break;}}
    if(idx>=0){const before=idx>0?words[idx-1].replace(/[^A-Za-z]/g,'').toLowerCase():'';
      return cls==='D'?{fam:'dec',kind:'decl',level:depth,label:t}:{fam:before+'|'+cls+'@'+idx,kind:'num',level:1,val,label:t};}
    const caps=/[A-Z]/.test(t)&&!/[a-z]/.test(t);
    const titled=words.filter(w=>/^[“"(]?[A-Z]/.test(w)).length>=Math.max(1,Math.ceil(words.length*0.6));
    if(caps)return {fam:'CAPS',kind:'shape',label:t};
    if(titled)return {fam:'TITLE',kind:'shape',label:t};
    return null;}
  // A short line with no terminal punctuation reads as a title — used to snap an emergent
  // boundary onto the title line that introduces it.
  _titleish(s){s=this.norm(s);return s.length>=2&&s.length<=52&&!/[.!?:;,]$/.test(s)&&s.split(' ').length<=9;}
  _secLabel(ent,para){if(ent){try{const l=this.labelOf(ent);if(l)return '§ '+l;}catch(e){}return '§ '+ent;}return '§ '+this.norm(para).slice(0,40);}
  // ── auto-bookmarks: where the reading is SURPRISED ───────────────────────
  // A spot is important when the entity field does something it couldn't predict —
  // chiefly CONNECTIVITY SURPRISE: two entities that were each already established meet
  // for the FIRST time (a collision of threads — a meeting, a letter, a reveal). Plus a
  // lighter NOVELTY term (an important entity first appears). Both are read off the same
  // per-paragraph projection the TOC uses; the salient paragraphs are those whose score
  // stands well above the book's own background (mean + 1.2σ), spaced out and capped.
  detectBookmarks(p,paras){
    const N=paras.length;if(N<6)return [];
    const sets=this._paraField(p,paras);
    const total=new Map();sets.forEach(s=>s.forEach(e=>total.set(e,(total.get(e)||0)+1)));
    const fw=e=>Math.log1p(total.get(e)||1);
    const seen=new Map(),pairs=new Set(),score=new Array(N).fill(0),why=new Array(N).fill(null);
    for(let i=0;i<N;i++){const cur=[...sets[i]];let nov=0,con=0,bestPair=null,bestNew=null;
      for(const e of cur){if(!seen.has(e)){const w=fw(e);nov+=w;if(!bestNew||w>fw(bestNew))bestNew=e;}}
      for(let a=0;a<cur.length;a++)for(let b=a+1;b<cur.length;b++){const x=cur[a],y=cur[b];
        if((seen.get(x)||0)>=2&&(seen.get(y)||0)>=2){const key=x<y?x+''+y:y+''+x;
          if(!pairs.has(key)){pairs.add(key);const w=Math.min(fw(x),fw(y));con+=w;if(!bestPair||w>bestPair.w)bestPair={x,y,w};}}}
      score[i]=2*con+0.6*nov;
      why[i]=(bestPair&&2*con>=0.6*nov)?{pair:[bestPair.x,bestPair.y]}:(bestNew?{enter:bestNew}:null);
      for(const e of cur)seen.set(e,(seen.get(e)||0)+1);}
    const mean=score.reduce((a,b)=>a+b,0)/N,sd=Math.sqrt(score.reduce((a,b)=>a+(b-mean)*(b-mean),0)/N)||1;
    const thr=mean+1.2*sd,cand=[];for(let i=0;i<N;i++)if(score[i]>thr&&score[i]>0)cand.push({i,s:score[i],why:why[i]});
    cand.sort((a,b)=>b.s-a.s);const gap=Math.max(3,Math.round(N/50)),pick=[];
    for(const c of cand){if(pick.every(q=>Math.abs(q.i-c.i)>=gap))pick.push(c);if(pick.length>=12)break;}
    pick.sort((a,b)=>a.i-b.i);
    return pick.map(c=>({paraIndex:c.i,why:this._whyLabel(c.why)}));
  }
  // A reason worth showing only when it reads as proper, recurring names — the parse picks
  // up archaic pronouns / common nouns, so gate on capitalization, length and recurrence.
  _whyLabel(why){if(!why)return '';
    const ok=id=>{let l;try{l=this.labelOf(id);}catch(e){l=id;}if(!l)return null;
      const t=this.norm(l);if(t.length<3||!/^[A-Z]/.test(t)||this.STOP.has(t.toLowerCase()))return null;
      const g=this.graph&&this.graph.entities.get(id);if(g&&(g.sightings||0)<2)return null;return t;};
    if(why.pair){const a=ok(why.pair[0]),b=ok(why.pair[1]);return a&&b?(a+' · '+b):(a||b||'');}
    if(why.enter){const a=ok(why.enter);return a?a:'';}
    return '';}
  toggleBookmarks(){const v=!this.state.bookmarkMode;try{localStorage.setItem('eo_marks',v?'1':'0');}catch(e){}
    const d=this._bookDoc();if(d&&d.documentElement)d.documentElement.classList.toggle('eo-bm-on',v);
    this.setState({bookmarkMode:v});}
  gotoBookmark(id){const d=this._bookDoc();if(!d)return;const el=d.getElementById(id),win=d.defaultView;
    if(el&&win){const top=el.getBoundingClientRect().top+win.scrollY-Math.round(win.innerHeight*0.18);try{win.scrollTo({top:Math.max(0,top),behavior:'smooth'});}catch(e){win.scrollTo(0,Math.max(0,top));}}}
  // Hop to the previous / next flagged moment from where we're reading now. Turns the marks
  // on if they're off, so the button always lands you on a visible highlight.
  jumpMark(dir){const d=this._bookDoc();if(!d||!d.defaultView)return;const win=d.defaultView;
    if(!this.state.bookmarkMode)this.toggleBookmarks();
    const margin=Math.round(win.innerHeight*0.18);
    const tops=(this.state.bookmarks||[]).map(b=>{const el=d.getElementById(b.id);return el?el.getBoundingClientRect().top+win.scrollY:null;}).filter(v=>v!=null).sort((a,b)=>a-b);
    if(!tops.length)return;const cur=win.scrollY+margin+6;let target=null;
    if(dir>0){for(const t of tops){if(t>cur){target=t;break;}}if(target==null)target=tops[tops.length-1];}
    else{for(let k=tops.length-1;k>=0;k--){if(tops[k]<cur-2){target=tops[k];break;}}if(target==null)target=tops[0];}
    const top=Math.max(0,target-margin);try{win.scrollTo({top,behavior:'smooth'});}catch(e){win.scrollTo(0,top);}}
  // Compute the live scroll fraction of each bookmarked element for the marker rail.
  _bookmarkRail(d){if(!d)return [];const h=(d.documentElement.scrollHeight||d.body.scrollHeight||1);
    return (this.state.bookmarks||[]).map(b=>{const el=d.getElementById(b.id);if(!el)return null;
      return {frac:Math.max(0,Math.min(1,(el.offsetTop)/h)),id:b.id,why:b.why};}).filter(Boolean);}
  // Entity set per paragraph, reusing the master projection (no re-parse): map each
  // event's global sentence index back to this page, then to a paragraph by normalized
  // char offsets, collapsing coref via the graph's representative.
  _paraField(p,paras){
    const sents=p.sentences||[],base=p.sentStart||0,sets=paras.map(()=>new Set());
    if(!this.master||!sents.length)return sets;
    const rep=id=>{try{return (this.graph&&this.graph.representative)?this.graph.representative(id):id;}catch(e){return id;}};
    const joined=paras.join(' '),pr=[];{let c=0;for(const t of paras){pr.push([c,c+t.length]);c+=t.length+1;}}
    const offs=[];{let cur=0;for(const s of sents){const q=this.norm(s),probe=q.slice(0,Math.min(28,q.length));let i=probe?joined.indexOf(probe,cur):-1;if(i<0)i=cur;offs.push(i);cur=Math.max(cur,i+q.length);}}
    const paraOf=li=>{const o=offs[li];if(o==null)return Math.min(paras.length-1,Math.max(0,Math.round(li*paras.length/Math.max(1,sents.length))));for(let k=0;k<pr.length;k++)if(o>=pr[k][0]&&o<=pr[k][1])return k;return paras.length-1;};
    for(const e of this.master.events){if(e.__page!==p.url||e.sentIdx==null)continue;const li=e.sentIdx-base;if(li<0||li>=sents.length)continue;const pk=paraOf(li);for(const x of [e.id,e.src,e.tgt].filter(Boolean))sets[pk].add(rep(x));}
    return sets;}
  // → [{paraIndex,label,kind:'heading'|'emergent',level}] in reading order.
  detectStructure(p,paras){
    const N=paras.length;
    // 1) EMERGENT marker-form discovery — group short lines by their FORM, keep families
    //    that recur, number through a run, span the doc, and tile it regularly & sparsely.
    const cand=[];paras.forEach((t,i)=>{const f=this._lineForm(t);if(f)cand.push(Object.assign(f,{i}));});
    const byFam=new Map();cand.forEach(c=>{if(!byFam.has(c.fam))byFam.set(c.fam,[]);byFam.get(c.fam).push(c);});
    const fams=[];
    for(const [fam,M] of byFam){const idxs=M.map(c=>c.i),n=idxs.length;
      const coverage=n<2?0:(idxs[n-1]-idxs[0])/Math.max(1,N-1);
      const gaps=[];for(let k=1;k<n;k++)gaps.push(idxs[k]-idxs[k-1]);
      const mean=gaps.reduce((a,b)=>a+b,0)/(gaps.length||1);
      const cov=gaps.length?Math.sqrt(gaps.reduce((a,b)=>a+(b-mean)*(b-mean),0)/gaps.length)/Math.max(1,mean):0;
      const empty=/^\|[NR]@/.test(fam);
      let gs=1;if(M[0].kind==='num'){const v=M.map(c=>c.val);let g=0;for(let k=1;k<v.length;k++){const s=v[k]-v[k-1];if(s===1||(s<0&&v[k]<=3))g++;}gs=v.length>1?g/(v.length-1):0;}
      fams.push({fam,M,kind:M[0].kind,n,coverage,cov,density:n/N,empty,gs});}
    // Numbered families: a recurring lead-form whose numerals run (consecutive or reset),
    //   spanning the doc, regular, and SPARSE (a page-footer/glossary is too dense).
    // Declared markup (markdown/decimal) is the author's own structure — honored.
    let acc=fams.filter(f=>f.kind==='num'?(f.n>=3&&f.coverage>=0.55&&f.cov<=1.0&&f.density<=0.06&&f.gs>=(f.empty?0.8:0.7))
      :f.kind==='decl'?(/^md/.test(f.fam)?f.n>=1:(f.n>=3&&f.coverage>=0.3&&f.cov<=1.6)):false);
    // Shape-only families (titles/all-caps, no numbering) only as a last resort, strict —
    // else a dictionary's example names or an anthology's titles would hallucinate a TOC.
    if(!acc.length)acc=fams.filter(f=>f.kind==='shape'&&f.n>=3&&f.coverage>=0.6&&f.cov<=0.55&&f.density<=0.08);
    if(acc.length){
      const infs=acc.filter(f=>f.kind!=='decl').sort((a,b)=>a.density-b.density);const rank=new Map();infs.forEach((f,r)=>rank.set(f.fam,r+1));
      const secs=[];for(const f of acc)for(const c of f.M){const level=f.kind==='decl'?(c.level||1):(rank.get(f.fam)||1);
        secs.push({paraIndex:c.i,label:this.norm(c.label).slice(0,72),kind:'heading',level});}
      secs.sort((a,b)=>a.paraIndex-b.paraIndex);const seen=new Set(),out=[];for(const s of secs){if(seen.has(s.paraIndex))continue;seen.add(s.paraIndex);out.push(s);}
      return out;
    }
    // 2) FALLBACK — the engine's projected entity field. Sections emerge where the field
    //    shifts and persists across a window; a contrast guard refuses uniformly-choppy
    //    docs (glossaries/anthologies). This carries short heading-less texts; on long
    //    books the field is too sparse, which is why form-discovery leads.
    const sets=this._paraField(p,paras),W=Math.max(2,Math.round(N/24));
    const win=(lo,hi)=>{const s=new Set();for(let k=Math.max(0,lo);k<Math.min(N,hi);k++)for(const e of sets[k])s.add(e);return s;};
    const peaks=[];let valid=0,deep=0;
    for(let i=1;i<N;i++){const L=win(i-W,i),R=win(i,i+W);if(L.size<2||R.size<2)continue;valid++;let x=0;for(const e of L)if(R.has(e))x++;const d=1-x/Math.sqrt(L.size*R.size);if(d>0.6){deep++;peaks.push({i,d});}}
    if(valid>=8&&deep/valid>0.5)return [];                       // uniformly choppy → no structure
    peaks.sort((a,b)=>b.d-a.d);
    const minGap=Math.max(2,Math.round(N/40)),chosen=[];
    for(const pk of peaks){if(chosen.every(k=>Math.abs(k-pk.i)>=minGap))chosen.push(pk.i);if(chosen.length>=40)break;}
    if(!chosen.length)return [];
    chosen.sort((a,b)=>a-b);
    if(this._titleish(paras[0])&&chosen[0]>0)chosen.unshift(0);
    const seen=new Set(),out=[];
    for(const i of chosen){let anchor=i,label;
      if(i>0&&this._titleish(paras[i-1])&&!this._lineForm(paras[i-1])){anchor=i-1;label=this.norm(paras[i-1]).slice(0,72);}
      else if(this._titleish(paras[i])){label=this.norm(paras[i]).slice(0,72);}
      else {const nw=[...sets[i]].filter(e=>i>0&&!sets[i-1].has(e));label=this._secLabel(nw[0]||[...sets[i]][0],paras[i]);}
      if(seen.has(anchor))continue;seen.add(anchor);out.push({paraIndex:anchor,label,kind:'emergent',level:1});}
    return out;}
  // Set up the open book iframe once: apply the reading CSS, restore the saved scroll
  // position, and track progress as the reader scrolls (throttled).
  _setupBook(d,ifr,url){if(!d||!d.defaultView)return;this.applyReadCSS(d,this.state.readPrefs);
    if(d.documentElement)d.documentElement.classList.toggle('eo-bm-on',!!this.state.bookmarkMode);
    if(d.__eoBookUrl===url)return;d.__eoBookUrl=url;const win=d.defaultView;
    // Once the book is laid out, read each bookmark's scroll fraction for the marker rail.
    if((this.state.bookmarks||[]).length){let n=0;const railTick=()=>{if(d.__eoBookUrl!==url)return;const h=d.documentElement.scrollHeight||d.body.scrollHeight||0;if(h>win.innerHeight||n++>25){const r=this._bookmarkRail(d);if(r.length)this.setState({bmRail:r});}else setTimeout(railTick,70);};setTimeout(railTick,80);}
    const pos=this.loadReadPos(url);
    if(pos>0){let n=0;const tryScroll=()=>{if(d.__eoBookUrl!==url)return;const max=Math.max(1,(d.documentElement.scrollHeight||d.body.scrollHeight||0)-win.innerHeight);if(max>40||n++>25){win.scrollTo(0,pos*max);}else{setTimeout(tryScroll,60);}};setTimeout(tryScroll,60);}
    const onScroll=()=>{const max=Math.max(1,(d.documentElement.scrollHeight||d.body.scrollHeight||0)-win.innerHeight);this._lastPct=Math.max(0,Math.min(1,win.scrollY/max));
      if(this._scrollT)return;this._scrollT=setTimeout(()=>{this._scrollT=null;const pct=this._lastPct;this.saveReadPos(url,pct);if(Math.abs((this.state.bookProgress||0)-pct)>=0.005)this.setState({bookProgress:pct});},150);};
    win.addEventListener('scroll',onScroll,{passive:true});}
  // ── native page: the reading layer laid over the REAL page ────────────────
  // Same contents nav + flagged passages the book view gets, but built against the live
  // DOM instead of a re-rendered book: headings become the TOC, the engine's flagged
  // passages are matched onto the page's own blocks and highlighted in place.
  _setupNative(d,ifr,url){if(!d||!d.defaultView||!d.body)return;const win=d.defaultView;
    // Re-synced every pass: the ❖ reveal class, and the highlight CSS (so a live accent
    // change repaints the marks, matching how the entity styles are rebuilt each pass).
    if(d.documentElement)d.documentElement.classList.toggle('eo-bm-on',!!this.state.bookmarkMode);
    this._injectMarkCSS(d);
    if(d.__eoNativeUrl===url)return;
    // Defer until the body actually has content (scripts were stripped; layout may lag).
    let n=0;const build=()=>{
      if(this.state.viewUrl!==url||this.state.bookView)return;        // navigated away / switched to reader
      const ifr2=document.querySelector('iframe[data-eo-center]'),dd=ifr2&&ifr2.contentDocument;
      if(!dd||dd!==d)return;                                          // the doc was swapped under us
      if((!d.body||d.body.childNodes.length<3)&&n++<25){setTimeout(build,90);return;}
      d.__eoNativeUrl=url;
      const toc=this._nativeTOC(d),marks=this._nativeMarks(d,url);
      this.setState({bookToc:toc,bookmarks:marks,bmRail:[]});
      this._trackNativeScroll(d,url);
    };
    setTimeout(build,60);}
  // The flagged-passage styles the book HTML carries inline — a live page has none, so
  // inject them (keyed to the live accent). Inert until html.eo-bm-on (the ❖ toggle).
  _injectMarkCSS(d){let st=d.getElementById('__eo_marks');if(!st){st=d.createElement('style');st.id='__eo_marks';(d.head||d.documentElement).appendChild(st);}
    const a=this.curAccent();
    st.textContent='.eo-bm{scroll-margin-top:18px;border-radius:0 6px 6px 0;transition:background .2s,box-shadow .2s;}'+
      'html.eo-bm-on .eo-bm{background:'+this.hexA(a,.12)+';box-shadow:inset 3px 0 0 '+a+';padding:.45em .75em;}'+
      'html.eo-bm-on .eo-bm[data-eo-why]:not([data-eo-why=""])::before{content:"\\2756 " attr(data-eo-why);display:block;font:700 .62em/1.3 -apple-system,BlinkMacSystemFont,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:'+a+';margin-bottom:.35em;}';}
  // Build the contents from the page's OWN headings: skip chrome, dedupe, give each an
  // eo-ch- id so the existing Contents menu + ⏮/⏭ section jumps drive the native page too.
  _nativeTOC(d){const out=[],seen=new Set();let n=0;
    d.querySelectorAll('h1,h2,h3,h4').forEach(h=>{
      if(h.closest('nav,header,footer,aside'))return;
      const label=this.norm(h.textContent||'');if(label.length<2||label.length>90)return;
      const key=label.toLowerCase();if(seen.has(key))return;seen.add(key);
      const lv=Math.min(3,Math.max(1,(+h.tagName.slice(1)||1)));
      const id='eo-ch-'+n;h.id=id;out.push({id,label,level:lv});n++;});
    return (out.length>=2&&out.length<=80)?out:[];}
  // Lay the engine's flagged passages onto the live DOM: for each, find the first unused
  // content block whose text contains the passage's opening, tag it eo-bm + its "why".
  // A passage that finds no confident match is skipped — better absent than mislocated.
  _nativeMarks(d,url){const p=this.pageOf(url);if(!p)return [];
    const flags=this._pageFlags(p);if(!flags.length)return [];
    const norm=s=>this.norm(String(s||'')).toLowerCase();
    const blocks=[...d.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,td,dd')].filter(el=>!el.closest('nav,header,footer,aside')&&(el.textContent||'').trim().length>=24);
    const used=new Set(),marks=[];let n=0;
    for(const f of flags){const probe=norm(f.text).slice(0,40);if(probe.length<24)continue;
      let hit=null;for(const el of blocks){if(used.has(el))continue;if(norm(el.textContent).indexOf(probe)>=0){hit=el;break;}}
      if(!hit)continue;used.add(hit);
      if(!hit.id)hit.id='eo-bm-'+n;hit.classList.add('eo-bm');if(f.why)hit.setAttribute('data-eo-why',f.why);
      marks.push({id:hit.id,why:f.why,paraIndex:n});n++;}
    return marks;}
  // Progress + the marker rail for the native page (the book path's _setupBook tail, minus
  // the e-reader CSS, which doesn't apply to a page rendered in its own styles).
  _trackNativeScroll(d,url){if(!d||!d.defaultView)return;const win=d.defaultView;
    if(d.__eoNativeScroll===url)return;d.__eoNativeScroll=url;
    if((this.state.bookmarks||[]).length){let n=0;const railTick=()=>{if(d.__eoNativeScroll!==url||this.state.viewUrl!==url)return;const h=d.documentElement.scrollHeight||d.body.scrollHeight||0;if(h>win.innerHeight||n++>25){const r=this._bookmarkRail(d);if(r.length)this.setState({bmRail:r});}else setTimeout(railTick,80);};setTimeout(railTick,90);}
    const pos=this.loadReadPos(url);
    if(pos>0){let n=0;const tryScroll=()=>{if(d.__eoNativeScroll!==url)return;const max=Math.max(1,(d.documentElement.scrollHeight||d.body.scrollHeight||0)-win.innerHeight);if(max>40||n++>25){win.scrollTo(0,pos*max);}else setTimeout(tryScroll,70);};setTimeout(tryScroll,70);}
    const onScroll=()=>{const max=Math.max(1,(d.documentElement.scrollHeight||d.body.scrollHeight||0)-win.innerHeight);this._lastPct=Math.max(0,Math.min(1,win.scrollY/max));
      if(this._scrollT)return;this._scrollT=setTimeout(()=>{this._scrollT=null;const pct=this._lastPct;this.saveReadPos(url,pct);if(Math.abs((this.state.bookProgress||0)-pct)>=0.005)this.setState({bookProgress:pct});},150);};
    win.addEventListener('scroll',onScroll,{passive:true});}
  gotoChapter(id){const d=this._bookDoc();if(!d)return;const el=d.getElementById(id),win=d.defaultView;if(el&&win){const top=el.getBoundingClientRect().top+win.scrollY-14;try{win.scrollTo({top,behavior:'smooth'});}catch(e){win.scrollTo(0,top);}}this.setState({tocOpen:false});}
  // Section anchors (their document tops), in reading order — the cursor's structural stops.
  _sectionTops(){const d=this._bookDoc();if(!d||!d.defaultView)return [];const win=d.defaultView,out=[];
    d.querySelectorAll('[id^="eo-ch-"]').forEach(el=>out.push(el.getBoundingClientRect().top+win.scrollY));
    return out.sort((a,b)=>a-b);}
  // Move the cursor by structural unit: from the section we're in now, step to the
  // previous / next boundary (dir<0 back, dir>0 forward). Index-based so the landing
  // offset can't make "next" re-find the section we just jumped to.
  jumpSection(dir){const d=this._bookDoc();if(!d||!d.defaultView)return;const win=d.defaultView,tops=this._sectionTops();if(!tops.length)return;
    const y=win.scrollY+20;let cur=-1;for(let i=0;i<tops.length;i++){if(tops[i]<=y)cur=i;else break;}
    const ni=cur+(dir>0?1:-1);
    if(dir>0){if(ni>=tops.length)return;}
    else if(ni<0){if(win.scrollY>6){try{win.scrollTo({top:0,behavior:'smooth'});}catch(e){win.scrollTo(0,0);}}return;}
    const target=Math.max(0,tops[ni]-14);try{win.scrollTo({top:target,behavior:'smooth'});}catch(e){win.scrollTo(0,target);}}
  toggleTOC(){this.setState(s=>({tocOpen:!s.tocOpen}));}
  // Flip how a read source renders — stripped READER book vs the NATIVE page — and
  // re-render the open view in the new mode. The choice is a persisted preference, so
  // every page you open afterwards honors it. _pageUrl is cleared so loadCenter doesn't
  // short-circuit on the page it already has up.
  toggleViewMode(){const mode=this.state.viewMode==='native'?'reader':'native';
    try{localStorage.setItem('eo_viewmode',mode);}catch(e){}
    this._pageUrl=null;
    this.setState({viewMode:mode,tocOpen:false},()=>{if(this.state.viewUrl&&!/^text:/i.test(this.state.viewUrl))this.loadCenter(this.state.viewUrl);});}
  // Set the reader/native default WITHOUT a page open (the new-tab chooser). Persists the
  // preference so the next website you open honors it — a native page renders live; a reader
  // page is stripped to clean prose once it's read. If a page IS open, re-render it in the
  // new mode too (so the chooser feels live even when a tab is up).
  setViewModePref(mode){mode=(mode==='reader')?'reader':'native';
    try{localStorage.setItem('eo_viewmode',mode);}catch(e){}
    this._pageUrl=null;
    this.setState({viewMode:mode},()=>{if(this.state.viewUrl&&!/^text:/i.test(this.state.viewUrl))this.loadCenter(this.state.viewUrl);});}
  // The new-tab / empty-state landing view-model: names the three kinds a tab can be (chat,
  // live website, reader-view page), makes the reader/live choice explicit up front, and
  // offers a few starters. Shared by the first-run empty state and the "+" new-tab surface.
  landingVals(base){
    const err=this.state.engineErr,ready=this.state.ready;
    base.showPrompt=true;base.newTabLanding=true;
    base.promptTitle=err?'Engine failed to load':(ready?'New tab':'Loading the reading engine…');
    base.promptBody=err?String(err):'Type a URL or a search in the bar above — or start below.';
    base.suggestions=this.SUGG.map(s=>({label:s.label,onPick:s.book?(()=>this.readGutenberg(s.book)):(()=>{this.setState({url:s.url});setTimeout(()=>this.doReadUrl(),20);})}));
    const reader=this.state.viewMode==='reader';
    base.landingModeReader=reader;base.landingModeNative=!reader;
    base.onLandingPage=()=>this.setViewModePref('native');
    base.onLandingReader=()=>this.setViewModePref('reader');
    const seg=on=>'text-align:center;font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:6px;cursor:pointer;'+(on?'background:var(--card);color:var(--acc);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);');
    base.landingModePageStyle=seg(!reader);base.landingModeReaderStyle=seg(reader);
    base.ent={name:'',gist:'',av:'',avStyle:'',meta:{sightings:0}};
    return base;}
  toggleSettings(){this.setState(s=>({settingsOpen:!s.settingsOpen}));}
  closeSettings(){this.setState({settingsOpen:false});}
  toggleAudit(){const v=!this.state.auditMode;try{localStorage.setItem('eo_audit',v?'1':'0');}catch(e){}this.setState({auditMode:v});}
  // ── audit helpers: term sets + fold↔wiki referent comparison ──────────
  auditTerms(s){const out=new Set();String(s||'').toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{if(w.length>=4&&!this.STOP.has(w))out.add(w);});return out;}
  defCompare(fold,wiki){const A=this.auditTerms(fold),B=this.auditTerms(wiki);if(!A.size||!B.size)return null;
    const shared=[...A].filter(w=>B.has(w)),aOnly=[...A].filter(w=>!B.has(w)),bOnly=[...B].filter(w=>!A.has(w));
    const uni=new Set([...A,...B]);return {pct:Math.round(100*shared.length/uni.size),shared,aOnly,bOnly};}

  async componentDidMount(){
    // A debug/audit handle on the live instance — the headless smoke (eoreader4-eval/
    // reader-discourse.drive.mjs) drives sendChat through it, and a user can call
    // window.__eoApp.exportChatAudit() from the console.
    if(typeof window!=='undefined')window.__eoApp=this;
    const __res=(typeof window!=='undefined'&&window.__resources)||{};
    try{ this.E=await import(__res.eoEngine||'./eoreader4-bundle.js'); }
    catch(e){ this.setState({ready:true,engineErr:String(e)}); return; }
    // Seed an EMPTY memory so this.master/this.graph exist before anything is read. Without it
    // the graph is undefined on a fresh session, and any path that reads it before the first
    // page is folded (the curiosity walk's entity-count, feed research) throws. rebuild([]) is
    // the same call tossPage makes when the last source is removed, so it is known-safe empty.
    try{ this.rebuild([]); }catch(e){}
    try{ this.SVO=await import(__res.eoSvo||'./svo-llm.js'); }catch(e){ this.SVO=null; }
    const llmAvail=!!(this.SVO && typeof window!=='undefined' && window.claude && typeof window.claude.complete==='function');
    this.setState({ready:true, llmAvail, llm:llmAvail});
    // Start the chat model downloading immediately so it's ready by the time the first
    // question is asked (progress is throttled in ensureChatModel to keep typing smooth).
    if(this.state.backend!=='echo') this.ensureChatModel().catch(()=>{});
    // An explicit seed URL reads on load; otherwise we stay empty and just OFFER a random
    // Wikipedia page + a few random English books as suggestions (loaded only when clicked).
    const seed=(this.props&&this.props.seedUrl);
    if(seed) this.readURL(seed,'read');
    else this.loadSuggestions();
    // Track viewport width so the layout engine can pick its tier. A 40px threshold
    // keeps a browser-resize drag from flooding setState; gridCols re-reads vw on render.
    if(typeof window!=='undefined'){
      this._onResize=()=>{const w=window.innerWidth;if(Math.abs(w-(this.state.vw||0))>=40)this.setState({vw:w});};
      window.addEventListener('resize',this._onResize,{passive:true});
    }
    this._initCiteHover();
  }
  componentWillUnmount(){
    if(this._onResize&&typeof window!=='undefined') window.removeEventListener('resize',this._onResize);
    if(this._citeHoverInit){document.removeEventListener('mouseover',this._onCiteOver);document.removeEventListener('mouseout',this._onCiteOut);}
    if(this._citeCard&&this._citeCard.parentNode)this._citeCard.parentNode.removeChild(this._citeCard);
  }
  // ── Responsive tiers ──────────────────────────────────────────────────────
  // Wide (≥1180): chat can dock as its own column. Mid (760–1179): chat reverts to the
  // overlay drawer. Phone (<760): single pane with a bottom nav. One source of truth.
  narrow(){return (this.state.vw||1400) < 1180;}
  phone(){return (this.state.vw||1400) < 760;}
  setPane(p){this.setState({pane:p});}
  // ── Default suggestions: a random Wikipedia page + a few random English books ──
  // Nothing is read on load — the start screen stays empty (like before, with the
  // Great Barrier Reef suggestion), only now the suggestions are RANDOM: one Wikipedia
  // article and a few English Project Gutenberg books, each loaded only when clicked.
  async loadSuggestions(){
    const sugg=[];
    try{
      const j=await this._wikiJSON('https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*');
      const r=j&&j.query&&j.query.random&&j.query.random[0];
      if(r&&r.title){
        const url='https://en.wikipedia.org/wiki/'+encodeURIComponent(String(r.title).replace(/ /g,'_'));
        sugg.push({label:r.title+' (Wikipedia)',url});
      }
    }catch(e){}
    try{(await this.randomBooks(2)).forEach(b=>sugg.push({label:b.title+' — '+this.authorDisplay(b.author),book:b}));}catch(e){}
    if(sugg.length){this.SUGG=sugg;this.setState(s=>({rev:s.rev+1}));}
  }
  // Fetch a handful of random ENGLISH Gutenberg books (no reading) for the suggestions.
  // A random page of the catalog gives variety; we shuffle and keep the first N with text.
  async randomBooks(n){
    n=n||3;
    const page=1+Math.floor(Math.random()*40);
    let data;
    try{const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent('https://gutendex.com/books/?languages=en&page='+page));if(!r.ok)throw new Error('HTTP '+r.status);data=JSON.parse(await r.text());}
    catch(e){return [];}
    const books=this._gutenBooks(data);
    for(let i=books.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=books[i];books[i]=books[j];books[j]=t;}
    return books.slice(0,n);
  }

  norm(s){return (s||'').replace(/\s+/g,' ').trim();}
  // Like norm, but PRESERVES line structure — for the model's markdown chat replies, where
  // newlines carry paragraph/list breaks that _md turns into block tags. Collapses only
  // horizontal whitespace, trims each line, and caps blank runs at one (paragraph) gap.
  normMd(s){return String(s||'').replace(/\r\n?/g,'\n').replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
  short(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return String(u).slice(0,30);}}
  // Humanize a publisher host into a readable VOICE name — "en.wikipedia.org" → "Wikipedia".
  // A take is subjective: it has to be FROM somebody. When no person/org is cited inside
  // the text, the publisher itself is the voice making the claim, so it must read like a name.
  voicePretty(host){
    const h=String(host||'').replace(/^www\./,'').toLowerCase();
    const map={'wikipedia.org':'Wikipedia','wikiquote.org':'Wikiquote','wiktionary.org':'Wiktionary','britannica.com':'Britannica','nytimes.com':'The New York Times','washingtonpost.com':'The Washington Post','theguardian.com':'The Guardian','bbc.com':'BBC','bbc.co.uk':'BBC','reuters.com':'Reuters','apnews.com':'Associated Press','npr.org':'NPR','nature.com':'Nature','sciencemag.org':'Science','nasa.gov':'NASA','noaa.gov':'NOAA','who.int':'the WHO','un.org':'the UN','unesco.org':'UNESCO','cnn.com':'CNN','forbes.com':'Forbes','economist.com':'The Economist','wsj.com':'The Wall Street Journal','ft.com':'Financial Times','nationalgeographic.com':'National Geographic','smithsonianmag.com':'Smithsonian','scientificamerican.com':'Scientific American'};
    for(const k in map){if(h===k||h.endsWith('.'+k))return map[k];}
    const core=h.replace(/\.(com|org|net|edu|gov|io|co|info|us|uk)(\.[a-z]{2})?$/,'').split('.').pop()||h;
    return core.charAt(0).toUpperCase()+core.slice(1);
  }
  // ── relation verb → grammatical 3rd-person-singular predicate so the
  // neighbour list reads "barrier reef becomes", not "barrier reef become". ─
  relVerb(v){
    v=this.norm(v||'').toLowerCase();if(!v)return 'related to';
    const parts=v.split(/\s+/);let w=parts[0];
    const IRR={be:'is',have:'has',do:'does',go:'goes',say:'says',is:'is',are:'are',was:'was',were:'were'};
    const skip=/(s|x)$|ed$|ing$|^(related|named|based|owned|led|founded|run|met|known|near|part|within|inside|amid|under|over|with|to|from|of|by|at|in|on|like|as)$/;
    if(IRR[w])w=IRR[w];
    else if(!skip.test(w)){
      if(/[^aeiou]y$/.test(w))w=w.slice(0,-1)+'ies';
      else if(/(ch|sh|ss|x|z|o)$/.test(w))w=w+'es';
      else w=w+'s';
    }
    parts[0]=w;return parts.join(' ');
  }
  initials(n){return this.norm(n).replace(/[()]/g,'').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';}
  hashColor(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return this.PALETTE[h%this.PALETTE.length];}
  fmtTime(ts){try{return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}
  isURLish(l){l=String(l||'');return /^https?:\/\//i.test(l)||/\/\//.test(l)||/^www\./i.test(l)||l.length>64;}
  junkRel(v){if(v==null)return true;v=String(v).toLowerCase().trim();if(this.STOP.has(v))return true;if(v.replace(/[^a-z]/gi,'').length<2)return true;return false;}

  extract(raw,ctype,url){
    const head=String(raw||'').slice(0,3000);
    const looksHtml=/<\s*(!doctype|html|body|article|main|div|p|h[1-6]|table|section|span)\b/i.test(head);
    if((ctype&&/text\/plain/i.test(ctype))||!looksHtml){ return this.extractPlain(raw); }
    const doc=new DOMParser().parseFromString(raw,'text/html');
    let image=this._ogImage(doc); if(image&&url){try{image=new URL(image,url).href;}catch(e){}}
    doc.querySelectorAll('script,style,nav,footer,header,aside,noscript,form,iframe,svg,button,textarea,label,select,template').forEach(n=>n.remove());
    // Newsroom chrome by class/id: audio-player embeds, newsletter sign-ups, share/social
    // bars, "related stories" rails. These leak markup ("Embed <iframe …>") and boilerplate
    // ("Download Embed Embed", "Stay up to date with our newsletter") into the read text.
    doc.querySelectorAll('[class],[id]').forEach(n=>{const k=((n.getAttribute('class')||'')+' '+(n.getAttribute('id')||'')).toLowerCase();
      if(/(^|[-_ ])(embed|newsletter|subscribe|share|social|related|promo|advert|paywall|player|disqus|comments?)([-_ ]|$)/.test(k))n.remove();});
    const title=this.norm((doc.querySelector('title')||{}).textContent||'')||'(untitled)';
    const main=doc.querySelector('main,article,[role=main]')||doc.body||doc.documentElement;
    // The page's own hyperlinks are ground truth: each <a> to a Wikipedia article tells
    // us BOTH that its text is an entity of interest AND exactly which article it means.
    // We bind to this directly later — no searching, no guessing (CNN → /wiki/CNN, never CNN+).
    const wikiLinks={};
    main.querySelectorAll('a[href]').forEach(a=>{
      let href=a.getAttribute('href')||'';if(!href||href[0]==='#')return;
      try{href=new URL(href,url||'https://en.wikipedia.org/').href;}catch(e){return;}
      const base=href.split('#')[0].split('?')[0];
      const m=base.match(/^https?:\/\/[a-z.]*wikipedia\.org\/wiki\/([^:]+)$/i);if(!m)return;
      const t=this.norm(a.textContent||'').toLowerCase();
      if(t.length>=2&&t.length<=60&&!wikiLinks[t])wikiLinks[t]=base;
    });
    const blocks=[...main.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,dd,td,figcaption')].map(n=>this._chromify(this._decruft(this.norm(n.textContent).replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()))).filter(t=>t.length>2&&!this._isCreditOnly(t));
    // No length cap: read the WHOLE work, not the first ~60k chars — a full book (a Project
    // Gutenberg text) must land in memory entire. Ingestion parses the lot; slow is acceptable.
    if(blocks.length<2){ const body=this._chromify(this.norm(main.textContent||'')); if(body.length>=120) return {title,text:this.paras(body),image,wikiLinks}; }
    return {title,text:[...new Set(blocks)].join('\n'),image,wikiLinks};
  }
  // Strip newsroom photo chrome that otherwise gets read as prose and poisons the
  // entity summaries ("Adrian Naranjo/AP hide caption …", "Juan Barreto/Getty Images …").
  _decruft(t){
    if(!t)return '';
    t=t.replace(/\b(?:hide|toggle|show)\s+caption\b/gi,' ').replace(/\benlarge this image\b/gi,' ');
    t=t.replace(/^\s*[A-Z][A-Za-z.'\u00C0-\u024F-]+(?:\s+[A-Z][A-Za-z.'\u00C0-\u024F-]+){0,3}\s*\/\s*(?:Getty(?:\s+Images)?|AP|Reuters|AFP|NPR|EPA|Bloomberg|AFP\/Getty)\b[\s,:\-]*/,' ');
    t=t.replace(/\b[A-Z][A-Za-z.'\u00C0-\u024F-]+(?:\s+[A-Z][A-Za-z.'\u00C0-\u024F-]+){0,3}\s+for\s+NPR\b[\s,:\-]*/g,' ');
    return this.norm(t);
  }
  _isCreditOnly(t){
    if(!t)return true;
    if(/^(?:hide caption|toggle caption|enlarge this image|advertisement|sponsored content?)\b/i.test(t))return true;
    if(/^(?:download|embed|transcript|listen|loading|play|pause|share|subscribe|sign up|sign in|log in|newsletter|advertisement|read more|see all)\b[\s.\u00B7|-]*$/i.test(t))return true;
    if(t.length<60&&/^[A-Z][A-Za-z.'\u00C0-\u024F-]+(?:\s+[A-Z][A-Za-z.'\u00C0-\u024F-]+){0,3}\s*\/\s*(?:Getty|AP|Reuters|AFP|NPR|EPA|Bloomberg)/.test(t))return true;
    return false;
  }
  // Reader-mode cleanup for an extracted block: drop any HTML markup that leaked in as
  // literal text (audio-player <iframe> snippets shown for copying), strip reference and
  // edit markers ([21], [citation needed], [edit]) and the "Download Embed Embed"/"Embed"
  // audio chrome, and collapse whitespace. Prose is left intact.
  _chromify(t){
    if(!t)return '';
    t=String(t).replace(/<[^>]*>/g,' ');                                  // leaked HTML tags
    t=t.replace(/\[(?:\d+|citation needed|edit|note \d+|\?)\]/gi,'');     // wiki refs / [edit]
    t=t.replace(/\bDownload\s+Embed\b[\s\S]{0,400}?\bTranscript\b/gi,' '); // NPR audio-player chrome block
    t=t.replace(/\bDownload\s+Embed(?:\s+Embed)?\b/gi,' ').replace(/\bEmbed\s+Embed\b/gi,' ');
    return this.norm(t);
  }
  _ogImage(doc){
    const sel=['meta[property="og:image:secure_url"]','meta[property="og:image"]','meta[name="og:image"]','meta[name="twitter:image"]','meta[property="twitter:image"]','meta[name="twitter:image:src"]','link[rel="image_src"]'];
    for(const s of sel){const el=doc.querySelector(s);const v=el&&(el.getAttribute('content')||el.getAttribute('href'));if(v&&v.trim())return v.trim();}
    const im=doc.querySelector('article img, main img, figure img, img');
    if(im){const v=im.getAttribute('src')||im.getAttribute('data-src')||im.getAttribute('data-original');if(v&&!/^data:/.test(v))return v;}
    return null;
  }
  // Plain-text source (.txt, Project Gutenberg, pasted prose): strip common
  // boilerplate, lift a Title: line if present, group blank-line paragraphs.
  extractPlain(raw){
    let t=String(raw||'').replace(/\r\n?/g,'\n');
    let title=null; const tm=t.match(/^\s*Title:\s*(.+)$/mi); if(tm)title=this.norm(tm[1]);
    const sm=t.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i); if(sm)t=t.slice(sm.index+sm[0].length);
    const em=t.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i); if(em)t=t.slice(0,em.index);
    if(!title){ const fl=t.split('\n').map(s=>this.norm(s)).find(s=>s.length>2); title=fl?this.truncLabel(fl,60):'(untitled text)'; }
    return {title,text:this.paras(t).replace(/<[^>]*>/g,' ').replace(/\[(?:\d+|citation needed|edit)\]/gi,'').slice(0,60000),image:null};
  }
  paras(t){ return String(t||'').split(/\n\s*\n/).map(p=>this.norm(p.replace(/\n/g,' '))).filter(p=>p.length>2).join('\n'); }
  async fetchPage(url){const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent(url));if(!r.ok)throw new Error('HTTP '+r.status);const html=await r.text();if(html.trim().length<60)throw new Error('empty page');if(/<title>\s*(?:just a moment|attention required|access denied|verify you are human|are you a robot|enable javascript|please wait\b|checking your browser)/i.test(html))throw new Error('blocked by anti-bot check');return this.extract(html,r.headers.get('content-type')||'',url);}
  // Candidate URLs for a query — the entry point both research paths (the ✦ button and the
  // chat research mode) walk from. PRIMARY: DuckDuckGo's HTML endpoint via the proxy. FALLBACK:
  // Wikipedia's search API, which is CORS-direct (no proxy) through _wikiJSON. A research walk
  // that gets ZERO candidates here ends at 0 hops and silently degrades to a generic, ungrounded
  // answer — exactly "it's not actually doing research". So a single provider must never be the
  // whole story: if DuckDuckGo throws (proxy hiccup, rate-limit) OR comes back empty (a bot-wall
  // / blank result page), fall back to Wikipedia so the walk always has a real source to read.
  async searchLinks(query,n){
    let out=[];
    try{out=await this._searchDDG(query,n);}catch(e){out=[];}
    if(out.length)return out;
    try{out=await this._searchWiki(query,n);}catch(e){out=[];}
    return out;
  }
  async _searchDDG(query,n){
    const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query)));
    if(!r.ok)throw new Error('HTTP '+r.status);
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');const out=[];
    const grab=a=>{let h=a.getAttribute&&a.getAttribute('href');if(!h)return;const m=h.match(/[?&]uddg=([^&]+)/);if(m)h=decodeURIComponent(m[1]);if(/^https?:\/\//i.test(h)&&!/duckduckgo\.com/i.test(h))out.push(h);};
    doc.querySelectorAll('a.result__a, .result__title a').forEach(grab);
    if(!out.length)doc.querySelectorAll('a[href]').forEach(grab);
    return [...new Set(out)].slice(0,n||4);
  }
  // CORS-direct search (origin=*); _wikiJSON tries the direct fetch first and falls back to the
  // proxy if the frame blocks it. Each hit becomes its article URL — pages that read cleanly.
  async _searchWiki(query,n){
    const u='https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(query)+'&srlimit='+(n||6)+'&format=json&origin=*';
    const data=await this._wikiJSON(u);
    const hits=(data&&data.query&&data.query.search)||[];
    return hits.map(h=>'https://en.wikipedia.org/wiki/'+encodeURIComponent(String(h.title).replace(/ /g,'_'))).slice(0,n||6);
  }
  // WIKIPEDIA FIRST — the research guidance. A topic is grounded in its encyclopedia article (and,
  // through _wikiCitedSources, that article's cited primary sources) BEFORE any open-web search.
  // The bug this fixes: an open search for "write me an essay about dolphins" handed back a wall of
  // essay-mill pages (gradesfixer / bartleby / classace) to recap; Wikipedia hands back the Dolphin
  // article and its references instead. Falls back to the open web (searchLinks → DuckDuckGo) only
  // when Wikipedia has no article for the query, so an off-encyclopedia topic still finds sources.
  async _wikiFirstLinks(query,n){
    let wiki=[];
    try{wiki=await this._searchWiki(query,Math.min(3,n||3));}catch(e){wiki=[];}
    if(wiki.length)return wiki;
    // Open-web fallback (off-encyclopedia topics): drop essay mills here too, so a subject Wikipedia
    // has no article for still doesn't fall back to gradesfixer / bartleby to recap.
    try{const open=await this.searchLinks(query,(n||4)+3);return this._dropMills(open).slice(0,n||4);}catch(e){return [];}
  }
  // Strip essay-mill / study-help hosts from a list of URLs (the walk reads sources, not homework).
  _dropMills(urls){return (urls||[]).filter(u=>{let h='';try{h=new URL(/^https?:/i.test(u)?u:'https://'+u).hostname;}catch(e){return true;}return !this._lowQualitySource(h);});}
  // The CITED external sources of a read Wikipedia article — the references that ground it, which
  // the walk follows to build a multi-source graph ("go find primary sources"). Pulled from the
  // article's reference list via the parse API (externallinks), filtered to readable publications
  // (_rankCitedSources drops Wikimedia infrastructure, ID resolvers, paywalled aggregators, archive
  // wrappers and search/social), then deduped to ONE per host so the traversal fans out across
  // distinct sources rather than several links into one site. Returns absolute http(s) URLs.
  async _wikiCitedSources(articleUrl,n){
    const m=String(articleUrl||'').match(/\/wiki\/([^#?]+)/i);
    if(!m)return [];
    const title=decodeURIComponent(m[1]).replace(/_/g,' ');
    let links=[];
    try{
      const u='https://en.wikipedia.org/w/api.php?action=parse&page='+encodeURIComponent(title)+'&prop=externallinks&format=json&redirects=1&origin=*';
      const data=await this._wikiJSON(u);
      links=(data&&data.parse&&data.parse.externallinks)||[];
    }catch(e){return [];}
    return this._rankCitedSources(links).slice(0,n||4);
  }
  // Is this host citation NOISE rather than a readable source? Wikimedia's own family, ID/lookup
  // resolvers (doi, worldcat, isbn), paywalled aggregators that never parse (jstor, proquest,
  // researchgate, ssrn), archive wrappers, and search/social/shopping — all dropped so the walk
  // spends its hops on pages it can actually read and ground a proposition in.
  _citationNoise(host){
    const noise=['archive.org','web.archive.org','webcitation.org','ghostarchive.org','archive.today','archive.ph',
      'doi.org','dx.doi.org','hdl.handle.net','worldcat.org','isbnsearch.org','ui.adsabs.harvard.edu',
      'jstor.org','proquest.com','semanticscholar.org','researchgate.net','ssrn.com','academia.edu',
      'youtube.com','youtu.be','twitter.com','x.com','facebook.com','instagram.com','t.co','reddit.com'];
    if(noise.includes(host))return true;
    if(this._lowQualitySource(host))return true;   // essay mills are noise too, never a cited source
    return /(?:^|\.)(?:wikipedia\.org|wikimedia\.org|wikidata\.org|wiktionary\.org|wikisource\.org|wikivoyage\.org|wikibooks\.org|mediawiki\.org|wmflabs\.org|toolforge\.org)$/.test(host)
      || /(?:^|\.)google\.[a-z.]+$/.test(host) || /(?:^|\.)bing\.com$/.test(host) || /(?:^|\.)amazon\.[a-z.]+$/.test(host);
  }
  // ESSAY MILLS & STUDY-HELP FARMS — the pages the open-web search handed back for "write me an
  // essay about dolphins" (gradesfixer / bartleby / classace), plus the rest of that genre. Their
  // text is other people's essays and homework, not sources: grounding an answer in them recaps —
  // plagiarizes — those essays, and their pages are mostly cookie banners and "sign up to read more"
  // boilerplate. Barred from the research walk AND down-weighted out of the grounding pool, so the
  // answer stands on Wikipedia and real publications instead. Matched on the registrable host so
  // "www." and regional variants are covered.
  _lowQualitySource(host){
    host=String(host||'').replace(/^www\./,'').toLowerCase();
    if(!host)return false;
    const mills=new Set(['gradesfixer.com','bartleby.com','classace.io','studymoose.com','ipl.org',
      '123helpme.com','studocu.com','coursehero.com','cram.com','ukessays.com','studydriver.com',
      'paperap.com','gradesaver.com','phdessay.com','customwritings.com','essaypro.com','edubirdie.com',
      'studycorgi.com','studyhippo.com','studentshare.org','writework.com','megaessays.com','antiessays.com',
      'chegg.com','quizlet.com','scribd.com','brainly.com','brainly.in','slideshare.net','academic.tips',
      'eduzaurus.com','samploon.com','myperfectwords.com','nerdyseal.com','supersummary.com','litcharts.com',
      'shmoop.com','cliffsnotes.com','sparknotes.com','enotes.com','bookrags.com','gradebuddy.com',
      'essay.org','essays.io','speedypaper.com','grademiners.com','essayshark.com','homeworkmarket.com']);
    if(mills.has(host))return true;
    // …and the long tail by URL shape — any host whose name is built from these essay-mill tokens.
    return /(?:^|[.-])(?:essay|essays|paper|papers|homework|coursework|termpaper|studynotes|study-?notes)(?:[.-]|$)/.test(host);
  }
  _rankCitedSources(links){
    const out=[],hosts=new Set();
    for(let h of (links||[])){
      if(!h)continue;
      if(h.startsWith('//'))h='https:'+h;
      if(!/^https?:\/\//i.test(h))continue;
      let host='';try{host=new URL(h).hostname.replace(/^www\./,'').toLowerCase();}catch(e){continue;}
      if(!host||this._citationNoise(host)||hosts.has(host))continue;   // one source per host — fan out
      hosts.add(host);
      out.push(h.split('#')[0]);
    }
    return out;
  }

  rebuild(pages){
    const m={events:[],sentences:[],sentenceSource:[],pages:[]};
    // Cross-source identity: re-key every referent in the memory log to a NAMELESS hashId,
    // forking a name into distinct referents where context defeats the default coreference
    // (so the 1995 film and the weather phenomenon are not one node — see cross-source.js).
    // The display name rides on the event's `label`; the bare token never enters the log.
    const live=pages.filter(pg=>!(this._muted&&this._muted.has(pg.url)));
    let remap=new Map(),forks=[];
    try{ if(this.E&&this.E.referentMap){const r=this.E.referentMap(live);remap=r.remap;forks=r.forks||[];} }catch(e){ remap=new Map();forks=[]; }
    // A referent that appears ONLY as a relation endpoint (an object never INS'd in its
    // own right) gets no labelled INS, so projectGraph leaves it unlabelled and labelOf()
    // would fall back to the bare nameless hashId — the "hashIds instead of display names"
    // the web graph showed. The remap knows that referent's readable name (allIds covers
    // src/tgt/from/to/node); invert it into a hashId→label index labelOf() consults so the
    // endpoint shows its name. Mirrors cross-source.js#referentLabels, kept inline so the
    // reader needs no rebuilt engine bundle.
    this._refLabel=new Map();
    for(const byBase of remap.values())for(const r of byBase.values())if(r&&r.id!=null&&r.label!=null&&!this._refLabel.has(r.id))this._refLabel.set(r.id,r.label);
    for(const pg of pages){ if(this._muted&&this._muted.has(pg.url))continue; const so=m.events.length,no=m.sentences.length;
      const rm=remap.get(pg.url);
      const fix=v=>(v!=null&&v!=='[void]'&&rm&&rm.has(v))?rm.get(v).id:v;
      for(const e of pg.events){const ne={...e,seq:e.seq+so,__page:pg.url};if(e.refSeq!=null)ne.refSeq=e.refSeq+so;if(typeof e.ref==='number')ne.ref=e.ref+so;if(e.argspan!=null)ne.argspan=e.argspan+so;if(e.sentIdx!=null)ne.sentIdx=e.sentIdx+no;
        if(rm){if(ne.id!=null&&ne.id!=='[void]'){const r=rm.get(ne.id);if(r){if(ne.op==='INS')ne.label=r.label;ne.id=r.id;}}
          if(ne.src!=null)ne.src=fix(ne.src);if(ne.tgt!=null)ne.tgt=fix(ne.tgt);if(ne.from!=null)ne.from=fix(ne.from);if(ne.to!=null)ne.to=fix(ne.to);if(ne.node!=null)ne.node=fix(ne.node);
          if(ne.subject&&ne.subject.id!=null)ne.subject={...ne.subject,id:fix(ne.subject.id)};if(ne.object&&ne.object.id!=null)ne.object={...ne.object,id:fix(ne.object.id)};}
        m.events.push(ne);}
      pg.sentences.forEach(s=>{m.sentences.push(s);m.sentenceSource.push(pg.url);});
      m.pages.push({url:pg.url,title:pg.title,text:pg.text||'',sentences:pg.sentences||[],ts:pg.ts,via:pg.via,image:pg.image||null,parent:pg.parent||null,wikiLinks:pg.wikiLinks||null,author:pg.author||null,authorDates:pg.authorDates||null,published:pg.published||null,seqStart:so,sentStart:no});
    }
    // The sense that distinguishes a forked referent ("a 1995 film") is a DEFEASIBLE DEF on
    // the referent — not part of its identity. Appended after the body so the INS exists.
    for(const f of forks){if(f.sense)m.events.push({op:'DEF',id:f.id,key:'sense',value:f.sense,sentIdx:null,seq:m.events.length,defeasible:true,__page:f.url});}
    this.master=m;
    const shim={events:m.events,snapshot:()=>m.events,get length(){return m.events.length;}};
    // THE WALK'S DOC HANDLE — the merged corpus in the pinned shape the composition walk
    // (write/compose.js) rides: the event-log shim nested under .log (readingAt, surfToPlan
    // and trajectory all read doc.log), the sentences as units, and per-sentence token sets
    // so thread conditioning keeps its lexical channel (surfer/salience.js bornSalience).
    // The tokenizer REPLICATES perceiver/parse/tokenize.js `tok` (the system's single
    // tokenizer — this file can't static-import it) so the span sets live in the SAME term
    // space threadBasis builds its query from; a divergent regex here silently deflates
    // every Born weight. Token sets are built LAZILY on first grounded compose: rebuild
    // fires on every page add/toss/mute and most sessions never compose, so eager
    // tokenization of the whole corpus would be a per-page UI stall for nothing.
    const _STOP=this._tokStop||(this._tokStop=new Set(('the a an of to in on at for with and or but if as by from into over under is are was were be been being am have has had do does did done this that these those i you he she it we they them us me him her my your our their his its will would can could should may might must shall not').split(' ')));
    const _tok=(s)=>new Set(String(s||'').toLowerCase().replace(/[^a-z0-9\s'-]/g,' ').split(/\s+/).filter(t=>t&&t.length>1&&!_STOP.has(t)));
    let _tokCache=null;
    this._logDoc={log:shim,units:m.sentences,sentences:m.sentences,
      get tokensBySentence(){return _tokCache||(_tokCache=m.sentences.map(_tok));}};
    this.graph=this.E.projectGraph(shim,{cursor:Math.max(0,m.sentences.length-1),rules:this.E.DEFAULT_PROJECTION_RULES});
    this.incident=new Map();for(const e of this.graph.edges){for(const id of [e.from,e.to])this.incident.set(id,(this.incident.get(id)||0)+(e.weight||0));}
  }
  async readURL(url,via,parent,opts){
    if(!this.E)return false;
    url=this.norm(url);if(!/^https?:\/\//i.test(url))url='https://'+url;
    if(this.state.pages.find(p=>p.url===url)){this.feedLine('warn','Already read: '+this.short(url));return false;}
    let ex;try{ex=await this.fetchPage(url);}catch(e){this.feedLine('warn','Couldn’t fetch '+this.short(url)+' — '+e.message);return false;}
    if(!ex.text||ex.text.length<60){this.feedLine('warn',this.short(url)+' — too little text');return false;}
    // A long read (a full book) narrates its progress through opts.onStep and folds in slowly, so
    // it doesn't land as one silent freeze. Threshold keeps ordinary pages on the fast path.
    const onStep=opts&&opts.onStep; let onProgress=null;
    if(onStep&&ex.text.length>40000){
      onStep('read','“'+ex.title+'” is a long text — folding it in slowly…');
      let lastPct=0;
      onProgress=(p)=>{if(!p||!p.total)return;const pct=Math.floor(p.done/p.total*100);if(pct>=lastPct+20&&pct<100){lastPct=pct;onStep('read','Reading “'+ex.title+'” — '+pct+'% ('+p.done+' of '+p.total+' sentences)…');}};
    }
    return this.ingest(url,ex.title,ex.text,via,ex.image,parent,ex.wikiLinks,null,onProgress);
  }
  async readText(text,title,meta){
    if(!this.E)return false;
    text=String(text||'').trim(); if(text.length<60){this.feedLine('warn','Too little text to read.');return false;}
    const url='text:'+(Date.now().toString(36)); const ttl=title||('Pasted text · '+text.slice(0,40).replace(/\s+/g,' ').trim()+'…');
    return this.ingest(url,ttl,text,'paste',null,null,null,meta);
  }
  // Import a book / text file: read it, then NAVIGATE the center to it so it opens
  // as a readable book (loadCenter's text: branch) with its entities clickable.
  async importText(text,title,meta){
    const r=await this.readText(text,title,meta);
    if(!r||!r.url){this.feedLine('warn','Could not import that text.');return false;}
    this._srcUrl=null;this._pushLoc({t:'web',url:r.url});
    this.setState(s=>({viewUrl:r.url,selId:null,panelSel:null,panelLens:null,panelMode:'overview',hoverSrc:null,pinSrc:null,hoverEnt:null,activeChat:null,histRev:(s.histRev||0)+1}));
    this.loadCenter(r.url);
    this.feedSep('imported a book');this.feedLine('read','Read “'+r.title+'” · '+(r.propCount!=null?r.propCount:r.sentenceCount)+' propositions');
    return r;
  }
  // Open the OS file picker. `chatId` (optional) tags whatever is imported into that chat once
  // it's read — the "Import a file…" affordance in a chat's Add-source picker rides this, so a
  // file dropped from a chat lands as a tagged source, the way a pasted URL would.
  onImportClick(chatId){this._importIntoChat=(typeof chatId==='string')?chatId:null;const i=document.querySelector('input[data-eo-import]');if(i)i.click();}
  onImportFile(ev){
    const files=ev&&ev.target&&ev.target.files?Array.from(ev.target.files):[];
    const chatId=this._importIntoChat||null;this._importIntoChat=null;
    if(ev.target)ev.target.value='';
    // Kick every picked file off at once — each posts its own pending Source row and runs its
    // own extractor, so a batch of files ALL show up instantly and progress independently.
    for(const f of files)this._importAny(f,chatId);
  }
  // A short, human kind for the pending Source row's status ("Audio", "PDF", …), from the file.
  _importKind(f){const ext=(String(f&&f.name||'').split('.').pop()||'').toLowerCase(),mime=(f&&f.type||'').toLowerCase();
    if(mime.startsWith('audio/')||['mp3','m4a','wav','ogg','oga','flac','aac','opus','weba'].includes(ext))return 'Audio';
    if(mime.startsWith('video/')||['mp4','mov','webm','mkv','avi','m4v'].includes(ext))return 'Video';
    if(mime==='application/pdf'||ext==='pdf')return 'PDF';
    if(mime.startsWith('image/')||['png','jpg','jpeg','webp','gif','bmp','tif','tiff'].includes(ext))return 'Image';
    if(/sheet|excel|spreadsheet|csv|tab-separated/.test(mime)||['xlsx','xls','csv','tsv'].includes(ext))return 'Table';
    if(mime.includes('html')||['html','htm','xhtml'].includes(ext))return 'Web page';
    return 'Text';}
  // ── in-flight import ledger — the pending Source rows ─────────────────────
  _addImport(rec){this.setState(s=>({imports:[...s.imports,rec]}));}
  _patchImport(id,patch){this.setState(s=>({imports:s.imports.map(im=>im.id===id?{...im,...patch}:im)}));}
  _dropImport(id){this.setState(s=>({imports:s.imports.filter(im=>im.id!==id)}));}
  dismissImport(id){this._dropImport(id);}
  // Import ANY supported file. Plain text/markdown reads inline (no module load); a PDF,
  // scanned image, audio/video, spreadsheet or web page routes through the unified importer
  // (src/reader/import-file.js), which lazy-loads the right extractor and raises it onto the
  // spine via the ingestion organs — the reader then reads the extracted text as a book.
  //
  // A pending Source row is posted BEFORE any work, so the file appears in the panel the instant
  // it's picked; onProgress drives that row's live status (and the top activity bar); on success
  // the row is dropped as the real read source lands; on failure the row keeps the error.
  async _importAny(f,chatId){
    const name=f.name||'file'; const ext=(name.split('.').pop()||'').toLowerCase();
    const isText=(f.type&&f.type.startsWith('text/plain'))||['txt','md','markdown','text','log','rst'].includes(ext);
    const id='imp'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    this._addImport({id,name,kind:this._importKind(f),status:isText?'Reading…':'Queued…',chatId:chatId||null});
    const say=(m)=>{this._patchImport(id,{status:m});this.feedLine('read',m);};
    try{
      let r;
      if(isText){ const text=await f.text(); r={text,title:name.replace(/\.[^.]+$/,''),meta:{modality:'text'}}; }
      else{
        this.feedSep('importing '+name);
        const mod=await import(new URL('src/reader/import-file.js',document.baseURI).href);
        // Transcription options ride along: `twoWitness` takes a second whisper pass so the
        // readings can be audited (audio/video only; ignored by the other extractors).
        r=await mod.importAnyFile(f,{onProgress:say,twoWitness:!!this.state.audioAudit});
      }
      if(!r||!r.text||!r.text.trim()){ this._patchImport(id,{error:'No readable text found.',status:''}); this.feedLine('warn','No text could be read from '+name); return; }
      this._patchImport(id,{status:'Folding into memory…'});
      const read=await this.importText(r.text, r.title||name.replace(/\.[^.]+$/,''), r.meta||null);
      // Read and folded — drop the pending row (the real source now stands in its place) and,
      // when this came from a chat's Add-source picker, tag it in so the chat is about it.
      this._dropImport(id);
      if(chatId&&read&&read.url)this.addChatSource(read.url,chatId);
    }catch(e){ const msg=((e&&e.message)?e.message:String(e)); this._patchImport(id,{error:msg,status:''}); this.feedLine('warn','Could not import '+name+' — '+msg); }
  }
  // ── Chat — grounded in what's been READ, no LLM ──────────────────────────
  // Each chat is a thread that answers from the read sentences/graph. A chat can be
  // scoped to one source (a fully-read book/page) or range over everything read. The
  // answer quotes the most relevant read sentences and links the entities it found —
  // every claim traces to a source. window.claude, if present, is not required.
  chatId(){this._chatN=(this._chatN||0)+1;return 'c'+Date.now().toString(36)+this._chatN;}
  activeChatObj(){return this.state.chats.find(c=>c.id===this.state.activeChat)||null;}
  // Opening / starting a chat does NOT close the page you're reading — when a page
  // or book is open the chat rides alongside it as a drawer (the page stays the
  // hero); with nothing open the chat takes the center.
  newChat(scopeUrl){
    const id=this.chatId();
    const title=scopeUrl?(((this.pageOf(scopeUrl)||{}).title)||this.short(scopeUrl)):'New chat';
    // A chat is ABOUT a set of sources. Opened from a source, it starts scoped to it.
    // Opened with no scope it is a NET-NEW space (isolated): nothing you've read is in
    // scope until you tag "everything" or pick sources — so a fresh chat is a blank slate,
    // not silently grounded in the whole library.
    const sources=scopeUrl?[scopeUrl]:[];
    this._chatTab(id);
    this.setState(s=>({chats:[{id,title,sources,scopeAll:false,messages:[],ts:Date.now()},...s.chats],activeChat:id,viewUrl:null,selId:null,chatInput:'',chatAddOpen:false,rightOpen:true,newTabOpen:false,histRev:(s.histRev||0)+1}));
    return id;
  }
  // The sources a chat is ABOUT, as a URL list. Tolerates the older single-`scope` shape
  // so an in-flight chat keeps working.
  chatSourcesOf(c){return c?(Array.isArray(c.sources)?c.sources:(c.scope?[c.scope]:[])):[];}
  // Does this chat range over EVERYTHING read? An explicit opt-in (the "Everything you've
  // read" tag) — never the mere absence of tagged sources.
  chatScopeAll(c){return !!(c&&c.scopeAll);}
  // A NET-NEW space: nothing tagged and not ranged over everything. An isolated chat does
  // NOT draw on what was read — it answers plainly (and the web, if on), never the library.
  chatIsolated(c){return !this.chatScopeAll(c)&&this.chatSourcesOf(c).length===0;}
  // Resolve the grounding scope for an answer turn, folding in any freshly-gathered pages.
  //   {isolated:true}  → net-new space, ground nothing from reading.
  //   {sources:[]}     → range over everything (the "everything" tag).
  //   {sources:[…]}    → the tagged/gathered sources only.
  _answerScope(cur,gathered){
    const g=(gathered&&gathered.length)?[...new Set(gathered.filter(Boolean))]:[];
    if(this.chatScopeAll(cur))return {isolated:false,sources:[]};
    const had=this.chatSourcesOf(cur);
    if(had.length||g.length)return {isolated:false,sources:[...new Set([...had,...g])]};
    return {isolated:true,sources:[]};
  }
  // Fold another read source into the active chat so it can be chatted with alongside the
  // rest. Tagging a specific source means the chat is ABOUT it — so it leaves the
  // "everything" scope (a narrowing), never silently keeps ranging over the whole library.
  addChatSource(url,chatId){if(!url)return;this.setState(s=>({chatAddOpen:false,chats:s.chats.map(c=>{
    if(c.id!==(chatId||s.activeChat))return c;const src=this.chatSourcesOf(c);if(src.includes(url))return c;
    const sources=[...src,url];const title=(c.messages&&c.messages.length)?c.title:(((this.pageOf(sources[0])||{}).title)||this.short(sources[0]));
    return {...c,scopeAll:false,sources,title};})}));}
  removeChatSource(url){this.setState(s=>({chats:s.chats.map(c=>{
    if(c.id!==s.activeChat)return c;return {...c,sources:this.chatSourcesOf(c).filter(u=>u!==url)};})}));}
  // Tag / untag the "everything you've read" scope. Tagging everything supersedes (and clears)
  // any specific source chips; untagging drops back to a net-new space.
  setChatScopeAll(on){this.setState(s=>({chatAddOpen:false,chats:s.chats.map(c=>{
    if(c.id!==s.activeChat)return c;return {...c,scopeAll:!!on,sources:on?[]:this.chatSourcesOf(c)};})}));}
  toggleChatAdd(){this.setState(s=>({chatAddOpen:!s.chatAddOpen}));}
  // The sources you can still tag into this chat, as an indented tree: each primary page with
  // the branching pages found from it (research children) nested underneath — so you pick by
  // topic, not from a flat list. `excludeSet` drops what's already tagged.
  _chatAddTree(excludeSet){
    const pages=(this.master&&this.master.pages)||[];
    if(!pages.length)return [];
    const byRecency=[...pages].sort((a,b)=>(b.ts||0)-(a.ts||0));
    const inSet=u=>!!(u&&pages.find(x=>x.url===u));
    const childrenOf=u=>byRecency.filter(p=>p.parent===u);
    const out=[],seen=new Set();
    const push=(p,depth)=>{if(seen.has(p.url))return;seen.add(p.url);
      out.push({url:p.url,title:p.title||this.short(p.url),depth:Math.min(depth,2),kids:childrenOf(p.url).length,tagged:excludeSet.has(p.url)});
      childrenOf(p.url).forEach(c=>push(c,depth+1));};
    byRecency.filter(p=>!inSet(p.parent)).forEach(p=>push(p,0));
    byRecency.forEach(p=>{if(!seen.has(p.url))push(p,0);});
    return out;
  }
  // The discoverable "chat with this page": scope a chat to whatever is open.
  askThisPage(){const u=this.state.viewUrl;this.newChat(u||null);}
  openChat(id){this._chatTab(id);this.setState(s=>({activeChat:id,viewUrl:null,selId:null,hoverEnt:null,chatAddOpen:false,rightOpen:true,newTabOpen:false,histRev:(s.histRev||0)+1}));}
  // Closing a chat closes its tab (the chip goes too); the neighbour tab takes over.
  closeChat(){this._ensureTabs();const t=this._liveTab();if(t&&t.kind==='chat')this.closeTab(t.id);else this.setState({activeChat:null,chatAddOpen:false});}
  onChatInput(ev){this.setState({chatInput:ev&&ev.target?ev.target.value:''});}
  onChatKey(ev){if(ev&&ev.key==='Enter'&&!ev.shiftKey){if(ev.preventDefault)ev.preventDefault();this.sendChat();}}
  // Per-answer grounding strip: collapsed by default (not overwhelming), one tap reveals
  // the passages/entities the answer is grounded in. Keyed by chat id + message index.
  toggleGround(key){this.setState(s=>{const g={...(s.groundOpen||{})};g[key]=!g[key];return {groundOpen:g};});}
  _scrollChat(){requestAnimationFrame(()=>{const a=document.getElementById('eo-chat-scroll');if(a)a.scrollTop=a.scrollHeight;});}
  setBackend(name){try{localStorage.setItem('eo_backend',name);}catch(e){}if(this._chatModel&&this._chatModel.id!==name)this._chatModel=null;this.setState({backend:name,modelStatus:''});}
  // Questions a clock answers — handled without any model so they always work.
  mechanicalAnswer(q){const low=q.toLowerCase();
    if(/\b(today'?s date|what'?s? (the )?date|what day is it|current date)\b/.test(low))
      return 'Today is '+new Date().toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'.';
    if(/\b(what'?s? (the )?time|what time is it|current time)\b/.test(low))
      return 'It is '+new Date().toLocaleTimeString()+'.';
    return null;}
  // Does this message itself ASK to research a topic? Returns the bare topic to chase, or
  // null. Lets "research dolphins" trigger the research walk even with the mode toggle off —
  // the verb IS the mode switch, the way "/research" or a tool toggle would be in a chat app.
  _researchIntent(q){
    const m=String(q||'').match(/^\s*(?:please\s+|can you\s+|could you\s+|go\s+|i want you to\s+|i'd like you to\s+)*(?:research|look\s+(?:into|up)|dig\s+into|investigate|explore|read\s+up\s+on|find\s+out\s+about)\b[:,\-\s]+(.+)$/i);
    if(m&&m[1]){const topic=this.norm(m[1]).replace(/[?.!]+$/,'').trim();if(topic.length>1)return {topic};}
    return null;}
  // A "GO FIND / GO READ this WORK" turn — a retrieval/read command aimed at ONE specific work
  // ("go find the book war and peace", "read the novel X", "no go get it", "i want you to get the
  // actual text of the book from project gutenberg"). This is what the user kept asking for and the
  // walk kept mis-hearing: taken literally, "no go get it" seeded the search with the words "go get
  // it" and read the SONG "Go Get It" and the episode "Go Getters" instead of the book. Returns
  // {hit, subject}: hit when the turn is such a command; subject is the NAMED work, or '' when the
  // turn is DEICTIC ("it" / "the book") and the work must come from the conversation. A hit both
  // FOCUSES the walk on the one work (no facet fan-out) and lets it fetch the actual text from
  // Project Gutenberg. Purely string-mapping, same discipline as _subjectOf.
  _findWorkSubject(q){
    const before=this.norm(String(q||'')).replace(/[?.!]+$/,'').trim();
    if(!before)return {hit:false,subject:''};
    // (a) command wrapper (go / please / can you / "i want you to" / no, …) + a fetch/read verb.
    let r=before.replace(/^\s*(?:no[,;.!:]?\s+)?(?:(?:please|kindly|hey|ok(?:ay)?|so|can\s+you|could\s+you|would\s+you|will\s+you|i(?:'d| would)?\s+(?:like|want|need)(?:\s+you)?\s+to|i\s+(?:want|need)|let'?s|just|now|go(?:\s+and)?)\s+)+(?:find|fetch|grab|locate|retrieve|pull\s+up|pull\s+down|dig\s+up|track\s+down|bring\s+up|get|open|read|go\s+get)\s+(?:me\s+|us\s+)?(?:the|a|an|that|this|my)?\s*(?:book|novel|text|article|essay|paper|story|poem|work|title|document|source)?\s*(?:(?:called|titled|named|entitled)\s+)?(.+)$/i,'$1');
    // (b) no wrapper, but a fetch/read verb aimed squarely at a WORK noun ("read the novel X").
    if(r===before)r=before.replace(/^\s*(?:no[,;.!:]?\s+)?(?:find|fetch|grab|locate|retrieve|pull\s+up|pull\s+down|dig\s+up|track\s+down|bring\s+up|get|open|read)\s+(?:me\s+|us\s+)?(?:the|a|an|that|this|my)\s+(?:book|novel|text|article|essay|paper|story|poem|work|title|document|source)\s+(?:(?:called|titled|named|entitled|about|on)\s+)?(.+)$/i,'$1');
    if(r===before)return {hit:false,subject:before};
    // Peel the residual chrome down to the bare work: the "from project gutenberg" source clause
    // (typo-tolerant — "porject guttenberg" too), filler adjectives, "the text/copy of", a leading
    // deictic doc-head ("the book"), and a trailing task clause ("… and read it").
    r=r.replace(/[“”"'’]/g,' ')
       .replace(/\b(?:from|on|off|via|at|in|out\s+of)\s+[a-z\s]*?\bgut+[a-z]*berg\b.*$/i,'')
       .replace(/\b(?:actual|full|complete|entire|original|whole|real|raw|plain|proper|literal)\s+/gi,'')
       .replace(/\b(?:text|copy|contents?|version|edition|pdf|e-?book|file)\s+of\s+/gi,'')
       .replace(/^\s*(?:the|a|an|this|that|my)\s+(?:book|novel|text|story|poem|work|thing|one)\b\s*/i,'')
       .replace(/\s+(?:and|then|to|&|so\s+you\s+can|so\s+we\s+can)\s+(?:read|summari[sz]e|analy[sz]e|review|go\s+through|explain|describe|break\s+down|tell\s+me\s+about|study|understand|know)\b.*$/i,'')
       .replace(/[?.!]+$/,'').trim();
    if(/^(?:it|this|that|those|these|them|one|the\s+(?:book|novel|text|one|thing|work))$/i.test(r))r='';
    return {hit:true,subject:r};
  }
  _isFindWork(q){return this._findWorkSubject(q).hit;}
  // Is this message a META / CONTINUATION research request with no subject of its OWN — "do more
  // research", "research more", "keep digging", "go deeper", "research", "tell me more"? Such a
  // message is ABOUT the conversation, not a fresh topic. Taken literally it makes the walk chase
  // the word "research" itself (it really did: "do more research" → read "Free Proxy Tools That
  // Help With Academic Research", chased "doi" then "proxy"). We detect it by stripping the
  // research-verb + continuation filler and the function words; if NOTHING contentful is left, the
  // message names no topic and the subject must come from the chat instead.
  _isMetaResearch(t){
    if(!this._metaWords)this._metaWords=new Set(('research researching researched researches do does doing done go going gone let lets ' +
      'more most again deeper deep keep keeps keeping continue continuing continued further furthermore additional ' +
      'extra please look looking dig digging investigate investigating explore exploring find finding read reading ' +
      'tell give show expand elaborate detail details info information context background topic subject thing things ' +
      'stuff something anything everything up into about around over same another other new newer next then now ' +
      'me my mine us our ours your yours yourself them their it its ' +
      // DEICTIC doc-class nouns — "this book", "the author", "more about this page". Used as a bare
      // reference to whatever is open, they name no fresh subject of their own; when one is the ONLY
      // content word left, the turn is ABOUT the current document and the subject must come from it
      // (else the walk literally searches "more about this book" and chases a namesake — the bug
      // that pulled "More: A Memoir of Open Marriage" instead of the book actually being read).
      'book books page pages article articles story stories author authors writer writers chapter chapters ' +
      'text texts document documents documentation paper papers essay essays post posts piece pieces novel novels ' +
      'poem poems passage passages section sections work works writing writings site sites website websites url urls ' +
      'link links source sources doc docs entry entries report reports paragraph paragraphs').split(/\s+/));
    const words=String(t||'').toLowerCase().match(/[a-z][a-z']+/g)||[];
    if(!words.length)return true;
    const content=words.filter(w=>!this._metaWords.has(w)&&!this.STOP.has(w));
    return content.length===0;}
  // Is this turn a CORRECTION / CONTRADICTION of the standing answer — the user telling us the
  // reading is wrong or out of date ("he is no longer a council member", "no, she's the CEO now",
  // "that's outdated", "actually he's the mayor now")? When such a turn rides over a reading that
  // already "covers" the topic, re-asserting that reading is exactly the wrong move (the audit: a
  // year-old article still calls O'Connell a councilmember after he became mayor) — so _shouldWeb
  // sends it to the web to settle the CURRENT fact instead of doubling down. Tight on purpose: a
  // correction opener, a negated / changed state, or a staleness flag. Bare "no" / "nope" acks are
  // caught by _shouldWeb's pleasantry guard before this is ever consulted.
  _isCorrection(q){
    const s=String(q||'').trim();if(!s)return false;
    const isQ=/\?\s*$/.test(s);
    return /^\s*(?:no|nope|nah)\s*[,;:.!]\s*\S/i.test(s)
      || /^\s*(?:wrong|incorrect|false|untrue|not\s+quite|that'?s\s+(?:wrong|incorrect|false|not\s+(?:right|true)|outdated|out\s+of\s+date|old))\b/i.test(s)
      || /\b(?:no\s+longer|not\s+any\s?more|isn'?t\s+any\s?more|aren'?t\s+any\s?more|used\s+to\s+be|not\s+(?:true|correct|right|the\s+case)|out\s+of\s+date|outdated)\b/i.test(s)
      || (!isQ&&/\b(?:actually|in\s+fact|in\s+reality)\b[^?]*\b(?:is|are|was|were|now|isn'?t|aren'?t|not)\b/i.test(s));}
  // Is this string a real subject worth searching, or a bare id / slug / filename ("pg5200",
  // "doc12", "untitled-3") that would send the walk chasing nonsense? A usable subject needs at
  // least one real word — alphabetic, vowel-bearing, length ≥ 3 — and isn't just an id+number.
  _usableSubject(t){
    t=String(t||'').trim();
    if(t.length<3)return false;
    if(/^(?:pg|doc|id|ref|file|page|untitled|chapter|ch|no|item)?[\s_-]*\d+$/i.test(t))return false;
    const words=t.toLowerCase().match(/[a-z][a-z']{2,}/g)||[];
    return words.some(w=>/[aeiouy]/.test(w));
  }
  // Do two subject strings name the SAME thing (a refinement) or DIFFERENT things (a switch)? True
  // when they share any significant content word (singularized), so "dolphins" overlaps "dolphin
  // communication" (a refinement of the thread) but NOT "the relationship between fission and fusion
  // in energy" (a genuine switch). The stop set drops essay-framing and generic connectors so two
  // subjects aren't judged the same merely for both mentioning "essay" or "relationship". Used by
  // runOrganEssay to tell a subject CHANGE from a continuation (docs/discourse-routing.md).
  _subjectsOverlap(a,b){
    const STOP=/^(?:essay|essays|report|article|overview|piece|guide|write|about|thing|things|topic|please|between|relationship|relationships|kind|sort|version|something|anything|everything)$/;
    const words=s=>new Set((String(s||'').toLowerCase().match(/[a-z][a-z'’-]{3,}/g)||[])
      .map(w=>w.replace(/ies$/,'y').replace(/s$/,''))
      .filter(w=>w.length>2&&!STOP.test(w)));
    const A=words(a),B=words(b);
    for(const w of A)if(B.has(w))return true;
    return false;
  }
  // The subject of an open source, for a "more about this book" turn: its real title (+ author).
  // Prefer a usable page title; an imported file is titled by its FILENAME ("pg5200"), which names
  // no subject, so fall back to lifting the document's own "Title:" / "Author:" lines. Returns null
  // when the source yields nothing searchable (the caller then tries the conversation / entities).
  _docSubject(url){
    const strip=s=>this.norm(String(s||''))
      .replace(/\s*[-–—|·:]\s*(wikipedia|wikipedia,? the free encyclopedia|npr|bbc(?: news)?|cnn|reuters|the guardian|the new york times|al jazeera|associated press|ap news|pmc)\b.*$/i,'')
      .replace(/[?.!]+$/,'').trim();
    const pg=this.pageOf(url)||{};
    let title=strip(pg.title);
    if(!this._usableSubject(title)){
      const tm=String(pg.text||'').match(/^\s*Title:\s*(.+)$/mi);
      title=tm?strip(tm[1]):'';
    }
    if(!this._usableSubject(title))return null;
    let author=this.norm(pg.author||'');
    if(!author){const am=String(pg.text||'').match(/^\s*Author:\s*(.+)$/mi);if(am)author=strip(am[1]);}
    const last=author?author.toLowerCase().split(/\s+/).pop():'';
    if(author&&last&&!title.toLowerCase().includes(last))return this.truncLabel((title+' '+author).trim(),80);
    return this.truncLabel(title,80);
  }
  // The SUBJECT of the current chat, derived from context — what "do more research" should be
  // about. Priority: (1) the source(s) the chat is grounded in, by title — the strongest, most
  // stable signal of the subject; (2) the most recent user turn that actually named a topic (not a
  // command like "summarize" and not another meta "research more"); (3) the dominant entity the
  // conversation keeps returning to. Returns null only when the chat is genuinely empty.
  _chatSubject(cur){
    const clean=s=>this.norm(String(s||''))
      .replace(/\s*[-–—|·:]\s*(wikipedia|wikipedia,? the free encyclopedia|npr|bbc(?: news)?|cnn|reuters|the guardian|the new york times|al jazeera|associated press|ap news|pmc)\b.*$/i,'')
      .replace(/[?.!]+$/,'').trim();
    // (1) the sources the chat is About → the first source that yields a usable subject. A bare
    // slug/filename title ("pg5200") is no subject; _docSubject lifts the real Title:/Author: from
    // the document itself so "more about this book" researches the WORK, not the file name.
    const srcs=this.chatSourcesOf(cur);
    for(const u of srcs){const t=this._docSubject(u);if(t)return t;}
    // (2) the most recent substantive user turn (skip commands and meta-research asks).
    const msgs=(cur&&cur.messages)||[];
    for(let i=msgs.length-1;i>=0;i--){const m=msgs[i];
      if(m.role!=='user'||!m.text)continue;
      if(this._isMetaResearch(m.text)||this._isSummaryQ(m.text))continue;
      const t=clean(m.text).replace(/^\s*(?:please\s+|can you\s+|could you\s+|go\s+)*(?:research|look\s+(?:into|up)|dig\s+into|investigate|explore|read\s+up\s+on|find\s+out\s+about)\b[:,\-\s]*/i,'').trim();
      if(t.length>2)return this.truncLabel(t,80);}
    // (3) the entity the whole conversation orbits.
    const text=msgs.map(m=>m.text||'').join(' ');
    const id=this._chatTopicEntity(text);
    if(id!=null){const lab=this.labelOf&&this.labelOf(id);if(lab)return lab;}
    return null;}
  // Strip the TASK FRAMING off a request so the walk researches the SUBJECT, not the chore. The
  // bug: "write me an essay about dolphins" was searched verbatim, so the web handed back other
  // people's dolphin essays (gradesfixer / bartleby / classace) — essay-mill pages to recap, not
  // sources to learn from. The subject of the research is "dolphins"; the rest is instructions to
  // ME, never search terms. So peel a leading "write me a 500-word essay about" / "tell me about" /
  // "give me an overview of" down to whatever it is ABOUT, and research THAT. Conservative: only a
  // recognised framing+connector is stripped; a bare topic ("the French Revolution") or a real
  // question ("what is the capital of France") passes through untouched. Pure string-mapping.
  _subjectOf(q){
    const before=this.norm(String(q||'')).replace(/[?.!]+$/,'').trim();
    if(!before)return before;
    // 1) "<verb> (me) (a|an|the) [N words] [adjective…] <doc-noun> <connector> SUBJECT"
    let m=before.replace(
      /^\s*(?:please\s+|kindly\s+|hey\s+|ok(?:ay)?\s+|so\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|will\s+you\s+|i(?:'d| would)?\s+(?:like|want|need)(?:\s+you)?\s+to\s+|i\s+(?:want|need)\s+|let'?s\s+|go\s+|now\s+|just\s+)*(?:write|compose|draft|create|produce|generate|make|prepare|put\s+together|do|craft|pen)\s+(?:me\s+|us\s+)?(?:a|an|the|some|one|another)?\s*(?:(?:\d+|one|two|three|four|five|several|a\s+few)[-\s]?(?:word|words|page|pages|paragraph|paragraphs|sentence|sentences|line|lines)\s+)?(?:(?:short|brief|long|longer|detailed|comprehensive|thorough|in[-\s]?depth|quick|simple|full|complete|extensive|well[-\s]?researched|original|persuasive|argumentative|expository|descriptive|informative|academic|formal|creative)\s+)*(?:essays?|reports?|papers?|articles?|pieces?|overviews?|accounts?|guides?|breakdowns?|summar(?:y|ies)|analys[ei]s|reviews?|blog\s+posts?|posts?|stories|story|treatises?|dissertations?|compositions?|write[-\s]?ups?|notes?|outlines?|memos?|briefs?)\s+(?:about|on|regarding|concerning|covering|of|for|describing|detailing|exploring|discussing|that\s+(?:covers?|discusses?|describes?|explores?|explains?|is\s+about))\s+(.+)$/i,'$1');
    if(m!==before&&m.trim())return m.trim();
    // 2) bare framing verbs: "tell me about / write about / explain / give me an overview of SUBJECT"
    m=before.replace(
      /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i(?:'d| would)?\s+(?:like|want)(?:\s+you)?\s+to\s+|let'?s\s+|go\s+|just\s+)*(?:tell\s+me\s+(?:all\s+)?about|write\s+about|talk\s+about|teach\s+me\s+about|explain(?:\s+to\s+me)?|describe|discuss|summari[sz]e|elaborate\s+on|expand\s+on|give\s+(?:me\s+)?(?:an?\s+)?(?:overview|summary|rundown|breakdown|account|explanation)\s+(?:of|on|about|for))\s+(.+)$/i,'$1');
    if(m!==before&&m.trim())return m.trim();
    // 3) "go find/read the book SUBJECT" — peel the retrieval frame down to the work (or '' when
    // it's deictic, e.g. "no go get it", so the caller resolves the work from the conversation).
    const fw=this._findWorkSubject(before);
    if(fw.hit)return fw.subject;
    return before;
  }
  // Resolve a research turn into the topic to chase, the anchor the leash measures drift against,
  // and whether the subject was DERIVED from the chat (a "do more" continuation) rather than named
  // outright. A message that names its own subject is taken as-is; a meta/continuation message
  // hands off to _chatSubject so the walk deepens THIS conversation instead of the word "research".
  _researchSeed(q,cur){
    const intent=this._researchIntent(q);
    // Peel the task framing first ("write me an essay about X" → "X") so the SUBJECT, not the chore,
    // is what gets researched — and so the meta-research test below reads the bare subject.
    const candidate=this._subjectOf((intent&&intent.topic)||q);
    // A "go find/read this WORK" turn (never a research-verb intent) FOCUSES the walk on one work —
    // read it (its actual text when Gutenberg has it) and its context, without fanning out.
    const findWork=!intent&&this._isFindWork(q);
    // A DEICTIC find-work turn ("no go get it", "get the text of the book") named no work of its
    // own — _subjectOf peeled it to ''. The work lives in the conversation, so chase the chat's
    // SUBJECT (the fix for reading "Go Get It" the SONG instead of the book we'd been discussing).
    if(findWork&&!candidate){
      const subject=this._chatSubject(cur);
      if(subject)return {topic:subject,anchor:subject,derived:true,focus:true};
    }
    // A CORRECTION turn ("he is no longer a council member") names no subject of its own — the
    // figure lives in the conversation. Treat it like a continuation: chase the chat's SUBJECT,
    // sharpened with the correction's own content words (the disputed attribute), so the walk
    // researches the figure's CURRENT status rather than the bare correcting sentence.
    if(!intent&&this._isCorrection(q)){
      const subject=this._chatSubject(cur);
      if(subject){const cue=this._researchTerms(q).slice(0,4).join(' ');
        return {topic:this.norm((subject+(cue?(' '+cue):'')).trim()),anchor:subject,derived:true,focus:findWork};}
    }
    if(!this._isMetaResearch(candidate)){
      const topic=this.norm(candidate).replace(/[?.!]+$/,'').trim();
      return {topic,anchor:topic||q,derived:false,focus:findWork};
    }
    const subject=this._chatSubject(cur);
    if(subject)return {topic:subject,anchor:subject,derived:true,focus:findWork};
    const topic=this.norm(candidate).replace(/[?.!]+$/,'').trim();
    return {topic:topic||q,anchor:topic||q,derived:false,focus:findWork};}
  // For a "go deeper" continuation: the most surprising recurring threads ALREADY surfaced in what
  // this chat has read, so "do more research" branches into genuinely new angles of the subject
  // instead of re-fetching the same pages. Reuses the walk's own lead ranking over the in-scope
  // read text, with the subject's own words excluded (they aren't discoveries).
  _seedLeadsFromRead(subject,sources,n){
    if(!this.master||!this.master.pages||!this.master.pages.length)return [];
    const scope=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    const inScope=u=>!scope.length||scope.includes(u);
    let text='';
    for(const p of this.master.pages)if(inScope(p.url))text+=' '+(p.text||(p.sentences||[]).join(' '));
    if(!text.trim())return [];
    const chased=new Set(this._researchTerms(subject));
    const leads=this._leads(new Map(),this._profile(text),chased);
    return leads.slice(0,n||3).map(l=>l.term);}
  // A BATTERY of distinct seed angles for a research turn — so the first pass fans out across
  // several independent threads instead of chaining off ONE query (the "don't do it one shot" ask).
  // For a continuation / "this book" turn the strongest angles are the salient threads the in-scope
  // reading ALREADY raised (real entities/themes of the document, via the walk's own lead ranking);
  // a few neutral facets fill out the breadth so even a bare one-line topic becomes several searches.
  // Returns lead TERMS the walk appends to the anchor (never the subject's own words); capped to stay
  // focused. The seed query (the subject itself) is added by the walk separately.
  // A SIMPLE FACTUAL LOOKUP — "what's the weather in NYC", "what's the temp", "what time is it" —
  // versus a research SUBJECT to explore from several angles. A lookup wants the strongest single
  // answer fast; it must NOT fan out into encyclopedic facets. Appending "analysis"/"history" to a
  // question phrase yields nonsense queries ("what the temp analysis") that drift the walk straight
  // off the question (the live transcript wandered into Wikipedia's "Thermal analysis"). Detected by
  // shape: an explicit live-fact ask (weather/time/price/score), or a short question carrying at most
  // one distinctive content term. Conservative — a real topic with content terms ("the French
  // Revolution", "Ryan Coogler's films") is NOT a lookup and still fans out across angles.
  // A LIVE FACT — an ask about the world's NOW (weather, price, score, headline). One source of
  // truth for three consumers: _shouldWeb (a live fact ALWAYS goes to the web — no reading can
  // hold tomorrow's weather, and chance term-overlap with the sources must never keep it offline),
  // _isSimpleLookup (no facet fan-out), and chatResearch (open-web + date-stamped query — the
  // encyclopedia-first strategy that answers "what is the weather" with meteorology is skipped).
  _isLiveFact(q){
    const s=String(q||'').trim().toLowerCase();
    return !!s&&/\b(weather|temperature|temp|forecast|how (?:hot|cold|warm)|raining|snowing|humidity|wind|air quality|what time|time is it|today'?s? date|price of|stock price|exchange rate|the score|who won|how much is|latest|breaking news|headlines?)\b/.test(s);
  }
  _isSimpleLookup(q){
    const s=String(q||'').trim().toLowerCase();
    if(!s)return false;
    // live, real-time or point facts a multi-hop "exhaust the threads" walk only muddies
    if(this._isLiveFact(s))return true;
    // otherwise: a short, question-shaped ask carrying ≤1 distinctive content term is a lookup
    const isQuestion=/^(what|whats|what'?s|who|whose|when|where|which|how|is|are|was|were|does|do|did|can|will)\b/.test(s)||s.endsWith('?');
    return isQuestion&&this._researchTerms(s).length<=1;
  }
  _researchBattery(subject,derived,sources){
    // A lookup gets no battery — just the seed query, answered shallow (no facet drift).
    if(!derived&&this._isSimpleLookup(subject))return [];
    const out=[],seen=new Set(this._researchTerms(subject));
    const add=t=>{t=this.norm(String(t||'')).trim();const k=t.toLowerCase();if(t&&!seen.has(k)){seen.add(k);out.push(t);}};
    // (1) the document's own salient threads — only when deepening read sources, so a fresh named
    // topic never seeds from unrelated reading already in memory.
    const cap=this._depthCfg().facets;   // shallow 2 · deep 4 · obsessive 5 — how wide the battery
    if(derived)for(const t of this._seedLeadsFromRead(subject,sources,4))add(t);
    // (2) neutral facets — breadth for any subject, so it's a battery even with nothing read yet.
    for(const f of ['overview','analysis','history','significance','criticism','examples']){if(out.length>=cap)break;add(f);}
    return out.slice(0,cap);}
  // The read context for a question, as the verbatim spans the model leans on (plus the
  // source chips/entities to show). `sources` is the chat's source set — empty ranges over
  // everything read. Empty spans when nothing relevant has been read.
  groundNotes(q,sources){const scope=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    const a=this.answerQuestion(q,scope);
    const span=i=>({text:this._clipPassage(this.norm(this.master.sentences[i])),score:1,i,u:this.master.sentenceSource[i]});
    // `relevant` = the question actually matched read text (keyword overlap). Only relevant
    // spans are shown as linked grounding; the fallback below still feeds the model context
    // but is NOT surfaced as a citation (it isn't really "where the answer came from").
    if(a.refs&&a.refs.length)return {spans:a.refs.map(span),entities:a.entities||[],sources:a.sources||[],relevant:true};
    // No keyword match (e.g. "what is this about?", "summarize this book") — fall back to the
    // opening lines of the source(s) in scope (or the page being viewed) so the model speaks
    // from the actual text instead of answering as a blank-slate assistant.
    const inScope=scope.length?(u=>scope.includes(u)):(u=>u===this.state.viewUrl);
    if(this.master&&this.master.sentences.length&&(scope.length||this.state.viewUrl)){
      const idxs=[],used=new Set();
      for(let i=0;i<this.master.sentences.length&&idxs.length<8;i++){const u=this.master.sentenceSource[i];if(!inScope(u))continue;const low=this.norm(this.master.sentences[i]).toLowerCase();if(this._proseOk(low)){idxs.push(i);used.add(u);}}
      if(idxs.length)return {spans:idxs.map(span),entities:a.entities||[],sources:[...used],relevant:false};
    }
    return {spans:[],entities:a.entities||[],sources:[],relevant:false};}
  // ── The generation pipeline as the essay path (src/reader/eo-gen.js) ──────────
  // On unless explicitly disabled — persisted like the other composer toggles.
  _essayPipelineOn(){try{return localStorage.getItem('eo_essay_pipeline')!=='0';}catch(e){return true;}}
  toggleEssayPipeline(){let on=true;try{on=!this._essayPipelineOn();localStorage.setItem('eo_essay_pipeline',on?'1':'0');}catch(e){}this.setState(s=>({essayPipeline:on}));}
  // A RICH ground for the arc: many in-scope sentences scored by keyword overlap (answerQuestion
  // keeps only the top 3 — too thin to develop). Returns up to `n` spans {i,score,text,u}, the
  // shape eo-gen.toGround consumes. Prose only; segmentation artifacts skipped. Falls back to the
  // source's opening prose when the keyword match is thin, so the arc always has body to walk.
  _essaySpans(q,sources,n=28){
    if(!this.master||!this.master.sentences.length)return [];
    const scope=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    const qwords=String(q||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!this.STOP.has(w));
    const inScope=i=>!scope.length||scope.includes(this.master.sentenceSource[i]);
    const scored=[];
    for(let i=0;i<this.master.sentences.length;i++){
      if(!inScope(i))continue;
      const s=this.norm(this.master.sentences[i]);
      if(s.length>this.MAX_PASSAGE)continue;
      const low=s.toLowerCase();if(!this._proseOk(low))continue;
      let v=0;for(const w of qwords)if(low.includes(w))v++;
      if(v>0)scored.push({i,score:v,text:this._clipPassage(s),u:this.master.sentenceSource[i]});
    }
    scored.sort((a,b)=>b.score-a.score||a.i-b.i);
    if(scored.length<6){
      for(let i=0;i<this.master.sentences.length&&scored.length<n;i++){if(!inScope(i))continue;const s=this.norm(this.master.sentences[i]);if(s.length>this.MAX_PASSAGE)continue;const low=s.toLowerCase();if(!this._proseOk(low))continue;if(!scored.some(x=>x.i===i))scored.push({i,score:0.5,text:this._clipPassage(s),u:this.master.sentenceSource[i]});}
    }
    return scored.slice(0,n);
  }
  // RESEARCH BEFORE THE ESSAY — gather the ground the essay organ writes over. The essay organ
  // (runOrganEssay → composeEssay) otherwise composes purely from the model's parametric prior,
  // which on a 3B model means a confident, ungrounded dolphin blurb. This does what the chat's own
  // research path does, one step ahead of writing: derive the SUBJECT (peeling "write me an essay
  // about" down to "dolphins"), and — when the web is on and the reading doesn't already cover it —
  // run the curiosity walk to read the web and FOLD every page into memory, narrating each hop into
  // the same live trail. Then pool the strongest in-scope spans (the freshly read pages ∪ whatever
  // this chat already reads) as the excerpts the organ grounds each section in.
  //   returns [] — nothing to ground on (web off with nothing read, or no contentful subject);
  //               the organ composes parametrically, exactly as before.
  //   returns [excerpts] — the researched ground for composeEssay.
  //   returns null — the user stopped mid-walk; the caller must bail (the bubble is finalized).
  async _gatherEssayGround(id,q,cur){
    const seed=this._researchSeed(q,cur);
    const subject=this.norm(seed.topic||'');
    const anchor=seed.anchor||subject;
    // No contentful subject to chase (a bare "write an essay" with no topic) → nothing to research.
    if(!subject||!this._researchTerms(subject).length)return [];
    const existing=this.chatSourcesOf(cur);
    const isolated=this.chatIsolated(cur);
    let gathered=[];
    // Go to the web only when it's on AND the in-scope reading doesn't already cover the subject —
    // an isolated / net-new chat grounds nothing from the library, so it always reads when on.
    const webOn=this.state.webBrain!==false;
    const covered=!isolated&&this.groundNotes(subject,existing).relevant;
    if(webOn&&!covered){
      this._beat(id,'start','Researching “'+subject+'” before writing — reading the web and folding it into memory so the essay stands on real sources.');
      this._busy=true;this.setState({busy:true});
      const preEnts=(this.graph&&this.graph.entities&&this.graph.entities.size)||0;
      const extraSeeds=seed.focus?[]:this._researchBattery(subject,seed.derived,existing);
      let walk={readUrls:[],hops:[]};
      try{walk=await this._curiosityWalk(subject,anchor,(k,t)=>this._beat(id,k,t),{extraSeeds});}
      catch(e){this._beat(id,'warn','Research stopped — '+((e&&e.message)||e));}
      this._busy=false;this.setState({busy:false});
      if(this._stopGen)return null;   // user stopped mid-walk — stopGeneration finalized the bubble
      gathered=[...new Set(walk.readUrls)];
      const learned=Math.max(0,((this.graph&&this.graph.entities&&this.graph.entities.size)||0)-preEnts);
      this._beat(id,'done',gathered.length
        ?('Read '+gathered.length+' source'+(gathered.length!==1?'s':'')+(learned?(' · learned '+learned+' new '+(learned===1?'entity':'entities')):'')+' — writing the essay grounded in it.')
        :'Couldn’t gather fresh sources — writing from what’s already known and read.');
      for(const u of gathered)this.addChatSource(u,id);
    }
    // The ground for the piece: the strongest spans on the subject across the freshly read pages
    // UNION what this chat already reads. Passed by url scope so isolated chats stay isolated when
    // nothing was gathered (→ [], parametric compose).
    const scope=[...new Set([...existing,...gathered])];
    if(!scope.length)return [];
    // Return the SPANS (text + source url + sentence index), not bare strings, so the essay organ
    // can BIND each section's claims back to the span they rest on (eo-gen.essayBinder). The idx/u
    // ride through composeEssay's ground normaliser into the binder's citation.
    return this._essaySpans(subject,scope,20).map(s=>({text:this.norm(s.text),u:s.u,i:s.i})).filter(s=>s.text);
  }
  // Walk the composition over the ground and finalize into the pending assistant bubble.
  // THE OMNIMODAL PATH first (eoGen.composeGrounded → write/composition.js): the plan is read
  // off the surfer's own physics over the gathered reading — each arrest one beat — and a
  // cursor walks it beat by beat, the sentence renderer at the very end, each turn rendered
  // as a turn with its measured weight, the witness and the connective leash on every beat.
  // Falls back to the flat arc (window.eoGen.essay → runContinuation) when the walk resolves
  // nothing (thin ground) or isn't loaded — non-breaking by construction. The audit is kept
  // for export (this._lastEssayAudit).
  _composeWalkOn(){try{return localStorage.getItem('eo_compose_walk')!=='0';}catch(e){return true;}}
  async _pipelineEssay(id,q,sources){
    this._stopGen=false;
    const spans=this._essaySpans(q,sources);
    const guard=this._stallGuard();
    const finish=(text,srcs,extra)=>{const passages=spans.slice(0,3).map(x=>({text:this.norm(x.text),u:x.u}));
      this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst')m[li]={role:'asst',pending:false,text:text||'(nothing to say)',stance:'ground',register:'grounded',reflection:this._reflect(text||''),sources:srcs||[],passages,...(extra||{})};return {...c,messages:m};})}),()=>this._scrollChat());};
    try{
      const model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);
      if(this._composeWalkOn()&&window.eoGen&&window.eoGen.composeGrounded){
        let acc='',raf=0;
        const paint=()=>{raf=0;this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc};return {...c,messages:m};})}),()=>this._scrollChat());};
        const onToken=(t)=>{const sx=String(t||'');if(!sx)return;guard.feed();acc+=sx;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
        // Narrate the movement as it renders: a beat that crosses a turn says so, with the
        // rewrite's measured weight — the dynamics on the surface, not just the conclusions.
        const onBeat=(b)=>{guard.feed();
          if(b.arc&&b.arc.turn)this._beat(id,'lead','The reading turns here'+(b.arc.heaviest?' — the strongest turn':'')+' (weight '+(b.arc.turn.weight||0).toFixed(2)+') — rendering it as a turn.');};
        let w=null;
        try{w=await Promise.race([window.eoGen.composeGrounded({spans,model,signal:guard.signal,onToken,onBeat}),guard.race]);}catch(e){w=null;}
        if(w&&w.draft){
          guard.clear();
          this._lastEssayAudit={kind:'composition',question:q,
            beats:(w.beats||[]).map(b=>({cell:b.cellId,stop:b.stop,site:b.site,band:b.band,arc:b.arc,text:b.text,
              retracted:((b.witness&&b.witness.retractions)||[]).length,leash:b.leash?{clean:b.leash.clean,unlicensed:b.leash.unlicensed.map(u=>u.connective)}:null})),
            flags:w.flags||[],turns:(w.arc&&w.arc.turns)||[],heaviest:(w.arc&&w.arc.heaviest)??null};
          const flagged=(w.flags||[]).length;
          finish(w.draft,[...new Set(spans.map(x=>x.u).filter(Boolean))],
            flagged?{modelNote:flagged+' beat'+(flagged===1?'':'s')+' flagged by the witness or the connective leash — surfaced, never removed.'}:{});
          return;
        }
        // The walk resolved nothing on this ground — fall through to the flat arc.
      }
      const r=await window.eoGen.essay({spans,model,question:q,signal:guard.signal});
      guard.clear();
      this._lastEssayAudit=r.audit;
      finish(r.text,r.sources||[]);
    }catch(e){
      guard.clear();
      this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst')m[li]={role:'asst',pending:false,text:'The arc could not complete: '+((e&&e.message)||e),stance:'ground'};return {...c,messages:m};})}));
    }
  }
  // ── THE ESSAY ORGAN in the reader's chat (src/organs/out/essay.js via eo-gen.js) ──────
  //
  // Distinct from _pipelineEssay above (the longgen arc over a READING ground): this is the
  // commission-driven organ — plan an outline, write section after section until the piece
  // clears the ≥2500-word floor, land on a conclusion — steered by the essay TYPE picked on
  // the composer. Each type is a template that LEARNS (organs/out/essay-types.js): every
  // completed essay folds into the type's stored profile (which headings produced real prose,
  // the section length it actually writes), and the profile steers the next run. Profiles
  // persist per type under eo_essay_profile_<id>; the selected type under eo_essay_type.
  //
  // THE THINKING IS VISIBLE: the walk narrates itself into the pending bubble's live trail —
  // the plan lands as beats (the title, then every section of the outline), each section opens
  // with a "Writing §n …" status and closes with its word count against the floor, and the
  // essay itself STREAMS into the bubble as markdown while it is written. The same reasoning-
  // trace surface every other turn uses (_setThink/_beat), fed by the organ's hooks.
  _essayOrganReady(){return typeof window!=='undefined'&&!!(window.eoGen&&window.eoGen.essayCompose&&window.eoGen.essayTypes);}
  // THE DISCOURSE STEER — the essay organ is ONE option, never the default for anything
  // essay-shaped. It fires from explicit places (the /essay command, the Write button) and, for
  // natural-language make-this asks, from the discourse metacognition: sendChat's steer gate reads
  // the settled route + form off the model's own speech (meta-route.js — physics, not regex) and
  // OFFERS the organ for permission here. This replaces the old `_essayIntent` regex, which guessed
  // and ran without asking (and kept hijacking essay-shaped questions, #319/#320).
  //
  // _steerOf(read) → { typeId, kindId, label, short } | null — turns the measured form into a
  // concrete, RUNNABLE output steer. Poem → composeArtifact; essay/story → the essay organ with
  // the measured kind (story maps to narrative, the picker's story-shaped form). Scaffold formats
  // (report/summary) are never reached: metaRoute's form grain only settles poem/story/essay.
  _steerOf(read){
    if(!read)return null;
    if(read.kind==='poem')return {typeId:'poem',kindId:null,label:'a poem',short:'a poem'};
    if(read.kind==='essay'||read.kind==='story'){
      if(!this._essayOrganReady())return null;              // no organ → can't offer to run it
      const list=this._essayTypesList();
      let kindId=read.kind==='story'?'narrative':(read.steerKind||this.state.essayType||'argument');
      const meta=list.find(t=>t.id===kindId)||list[0];kindId=meta.id;
      const label='a'+(/^[aeiou]/i.test(meta.label)?'n ':' ')+meta.label.toLowerCase()+' essay';
      return {typeId:'essay',kindId,label,short:label};
    }
    return null;
  }
  // Park the permission suggestion in the turn's pending bubble instead of answering. The stored
  // `suggest` carries what "Write it" needs (topic + the measured output type/kind); the view
  // renders the prompt and the two buttons (onSuggestWrite / onSuggestAnswer in the message map).
  _parkSteer(id,q,steer){
    const text='I think you may want me to write '+steer.label+' on this. Want me to?';
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst')m[li]={...m[li],pending:false,think:'',text:'',stance:'ground',
        research:m[li].research?{...m[li].research,done:true}:undefined,
        suggest:{topic:q,typeId:steer.typeId,kindId:steer.kindId,label:steer.label,text,
          writeLabel:'Write '+steer.short,answerLabel:'Just answer'}};
      return {...c,messages:m};})}),()=>this._scrollChat());
  }
  // "Write it" — accept the steer. Drop the suggestion turn (its user echo + the parked bubble) so
  // the organ lays down a clean turn of its own with no duplicate echo, then run it. The kind is
  // passed explicitly (setState wouldn't have flushed before runOrganEssay reads it).
  _acceptSteer(chatId,mi){
    const c=(this.state.chats||[]).find(x=>x.id===chatId);if(!c)return;
    const m=c.messages[mi];const sug=m&&m.suggest;if(!sug)return;
    const{topic,typeId,kindId}=sug;
    this._dropTurnAt(chatId,mi);
    if(typeId==='essay'){this.setEssayType(kindId);this.setState({outputType:'essay'});this.runOrganEssay(topic,kindId);}
    else if(typeId==='poem'){this.setState({outputType:'poem'});this.composeArtifact(topic);}
  }
  // "Just answer" — decline the steer. Drop the suggestion turn and re-send the topic with
  // steerBypass so it answers normally, without the steer gate re-firing.
  _declineSteer(chatId,mi){
    const c=(this.state.chats||[]).find(x=>x.id===chatId);if(!c)return;
    const m=c.messages[mi];const sug=m&&m.suggest;if(!sug)return;
    const topic=sug.topic;
    this._dropTurnAt(chatId,mi);
    this.sendChat(topic,{steerBypass:true});
  }
  // Remove the suggestion turn: the parked assistant bubble at mi and the user echo just before it.
  _dropTurnAt(chatId,mi){
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==chatId)return c;const m=c.messages.slice();
      if(mi>=0&&mi<m.length){const start=(mi>0&&m[mi-1]&&m[mi-1].role==='user')?mi-1:mi;m.splice(start,(mi-start)+1);}
      return {...c,messages:m};})}));
  }
  // The UI list of types: the organ registry when loaded, else this fallback (same ids), so
  // the picker renders before the module lands. `desc` is the picker's one-line gloss.
  _ESSAY_FALLBACK(){return [
    {id:'argument',label:'Argument',desc:'stake a claim, meet objections, press it home'},
    {id:'explainer',label:'Explainer',desc:'make a hard subject genuinely clear'},
    {id:'narrative',label:'Narrative',desc:'carry the ideas on scenes, people, and time'},
    {id:'review',label:'Review',desc:'judge it against criteria, land a verdict'},
    {id:'reflection',label:'Reflection',desc:'think on the page, in the first person'}];}
  _essayTypesList(){const ET=this._essayOrganReady()?window.eoGen.essayTypes:null;const fall=this._ESSAY_FALLBACK();
    if(!ET)return fall;
    return ET.ESSAY_TYPES.map(t=>{const f=fall.find(x=>x.id===t.id);return {id:t.id,label:t.label,desc:(f&&f.desc)||''};});}
  _essayTypeMeta(){const idv=this.state.essayType||'argument';const list=this._essayTypesList();return list.find(t=>t.id===idv)||list[0];}
  // The learned profile for a type — localStorage, dropped (fresh) when malformed.
  _essayProfile(typeId){const ET=this._essayOrganReady()?window.eoGen.essayTypes:null;if(!ET)return null;
    try{return ET.profileFromJSON(localStorage.getItem('eo_essay_profile_'+typeId))||ET.emptyProfile(typeId);}
    catch(e){return ET.emptyProfile(typeId);}}
  _saveEssayProfile(p){try{localStorage.setItem('eo_essay_profile_'+p.type,window.eoGen.essayTypes.profileToJSON(p));}catch(e){}}
  setEssayType(idv){try{localStorage.setItem('eo_essay_type',idv);}catch(e){}this.setState({essayType:idv,essayMenuOpen:false});}
  toggleEssayMenu(){this.setState(s=>({essayMenuOpen:!s.essayMenuOpen}));}
  // THE OUTPUT PICKER — the composer's single "what to write" control. Top level is the output
  // FORMAT; each format opens a submenu of KINDS. Essay is wired (organs/out/essay.js, learning
  // types); report/summary/poem are scaffolds — shown so the shape is visible, `ready:false` until
  // their organs (organs/out/*) are wired to the composer. Icons are Phosphor codepoints.
  _OUTPUT_TYPES(){return [
    {id:'essay',   label:'Essay',   icon:'', desc:'a ≥2,500-word piece that thinks out loud', ready:true},
    {id:'report',  label:'Report',  icon:'', desc:'structured findings, section by section', ready:false},
    {id:'summary', label:'Summary', icon:'', desc:'the short of it — the gist, kept honest', ready:false},
    {id:'poem',    label:'Poem',    icon:'', desc:'carry the idea in verse', ready:false}];}
  _outputTypeMeta(){const idv=this.state.outputType||'essay';const list=this._OUTPUT_TYPES();return list.find(t=>t.id===idv)||list[0];}
  // The kinds under a format. Only essay carries real, learning kinds today; the rest are scaffolds
  // (empty here → the menu shows a "coming soon" note in their place).
  _outputKinds(typeId){return typeId==='essay'?this._essayTypesList():[];}
  setOutputType(typeId,kindId){const patch={outputType:typeId,essayMenuOpen:false};
    if(typeId==='essay'&&kindId){patch.essayType=kindId;try{localStorage.setItem('eo_essay_type',kindId);}catch(e){}}
    try{localStorage.setItem('eo_output_type',typeId);}catch(e){}
    this.setState(patch);}
  toggleOutputExpand(typeId){this.setState(s=>({outputExpanded:s.outputExpanded===typeId?null:typeId}));}
  // The WRITE control is a TOGGLE: it arms/disarms essay mode rather than firing a one-shot write.
  // Armed, sendChat routes each sent turn to the essay organ (the box text is the topic), so the
  // normal Enter/Send triggers the essay — no separate button press per piece. Only the wired essay
  // format arms; a scaffold format is a no-op (its button is disabled in the view too).
  outputGo(){if((this.state.outputType||'essay')!=='essay')return;
    const on=!this.state.essayArmed;
    try{localStorage.setItem('eo_essay_armed',on?'1':'');}catch(e){}
    this.setState({essayArmed:on,essayMenuOpen:false});}
  // Flatten the format→kind tree into a single row list so the view needs no nested sc-for.
  // Each row is a self-describing cell: a FORMAT header (icon + caret, toggles its accordion) or,
  // when that format is expanded, its KIND rows (indented, picking one selects format+kind), or a
  // "coming soon" note for a scaffold format with no kinds yet.
  _outputMenuRows(){const sat=this.state.outputType||'essay';
    const exp=this.state.outputExpanded==null?sat:this.state.outputExpanded;
    const hdr='display:flex;align-items:center;gap:9px;font-size:12px;font-weight:600;text-align:left;padding:7px 9px;border-radius:8px;cursor:pointer;';
    const rows=[];
    this._OUTPUT_TYPES().forEach(t=>{const open=exp===t.id;const selType=sat===t.id;
      rows.push({key:'h-'+t.id,onClick:()=>this.toggleOutputExpand(t.id),
        title:t.ready?(t.label+' — '+t.desc):(t.label+' — not wired yet'),
        style:hdr+'color:'+(selType?'var(--acc)':'var(--ink)')+';background:'+(selType&&!open?'var(--accbg)':'transparent')+';',
        icon:t.icon,iconStyle:'font-family:Phosphor;font-size:15px;line-height:1;flex:0 0 auto;width:20px;text-align:center;color:'+(selType?'var(--acc)':'var(--ink2)')+';',
        label:t.label+(t.ready?'':'  · soon'),
        sub:t.desc,subStyle:'display:block;font-weight:500;font-size:10.5px;color:var(--ink3);',
        caret:open?'▾':'▸'});
      if(!open)return;
      const kinds=this._outputKinds(t.id);
      kinds.forEach(k=>{const sel=selType&&k.id===(this.state.essayType||'argument');
        const p=t.id==='essay'?this._essayProfile(k.id):null;const runs=(p&&p.runs)||0;
        rows.push({key:t.id+'-'+k.id,onClick:()=>this.setOutputType(t.id,k.id),
          title:runs?(k.label+' — learned from '+runs+' '+t.label.toLowerCase()+(runs===1?'':'s')):(k.label+' — '+k.desc),
          style:'display:flex;align-items:flex-start;gap:9px;font-size:12px;font-weight:600;text-align:left;padding:6px 9px 6px 12px;margin-left:16px;border-left:1px solid var(--line2);border-radius:0 8px 8px 0;cursor:pointer;color:'+(sel?'var(--acc)':'var(--ink2)')+';background:'+(sel?'var(--accbg)':'transparent')+';',
          icon:sel?'✓':'',iconStyle:'flex:0 0 auto;width:12px;text-align:center;font-size:11px;color:var(--acc);',
          label:k.label,
          sub:k.desc+(runs?(' · learned from '+runs+' run'+(runs===1?'':'s')):''),
          subStyle:'display:block;font-weight:500;font-size:10.5px;color:var(--ink3);',
          caret:''});});
      if(!kinds.length)rows.push({key:t.id+'-soon',onClick:()=>{},title:'',
        style:'font-size:11px;font-style:italic;color:var(--ink3);padding:5px 9px 7px 37px;',
        icon:'',iconStyle:'display:none;',label:'Not wired yet — coming soon.',sub:'',subStyle:'display:none;',caret:''});});
    return rows;}
  // The ✍ Essay button: commission an essay on whatever is in the box. An empty box gets the
  // scaffold dropped in instead, so the affordance teaches its own use.
  essayGo(){if(!this._essayOrganReady())return;
    const q=this.norm(this.state.chatInput);
    if(!q){this.setState({chatInput:'write an essay on ',essayMenuOpen:false});return;}
    this.runOrganEssay(q);}
  async runOrganEssay(topic,typeIdOverride){
    const q=this.norm(topic);if(!q)return;
    this._stopGen=false;
    const cur=this.activeChatObj();           // the chat being written into (for research scope/subject)
    const G=window.eoGen,ET=G.essayTypes;
    // The type is normally the composer's selected one; a discourse-steered "Write it" passes the
    // kind the metacognition measured, so the accepted essay is the one that was suggested.
    const typeId=typeIdOverride||this.state.essayType||'argument';
    const type=ET.essayTypeOf(typeId)||ET.ESSAY_TYPES[0];
    const floor=G.ESSAY_MIN_WORDS||2500;
    // Seed the user turn + the pending bubble with a live trail, mirroring sendChat.
    let id=this.state.activeChat;
    this.setState(s=>{let chats=s.chats.slice();let idx=chats.findIndex(c=>c.id===id);
      if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(q,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
      const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(q,40);
      chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:q},{role:'asst',text:'',pending:true,think:'Planning the essay…',research:{steps:[{kind:'think',text:'✍ '+type.label+' essay commissioned — a piece of at least '+floor.toLocaleString()+' words.'}],done:false,mode:'think',t0:Date.now()}}]};
      return {chats,activeChat:id,chatInput:'',essayMenuOpen:false};});
    this._scrollChat();this._thinkClock();
    // THE DISCOURSE STEERS THE ESSAY (docs/discourse-routing.md). The Write path used to skip the
    // metacognition and take the box text literally — so a CRITIQUE of the last piece ("that's not
    // an essay") was researched as if "essay" were the subject, and the essay drifted off the thread
    // onto essays-about-essays. Run the SAME read the chat path runs: the talker puts the turn into
    // words for itself. That read streams live (real-time feedback) and rides into the compose cue as
    // a steer — what would satisfy the asker. And when the ask names no subject of its OWN (a critique,
    // "make it longer", "one about them"), the essay is written on the conversation's STANDING subject
    // rather than the literal words. A genuine "write a <form> about SUBJECT" still names its own topic
    // and is untouched. Null read (model cold / failed) → no steer, today's behavior otherwise.
    let subject=q,readSteer='',subjectChanged=false;
    {
      let fold=null;try{fold=await this._convFold(cur);}catch(e){fold=null;}
      // The talker reads the turn in context and puts it into words for itself; that read streams
      // live (real-time feedback) and rides into the compose cue as a steer (what would satisfy the
      // asker). Null read (model cold) → no steer, today's behavior.
      const read=await this._discourseRead(id,q,cur,fold||{stance:null});
      if(this._stopGen)return;
      if(read)readSteer=this._steerLine(read);
      // Does the ask name a subject of its OWN? A "write a <form> about X" frame, or a plain
      // "about/on SUBJECT" tail whose subject isn't a bare pronoun (a pronoun — "about them", "make
      // it better" — points back at the thread, it names nothing new). If it names nothing of its
      // own, this REFINES the standing thread: a critique ("that's not an essay"), "make it longer",
      // "one about them". Write on what the conversation is already about, not the literal words.
      const tail=(String(q).match(/\b(?:about|on|regarding|concerning|covering)\s+(.+)$/i)||[])[1]||'';
      const ownSubject=this._genTopic(q)||((tail&&!/^(?:them|they|it|its|this|that|these|those|him|her|us|one|ones|same|others?)\b/i.test(tail.trim()))?this.norm(tail).replace(/[?.!]+$/,'').trim():'');
      const chatSubj=cur?this._chatSubject(cur):null;      // the thread's standing subject (existing machinery)
      if(ownSubject){
        // The ask NAMES ITS OWN SUBJECT — commission the essay on THAT, not the literal framing
        // ("write an essay on X" → the topic is X, not the whole "write an essay on X" string, which
        // would poison the research query and the title). And detect a SUBJECT CHANGE: an own-subject
        // sharing no content word with the thread's standing subject is a genuine switch (dolphins →
        // fission/fusion), not a refinement. On a switch the essay must stand on sources gathered for
        // the NEW subject, never the standing corpus — so flag it here and suppress the standing-corpus
        // grounded walk below, letting the flat commission walk run over the freshly-gathered ground.
        subject=ownSubject;
        subjectChanged=!!(chatSubj&&this._usableSubject(chatSubj)&&!this._subjectsOverlap(ownSubject,chatSubj));
      }else if(chatSubj&&this._usableSubject(chatSubj)){
        // The ask names nothing of its own (a critique, "make it longer", "one about them") — REFINE
        // the standing thread: write on what the conversation is already about, not the literal words.
        subject=chatSubj;
      }
    }
    // RESEARCH BEFORE WRITING — the "it needs to do research" fix. With the web on, read the subject
    // and FOLD it into memory first (the same curiosity walk the chat uses), so the piece stands on
    // real sources instead of a 3B model's thin, confabulation-prone prior. Web off — or the reading
    // already covers the subject — gathers no fresh pages and composes from what's known, as before.
    // The gathered excerpts ride into essayCompose as its ground. Null return = a user stop mid-walk
    // (stopGeneration already finalized the bubble), so bail without writing over it.
    let essayGround=[];
    // The CREATIVE register commissions the essay from the model alone — no research walk, no
    // binding — so the piece is honest invention and wears the creative badge below.
    const amode=this.state.answerMode||'auto';
    if(amode!=='creative'){
      try{essayGround=await this._gatherEssayGround(id,subject,cur);}
      catch(e){essayGround=[];}
      if(essayGround===null||this._stopGen)return;
    }
    // The register the essay ACTUALLY runs at: grounded when it stands on gathered sources
    // (sections cite-or-strike bound via eo-gen's essayBinder), creative when composed freely.
    const essayRegister=(essayGround&&essayGround.length)?'grounded':'creative';
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst')m[li]={role:'asst',pending:false,stance:'compose',kind:'essay',register:essayRegister,
        research:m[li].research?{...m[li].research,done:true}:m[li].research,text:'',...patch};
      return {...c,messages:m};})}),()=>this._scrollChat());
    // THE LEARNED STEER: the type's stored profile → the voice cue, the heading hints offered
    // to the planner, and the word target the walk runs at. Run one steers from the seed arc.
    const profile=this._essayProfile(typeId);
    const steer=ET.steerFrom(profile,typeId);
    // The essay STREAMS into the bubble as it is written — the live markdown render forms
    // headings and paragraphs mid-walk. RAF-throttled, the same paint the other turns use.
    let acc='',raf=null;
    const paint=()=>{raf=null;this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc};return {...c,messages:m};})}));};
    const push=(t)=>{if(!t)return;acc+=t;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
    // TWO ATTEMPTS. A local CPU model can hang on first load or on the first plan token, leaving a
    // promise that never settles — the stall the user otherwise had to clear by reloading the page.
    // A fresh guard on a second try usually gets past it. Only a STALL with nothing streamed retries;
    // a user stop or a break after real text has streamed is final. The stall budget is widened to
    // 90s because planning a ≥2,500-word essay on a 3B CPU model can be slow to its first token.
    for(let attempt=1;attempt<=2;attempt++){
    acc='';
    const guard=this._stallGuard(90000);
    let model;
    try{model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);}
    catch(e){guard.clear();
      if(e&&e.stopped){finish({text:'_Stopped before the model loaded._'});return;}
      if(attempt<2&&e&&e.stalled){this._beat(id,'warn','The model stalled while loading — retrying once…');continue;}
      finish({text:'The model could not load: '+((e&&e.message)||e)});return;}
    this._setThink(id,'Outlining '+(/^[aeiou]/i.test(type.label)?'an ':'a ')+type.label.toLowerCase()+' essay'+((profile&&profile.runs)?(' — steered by '+profile.runs+' earlier run'+(profile.runs===1?'':'s')+' of this type'):' — first run of this type, steering from its seed arc')+(attempt>1?' — second try':'')+'…');
    try{
      // ONE hook surface, both walks: every hook feeds the stall guard; every painted
      // string is tracked by streamedAny so a failure AFTER tokens landed falls through
      // to the partial-keep catch and never re-composes into the same bubble.
      // groundedWalk: true only while the grounded (surfer-physics) walk is streaming. The flat
      // commission walk aims at the 2,500-word floor, so its live progress reads "N of 2,500"; the
      // grounded walk aims at its own measured target (res.targetWords), not the floor, so it reads
      // plain "N words" — showing "of 2,500" there would misreport a run that never aimed at it.
      let streamedAny=false,prose=false,groundedWalk=false;
      const goalOf=(r)=>(r&&r.targetWords)||floor;
      const hooks={
        onPlanToken:()=>guard.feed(),
        onPulse:()=>guard.feed(),
        onPlan:({title,outline})=>{guard.feed();streamedAny=true;
          this._beat(id,'plan','Outlined “'+title+'” — '+outline.length+' section'+(outline.length===1?'':'s')+' planned:');
          outline.forEach((h,i)=>this._beat(id,'plan','§'+(i+1)+' · '+h));
          push('# '+title+'\n');},
        onSection:({heading,index,words})=>{guard.feed();streamedAny=true;prose=true;
          this._setThink(id,'Writing §'+(index+1)+' “'+heading+'” — '+words.toLocaleString()+(groundedWalk?'':' of '+floor.toLocaleString())+' words so far…');
          push('\n\n## '+heading+'\n\n');},
        onToken:(piece)=>{guard.feed();streamedAny=true;prose=true;push(String(piece||''));},
        onSectionEnd:({heading,index,words,total})=>{guard.feed();
          this._beat(id,'write','§'+(index+1)+' “'+heading+'” landed — '+words+' words ('+total.toLocaleString()+(groundedWalk?'':' of '+floor.toLocaleString())+' total)');},
        // the walk's per-beat audit: witness retractions and over-claiming connectives are
        // surfaced in the thinking trail, flag-and-tell — the prose is never rewritten.
        onBeat:(b)=>{guard.feed();
          if(b.witness&&b.witness.retractions.length)this._beat(id,'write','⚠ a claim the passages do not carry was hedged forward (band void)');
          if(b.leash&&b.leash.unlicensed.length)this._beat(id,'write','⚠ '+b.leash.unlicensed.length+' connective'+(b.leash.unlicensed.length===1?'':'s')+' claim more than the arc holds ('+b.leash.unlicensed.map(c=>c.connective).join(', ')+')');},
      };
      // THE GROUNDED WALK FIRST (eoGen v4, organs/out/essay.js composeEssayGrounded): when
      // the ask runs grounded over an UNSCOPED chat and the merged corpus log is in hand,
      // the plan is read off the surfer physics — each arrest one beat, the witness and
      // the connective leash after every beat, the arc's turns voiced with their measured
      // weight. A chat scoped to specific sources (or isolated) keeps the flat path: the
      // walk rides the whole merged log and would quote pages the chat excluded — the
      // isolation discipline outranks the walk until a scoped doc handle exists. A null
      // walk (no plan, or every beat empty) falls back to the flat commission walk — into
      // the SAME bubble, so a plan-only paint (just the title) is wiped first and the flat
      // path repaints from scratch; only a walk that broke off mid-PROSE keeps its partial.
      let res=null;
      const _sc=this._answerScope(cur,null);
      // The grounded walk reads its plan off the physics of the WHOLE merged corpus (this._logDoc).
      // That is right when the ask continues the thread, but WRONG on a subject CHANGE: it would
      // ground a fission/fusion essay in the standing dolphin corpus. On subjectChanged, skip it and
      // let the flat commission walk run over essayGround — sources gathered for the NEW subject.
      if(essayRegister==='grounded'&&!subjectChanged&&!_sc.isolated&&!_sc.sources.length&&this._logDoc&&typeof G.essayComposeGrounded==='function'&&essayGround&&essayGround.length){
        groundedWalk=true;   // this run reads its progress against its own target, not the floor
        const history=((cur&&cur.messages)||[]).filter(m=>m.role==='user').slice(-4).map(m=>({role:'user',content:m.text||''}));
        this._beat(id,'plan','Composing from the reading’s own arc (grounded walk) — the plan is read off the surfer, not authored.');
        try{res=await Promise.race([G.essayComposeGrounded({model,doc:this._logDoc,topic:subject,signal:guard.signal,
          ground:essayGround,history,hooks}),guard.race]);}
        catch(e){if((e&&e.stopped)||(e&&e.stalled)||prose)throw e;res=null;}
        if(res&&!(res.sections&&res.sections.length))res=null;
        if(!res){
          groundedWalk=false;   // fell back to the flat floor walk — restore floor-relative progress
          if(prose)throw new Error('the grounded walk broke off');
          // plan-only paint (the title) — wipe it so the flat walk repaints cleanly
          if(streamedAny){acc='';streamedAny=false;paint();
            this._beat(id,'plan','The grounded walk found nothing to compose — walking the flat commission instead.');}
        }else{
          // the banner counts SOURCES the beats actually stood on, as urls the reader can open
          const urls=new Set((res.sourceSpans||[]).map(i=>this.master&&this.master.sentenceSource?this.master.sentenceSource[i]:null).filter(Boolean));
          if(res.sourceSpans&&res.sourceSpans.length)res={...res,sourceCount:urls.size};
        }
      }
      if(!res)res=await Promise.race([G.essayCompose({model,topic:subject,signal:guard.signal,
        cue:(steer.cue||'')+(readSteer?('\n\n'+readSteer):''),planHints:steer.planHints,targetPerSection:steer.targetPerSection,
        ground:essayGround&&essayGround.length?essayGround:null,
        hooks}),guard.race]);
      guard.clear();
      // FOLD THE RUN INTO THE TYPE — the learning. An aborted or thin walk teaches nothing.
      // GROUNDED-WALK runs (res.targetWords) don't fold either: their headings are the
      // corpus's own relations ('Grete fed Gregor') and their sections are beat-scale —
      // folding them would hand the NEXT flat commission corpus-specific planHints and
      // drag its section target toward beat size. Typed steering stays with the flat path.
      let learnedLine='';
      if(profile&&!res.targetWords){const folded=ET.foldEssay(profile,res);
        if(folded!==profile){this._saveEssayProfile(folded);
          const next=ET.steerFrom(folded,typeId);
          learnedLine=type.label+' learned from this run — '+folded.runs+' essay'+(folded.runs===1?'':'s')+' folded in; section target now ~'+next.targetPerSection+' words.';
          this._beat(id,'think','✎ '+learnedLine);}}
      // The grounded walk's length is what the reading earned (its own targetWords), not the
      // commission floor — report against the goal the run actually walked at.
      const goal=goalOf(res);const goalName=res.targetWords?'-word target':'-word floor';
      this._beat(id,'think',res.words>=goal
        ?('Done — '+res.words.toLocaleString()+' words across '+res.sections.length+' sections; clears the '+goal.toLocaleString()+goalName+'.')
        :('Done — '+res.words.toLocaleString()+' words across '+res.sections.length+' sections; under the '+goal.toLocaleString()+goalName+'.'));
      // The banner is HONEST about how much of the piece actually bound to the sources — the
      // "grounded in N sources" label no longer stands on its own (that was the failure: a piece
      // that touched no source still wore the badge). When binding ran, report the bound share.
      const boundPct=(typeof res.boundFraction==='number')?Math.round(res.boundFraction*100):null;
      const groundedNote=res.grounded
        ?(' · grounded in '+res.sourceCount+' researched source'+(res.sourceCount===1?'':'s')+(boundPct!=null?(' · '+boundPct+'% of claims tied to them'):''))
        :'';
      const meta='*'+res.words.toLocaleString()+' words · '+res.sections.length+' sections · '+type.label+' essay'+groundedNote+(learnedLine?(' · ✎ '+learnedLine):'')+'*';
      const essayText=(res.text||acc||'').trim();
      // A grounded essay is read back through the EOT reflection like any grounded answer.
      finish({text:essayText+'\n\n---\n'+meta,
        reflection:essayRegister==='grounded'?this._reflect(essayText):null});
      return;
    }catch(e){guard.clear();
      const partial=acc.trim();
      const words=(partial.match(/\S+/g)||[]).length;
      if(e&&e.stopped){finish({text:partial?(partial+'\n\n---\n*⏹ Stopped at '+words.toLocaleString()+' words.*'):'_Stopped._',stopped:true});return;}
      if(partial){finish({text:partial+'\n\n---\n*The walk broke off at '+words.toLocaleString()+' words: '+((e&&e.message)||e)+'*'});return;}
      // Nothing streamed. If it STALLED and a try remains, go around once more with a fresh guard
      // before giving up — a transient first-token hang usually clears on the retry.
      if(attempt<2&&e&&e.stalled){this._beat(id,'warn','The writer stalled before the first line — retrying once…');continue;}
      {
        // FAIL SOFT, like the answer path (sendChat's catch): a stall or model error with NOTHING
        // streamed shouldn't dead-end an essay ask. Degrade to the reading's own structural answer,
        // labeled honestly and wearing the full grounding apparatus (refs/passages/sources) so the
        // citations bind like any other grounded turn. An isolated chat draws on nothing read, so
        // there is no structural fallback to pull from — say so plainly (the sibling's rule).
        const why=(e&&e.stalled)?'the chat model stalled':((e&&e.message)||e);
        const _sc=this._answerScope(cur,null);
        const scope=[...new Set((essayGround||[]).map(s=>s&&s.u).filter(Boolean))];
        const fb=_sc.isolated?null:this.answerQuestion(subject,scope.length?scope:_sc.sources);
        if(fb&&fb.refs&&fb.refs.length){
          const passages=fb.refs.map(i=>({text:this.norm(this.master.sentences[i]),u:this.master.sentenceSource[i],i}));
          finish({text:fb.text,refs:fb.refs,entities:fb.entities,sources:fb.sources,passages,groundKind:'matched',
            modelNote:'Answered from your reading — '+why+' before the essay could be composed.',
            register:'grounded',reflection:this._reflect(fb.text)});
        }else finish({text:'The essay could not complete: '+why});
        return;
      }
    }
    }
  }
  // CREATIVE GENERATION over a topic — "write an emily dickinson poem about iced coffee",
  // "compose an essay on dolphins", "draft a haiku about the sea". The frame (write/compose/draft
  // + poem/essay/song/…) names a FORM, and the real topic rides in the "about/on X" tail. Taken at
  // face value the frame VERB "write" overlaps a corpus about a "writer" (Gervase of Chichester is
  // literally a "writer" with a "Writings" section) and marks the turn grounded — so a Dickinson-
  // poem-about-iced-coffee request composes from a Gervase article instead of going to read about
  // iced coffee. Return the bare topic so routing can ground on THAT, not the frame verb, and send
  // the turn to the web when the topic is something the reading never covered.
  _genTopic(q){
    const m=String(q||'').match(/\b(?:write|compose|draft|create|generate|produce|pen|craft)\b[^.?!]*?\b(?:poem|haiku|sonnet|limerick|verse|essay|story|song|lyrics?|rap|ballad|ode|tale|piece|article|blog\s*post|screenplay|script)\b\s+(?:about|on|regarding|concerning|describing|inspired\s+by|in\s+the\s+style\s+of)\s+(.+)$/i);
    if(m&&m[1]){const t=this.norm(m[1]).replace(/[?.!]+$/,'').trim();if(t.length>1)return t;}
    return null;}
  // ── The named-subject gate (the "essay about Grok" failure), the reader's copy ──
  // The same hole the answerabilityGate closes in the turn pipeline (src/longgen/answerable.js,
  // wired into src/turn/stages.js), brought to the path this UI actually runs: the Reader
  // answers in its OWN sendChat / _longformArc, never through that pipeline, so the gate there
  // never sees these turns. The failure: eight pages about Errol Musk, "write me a long essay
  // about Grok", incidental word overlap ("long" inside "no longer") that marked the sources
  // relevant and kept the turn offline, and a 3B model that then invented sections about a Grok
  // it made up — even narrating its own void ("I don't have any information about Grok") and
  // confabulating anyway. So: read the proper-noun SUBJECTS out of the question and require at
  // least one to be known to the in-scope reading (its entity labels or read sentences). When
  // none is, the request is about something never read — route it to the web (web on) or answer
  // honestly that it isn't in the sources (web off), never walk the irrelevant spans. A turn
  // that names no specific subject ("summarize this") names nothing to be absent and passes.
  _namedSubjects(q){
    if(!this._subjStop)this._subjStop=new Set(('write writes wrote writing written compose composed draft produce generate create created make made give given tell explain explaining describe summarize summarise discuss outline report overview account analyze analyse please what who whom when where why how which is are was were the a an this that about me my your long longer short brief detailed comprehensive thorough essay essays piece article guide on of for and or to in into with').split(/\s+/));
    const out=new Set();
    for(const m of String(q||'').match(/\b[A-Z][A-Za-z'’-]{2,}\b/g)||[]){
      if(this._subjStop.has(m.toLowerCase()))continue;
      out.add(m);
    }
    return [...out];
  }
  // Does the in-scope reading know one named subject? Case-insensitive contains both ways,
  // so "Musk" matches the entity "Errol Musk" and vice versa.
  _subjectKnown(subj,scopes){
    const t=String(subj||'').toLowerCase();if(!t)return false;
    if(this.graph)for(const e of this.graph.entities.values()){
      if(!this.showable(e.id))continue;
      const lab=this.labelOf(e.id).toLowerCase();
      if(lab&&(lab.includes(t)||t.includes(lab)))return true;
    }
    if(this.master&&this.master.sentences){
      const inScope=u=>!scopes.length||scopes.includes(u);
      for(let i=0;i<this.master.sentences.length;i++){
        if(!inScope(this.master.sentenceSource[i]))continue;
        if(this.norm(this.master.sentences[i]).toLowerCase().includes(t))return true;
      }
    }
    return false;
  }
  // Licensed unless EVERY named subject is absent from the reading. No named subject → licensed
  // (nothing to be absent). At least one known → licensed (a "compare X and Grok" still walks X).
  _subjectsKnown(q,sources){
    const subs=this._namedSubjects(q);
    if(!subs.length)return true;
    const scopes=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    return subs.some(s=>this._subjectKnown(s,scopes));
  }
  // The honest answer when the subject isn't in the reading — names what WAS read and how to
  // reach what wasn't, instead of inventing it. Used on every offline path that would otherwise
  // hand the model irrelevant spans and a question about a subject it never read.
  _noSubjectPatch(q,sources){
    const subj=this._namedSubjects(q).slice(0,3).join(', ');
    const what=this.chatOrientation(sources);
    const tail=(this.state.webBrain===false)
      ? 'Turn the web on (the ✦ toggle on the composer) and I’ll go read about it — or ask me about what’s here.'
      : 'I couldn’t find it in the sources — ask me about what’s here, or I can look it up on the web.';
    const text='I haven’t read anything about '+(subj?('“'+subj+'”'):'that')+'. What I have read is '+what+'. '+tail;
    return {text,groundKind:'model',disclosure:'Not grounded in your reading — the sources don’t mention this.',related:this.relatedDocs(q,sources)};
  }
  // Disclose WHERE an answer is grounded — honestly, so a summary never reads as fact
  // pulled from the page when it was really the model drawing the lines together. Maps a
  // groundNotes result (+ sendChat's `grounded` flag) onto the chip's three modes:
  //   'matched' — read lines that actually MATCHED the question (the firmest footing): the
  //               verbatim passages are shown as the grounding, no caveat needed.
  //   'opening' — no line matched (e.g. "summarize this"): the answer leaned on the OPENING
  //               lines of the source(s) in scope. Those lines are still shown — so you can
  //               see what it drew on — but labelled as the source's opening, and disclosed
  //               as drawn-together-in-the-model's-words, not lifted from one matched line.
  //   'model'   — nothing from the reading bore on it. The reply is the model's OWN words;
  //               we say so plainly (graph-only → "the shape of what you've read"; no
  //               document at all → "not grounded in a source") rather than implying a cite.
  // `grounded` is sendChat's flag (spans OR a meaning graph existed) — it separates the
  // graph-only case from the no-document case in the 'model' disclosure.
  _groundReport(ground,grounded){
    const spans=((ground&&ground.spans)||[]).map(s=>({text:s.text,u:s.u,i:s.i}));
    if(ground&&ground.relevant&&spans.length)
      return {groundKind:'matched',passages:spans,sources:ground.sources||[],disclosure:''};
    if(spans.length)
      return {groundKind:'opening',passages:spans,sources:(ground&&ground.sources)||[],
        disclosure:'No passage matched your question directly — this draws together the opening of the source, in the model’s own words.'};
    return {groundKind:'model',passages:[],sources:[],
      disclosure:grounded
        ? 'Drawn from the overall shape of what you’ve read, not any one passage — the wording is the model’s own.'
        : 'The model’s own answer — nothing you’ve read bears on it, so it isn’t grounded in a source.'};
  }
  // ── The office veto — a stale role the SOURCES have succeeded ─────────────────
  // The reader's claim-grain check (docs/proposition-audit.md; the engine sibling lives
  // in src/factcheck/propositions.js). The model can call a current mayor "a council
  // member" off a year-old page — and the grounding it has is relation-shaped, so a
  // one-place "X is a council member" is never checked. After the answer is composed we
  // read the OFFICE claims it makes and the offices the IN-SCOPE sources attest (each at
  // the line it sits on, so "as a council member he WAS a critic" reads former, distinct
  // from "he IS the mayor"); if the answer gives a stale EXCLUSIVE seat (mayor, council
  // member, governor, …) as current while the sources currently witness a DIFFERENT one,
  // the correction is appended beside the answer. Flag-and-tell — the model's words ride.
  _ox(){
    if(this._oxCache)return this._oxCache;
    // canonical head → exclusive? (1 = a seat held one-at-a-time, so a transition between
    // two of them is the supersession we catch; 0 = a co-occurring title that never does).
    const O=new Map([['council member',['councilmember',1]],['councilmember',['councilmember',1]],['councilman',['councilmember',1]],['councilwoman',['councilmember',1]],['councilor',['councilmember',1]],['councillor',['councilmember',1]],['alderman',['alderman',1]],['alderwoman',['alderman',1]],['mayor',['mayor',1]],['governor',['governor',1]],['senator',['senator',1]],['president',['president',1]],['vice president',['vice-president',1]],['prime minister',['prime-minister',1]],['representative',['representative',1]],['congressman',['representative',1]],['congresswoman',['representative',1]],['chancellor',['chancellor',1]],['premier',['premier',1]],['sheriff',['sheriff',1]],['attorney general',['attorney-general',1]],['chief executive',['ceo',1]],['ceo',['ceo',1]],['supervisor',['supervisor',1]],['ambassador',['ambassador',1]],['king',['king',1]],['queen',['queen',1]],['pope',['pope',1]],['chair',['chair',0]],['chairman',['chair',0]],['chairwoman',['chair',0]],['director',['director',0]],['founder',['founder',0]],['owner',['owner',0]],['editor',['editor',0]],['secretary',['secretary',0]],['minister',['minister',0]],['coach',['coach',0]],['professor',['professor',0]],['chief',['chief',0]]]);
    // A case-insensitive class for a word WITHOUT a /i flag — /i would let the [A-Z] name
    // pattern match lowercase and swallow "signed the order" into a name. Offices/qualifiers
    // match either case here; names stay strictly Capitalized.
    const ci=w=>w.split('').map(ch=>/[a-z]/i.test(ch)?('['+ch.toLowerCase()+ch.toUpperCase()+']'):(ch===' '?'\\s+':ch)).join('');
    const OFFICE_ALT=[...O.keys()].sort((a,b)=>b.length-a.length).map(ci).join('|');   // longest first: "vice president" before "president"
    const FORMER_PFX=['former','ex-?','onetime','then-?','outgoing','incoming','previous'].map(ci).join('|');
    const NAME="[A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){0,3}";
    const appos=new RegExp('\\b((?:'+FORMER_PFX+')\\s+)?((?:'+OFFICE_ALT+'))\\s+('+NAME+')','g');                                               // "[former] Mayor Freddie O’Connell"
    const cop=new RegExp('\\b('+NAME+')\\s+(?:[Ii]s|[Ww]as|[Aa]re|[Ww]ere|[Bb]ecame|serves\\s+as|served\\s+as)\\s+(?:now\\s+)?(?:[aA]n?|[tT]he)?\\s*((?:'+FORMER_PFX+')\\s+)?(?:[A-Za-z]+\\s+){0,2}?((?:'+OFFICE_ALT+'))\\b','g');   // "Freddie O’Connell is a [former] [Metro] council member"
    return this._oxCache={O,appos,cop};
  }
  _personKey(name){const ts=String(name).toLowerCase().replace(/['’]/g,'').split(/[^a-z0-9]+/).filter(Boolean);return ts.length?ts[ts.length-1]:null;}   // surname, apostrophes stripped so O’Connell == OConnell
  _canonOffice(p){const x=this._ox().O;const k=String(p).toLowerCase().replace(/\s+/g,' ').trim();return x.get(k)||x.get(k.replace('council member','councilmember'))||null;}
  _officeClaims(text){
    const out=[],s=String(text||''),L=this._ox();
    for(const m of s.matchAll(L.appos)){const c=this._canonOffice(m[2]);if(!c)continue;out.push({name:m[3],pk:this._personKey(m[3]),head:c[0],exclusive:!!c[1],former:!!m[1]});}
    for(const m of s.matchAll(L.cop)){const c=this._canonOffice(m[3]);if(!c)continue;const former=!!m[2]||(/\b[Ww]as\b|\b[Ww]ere\b/.test(m[0])&&!/\b[Ii]s\b|\b[Aa]re\b|\bnow\b/.test(m[0]));out.push({name:m[1],pk:this._personKey(m[1]),head:c[0],exclusive:!!c[1],former});}
    return out;
  }
  _auditOffices(text,sources){
    try{
      if(!text||!this.master||!this.master.sentences||!this.master.sentences.length)return null;
      const scope=new Set((sources||[]).map(u=>typeof u==='string'?u:(u&&(u.url||u.u))).filter(Boolean));
      const inScope=u=>!scope.size||scope.has(u);
      const facts=new Map(),at=pk=>facts.get(pk)||facts.set(pk,{current:new Set(),former:new Set()}).get(pk);
      for(let i=0;i<this.master.sentences.length;i++){if(!inScope(this.master.sentenceSource[i]))continue;for(const f of this._officeClaims(this.master.sentences[i])){if(!f.pk||!f.head)continue;(f.former?at(f.pk).former:at(f.pk).current).add(f.head);}}
      if(!facts.size)return null;
      const corr=[];
      for(const c of this._officeClaims(text)){
        if(!c.exclusive||c.former||!c.pk)continue;                       // only a CURRENT exclusive office can be stale
        const fa=facts.get(c.pk);if(!fa||fa.current.has(c.head))continue; // the answer's office IS attested current → fine
        const succ=[...fa.current].filter(h=>h!==c.head);                // a different current seat → it was succeeded
        if(succ.length){corr.push('The sources give '+c.name+'’s current office as '+succ[0].replace(/-/g,' ')+', not '+c.head.replace(/-/g,' ')+'.');continue;}
        if(fa.former.has(c.head))corr.push('The sources mark '+c.name+' as a former '+c.head.replace(/-/g,' ')+', not a current one.');
      }
      return corr.length?corr.join(' '):null;
    }catch(e){return null;}
  }
  _withOfficeNote(text,sources){try{const c=this._auditOffices(text,sources);return c?(text+'\n\n> **Note:** '+c):text;}catch(e){return text;}}
  // Other read documents OUTSIDE the chat's scope, ranked by how well they match the
  // question (content-word overlap). The "related" set offered alongside an answer —
  // especially when the in-scope sources didn't ground it well. Empty if nothing else
  // read matches. Ranked desc; the UI shows only the top few by default.
  relatedDocs(q,sources){
    if(!this.master||!this.master.sentences.length)return [];
    const scope=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    const qwords=q.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!this.STOP.has(w));
    if(!qwords.length)return [];
    // "Related" has to mean a shared SUBJECT, not an incidental common word — otherwise
    // every other thing you've read shows up just for containing "name" or "story". Keep
    // only the query words that name a folded entity (a real proper-noun subject); if the
    // question names nothing distinctive, surface nothing rather than a wall of noise.
    const salient=new Set();
    if(this.graph)for(const e of this.graph.entities.values()){
      if(!this.showable(e.id))continue;
      const lab=this.labelOf(e.id).toLowerCase(),toks=lab.split(/\s+/);
      for(const w of qwords){if(lab===w||toks.includes(w)||(w.length>4&&lab.includes(w)))salient.add(w);}
    }
    if(!salient.size)return [];
    const byUrl={};
    for(let i=0;i<this.master.sentences.length;i++){
      const u=this.master.sentenceSource[i];if(!u||scope.includes(u))continue;
      const low=this.norm(this.master.sentences[i]).toLowerCase();if(!this._proseOk(low))continue;
      let v=0;for(const w of salient)if(low.includes(w))v++;
      if(v>0)byUrl[u]=(byUrl[u]||0)+v;
    }
    // A real footing, not one stray mention: the subject has to actually recur in the doc.
    return Object.keys(byUrl)
      .filter(u=>byUrl[u]>=2)
      .map(u=>({url:u,score:byUrl[u],title:this.truncLabel(((this.pageOf(u)||{}).title)||this.short(u),28)}))
      .sort((a,b)=>b.score-a.score).slice(0,8);
  }
  // The entity a chat turn is really ABOUT — the folded name most mentioned across the
  // question and its answer, tie-broken by overall weight. Drives the panel pivot so the
  // right rail follows the conversation. Reuses the link index (full names + aliases).
  _chatTopicEntity(text){
    if(!this.graph||!text)return null;
    this.buildLinkIndex();const map=this._linkMap,re=this._linkRe;if(!re)return null;
    const counts=new Map();re.lastIndex=0;let m,n=0;
    while((m=re.exec(text))&&n<800){n++;const id=map.get(m[0].toLowerCase());if(id==null)continue;counts.set(id,(counts.get(id)||0)+1);}
    let best=null,bestScore=-1;
    for(const [id,c] of counts){if(!this.graph.entities.has(id))continue;const s=c*100+this.weightOf(this.graph.entities.get(id));if(s>bestScore){bestScore=s;best=id;}}
    return best;
  }
  // Pivot the right panel to the latest topic of the chat. Stays out of the way on a phone
  // (where it would steal the chat pane) and never re-pivots to what's already shown.
  _pivotChatPanel(text){
    if(this.phone())return;
    const id=this._chatTopicEntity(text);
    if(id==null||!this.graph||!this.graph.entities.has(id)||this.state.panelSel===id)return;
    this._panelStack=[];
    this.setState({panelSel:id,rightOpen:true,panelLens:null});
    try{this._highlightFirst(id);}catch(e){}this._scrollPanelTop();
  }
  // ── The meaning graph, serialized as EOT triples for the talker ───────────
  // What the reading MEANS, folded into typed relations: "A -> B : rel" for a
  // relationship, "A : fact" for a property. This is the structure buildGroundedMessages
  // reinstates (its `graph` slot) so the chat reasons over the meaning of what was read,
  // not just the raw lines. Scoped to the chat's sources; ranges over all when empty.
  meaningGraph(sources,{maxEntities=18,maxEdges=44,perEntity=4}={}){
    if(!this.graph)return '';
    const scope=(Array.isArray(sources)?sources:(sources?[sources]:[]));
    const inScope=id=>!scope.length||this.mentionsOf(id).some(i=>scope.includes(this.master.sentenceSource[i]));
    const ents=[...this.graph.entities.values()].filter(e=>this.showable(e.id)&&inScope(e.id));
    ents.sort((a,b)=>this.weightOf(b)-this.weightOf(a));
    const top=ents.slice(0,maxEntities),topSet=new Set(top.map(e=>e.id));
    const lines=[],seen=new Set();
    for(const e of top){
      if(lines.length>=maxEdges)break;
      const a=this.labelOf(e.id);let n=0;
      for(const nb of this.neighbors(e.id)){
        if(n>=perEntity||lines.length>=maxEdges)break;
        if(scope.length&&!topSet.has(nb.id))continue;          // keep the graph within scope
        const rel=(nb.vias&&nb.vias.find(v=>v&&v.length<24))||(nb.vias&&nb.vias[0]);if(!rel)continue;
        const b=this.labelOf(nb.id),key=[a,b].sort().join('|')+'|'+rel;if(seen.has(key))continue;seen.add(key);
        lines.push(a+' -> '+b+' : '+this.norm(rel));n++;
      }
    }
    // Properties — a defining predicate for the most central entities ("A : fact").
    for(const e of top.slice(0,8)){
      const def=this.bestDef(e.id,null);if(!def||!def.pred)continue;
      const pred=this.norm(def.pred).replace(/[.;,]+$/,'');if(!pred)continue;
      const key='prop|'+e.id;if(seen.has(key))continue;seen.add(key);
      lines.push(this.labelOf(e.id)+' : '+pred);
    }
    return lines.join('\n');
  }
  // Minimal, SAFE markdown → HTML for chat answers (the model replies in markdown:
  // **bold**, lists, `code`, links). Everything is HTML-escaped FIRST, then only a fixed
  // set of tags is emitted, so nothing the model writes can inject raw markup.
  // Render markdown-lite to HTML. `cites` (optional) is an idx→{u,label} registry: any
  // ⟦cN⟧ sentinel _citeAnnotate left in the text becomes an inline, clickable citation pill
  // (¶ source) bound to passage N. Clicks are caught by the bubble's onCite delegate (data-u).
  _md(src,cites){
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // A clean citation glyph — a bare superscript footnote number (no box). Numbered per passage;
    // hover shows the source name; click opens it (bubble onCite delegate, data-u).
    const pillStyle='color:var(--acc);font-weight:700;font-size:0.72em;vertical-align:super;line-height:0;cursor:pointer;padding:0 1px;';
    const inline=s=>esc(s)
      .replace(/`([^`]+)`/g,(m,c)=>'<code style="background:rgba(0,0,0,.07);border-radius:4px;padding:1px 4px;font-size:.92em;">'+c+'</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--acc);">$1</a>')
      // Auto-link bare site URLs so every site mentioned in chat is clickable. Runs after
      // the markdown-link rule; the leading [\s(]/^ guard skips URLs already inside an
      // href="…" (preceded by a quote) so we never double-wrap a link.
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--acc);word-break:break-all;">$2</a>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')
      // Citation sentinels → inline numbered glyphs (added AFTER escaping so the span is raw HTML).
      // The verbatim passage, source label and host ride along as data-* so the hover-card can show
      // the cited section and the click delegate can scroll the source to it (_goToPassage).
      .replace(/⟦c(\d+)⟧/g,(m,i)=>{const c=cites&&cites[i];if(!c)return '';
        const att=s=>esc(String(s==null?'':s)).replace(/"/g,'&quot;');
        const u=String(c.u||'');const host=/^text:/i.test(u)?'':this.short(u);const quote=this.truncLabel(this.norm(c.text||''),300);
        return '<span class="eo-cite" data-u="'+att(u)+'" data-quote="'+att(quote)+'" data-label="'+att(c.label||'source')+'" data-host="'+att(host)+'" title="'+att(c.label||'source')+'" style="'+pillStyle+'">'+(c.n||'•')+'</span>';});
    const lines=String(src||'').replace(/\r/g,'').split('\n');
    const out=[];let list=null;
    const flush=()=>{if(list){out.push('<'+list.tag+' style="margin:6px 0;padding-left:20px;">'+list.items.join('')+'</'+list.tag+'>');list=null;}};
    for(const raw of lines){
      const line=raw.trim();let m;
      if(!line){flush();continue;}
      if(m=line.match(/^(#{1,6})\s+(.*)$/)){flush();out.push('<div style="font-weight:700;margin:9px 0 2px;">'+inline(m[2])+'</div>');continue;}
      if(m=line.match(/^[-*]\s+(.*)$/)){if(!list||list.tag!=='ul'){flush();list={tag:'ul',items:[]};}list.items.push('<li>'+inline(m[1])+'</li>');continue;}
      if(m=line.match(/^\d+\.\s+(.*)$/)){if(!list||list.tag!=='ol'){flush();list={tag:'ol',items:[]};}list.items.push('<li>'+inline(m[1])+'</li>');continue;}
      flush();out.push('<p style="margin:6px 0;">'+inline(line)+'</p>');
    }
    flush();return out.join('');
  }
  // Collapse / expand the researched-source subtree under a parent source in the left tree.
  toggleSrcCollapse(url){this.setState(s=>{const c={...(s.collapsedSrc||{})};c[url]=!c[url];return {collapsedSrc:c};});}
  // Lazily load the chat model (the old app's backends). Cached on the instance.
  async ensureChatModel(onTick){
    const name=this.state.backend||'webllm';
    if(this._chatModel&&this._chatModel.id===name)return this._chatModel;
    if(!this._ME)this._ME=await import((typeof window!=='undefined'&&window.__resources&&window.__resources.eoModel)||'./model-entry.js');
    const model=this._ME.createModel(name);
    this.setState({modelStatus:name+' · loading…'});
    // Throttle progress to ~3/sec: the load fires this callback many times a second, and a
    // full re-render on each one makes typing in the chat box stutter while the model loads.
    let lastTick=0,lastPct=-1;
    await model.load(p=>{const pct=Math.round((p&&p.pct||0)*100);const now=Date.now();
      // `onTick` is the stall guard's liveness feed — call it on EVERY tick (before the throttle's
      // early-return) so a slow-but-progressing download keeps re-arming the deadline.
      if(typeof onTick==='function')onTick(p);
      if(pct===lastPct||(now-lastTick<300&&pct<100))return;
      lastTick=now;lastPct=pct;
      this.setState({modelStatus:name+' · '+((p&&p.phase)||'loading')+(pct?(' '+pct+'%'):'')});});
    // PREWARM — the first DECODE of a session pays WebGPU pipeline/shader warmup ON TOP of its own
    // tokens, and warmup is SILENT (no token callback fires while shaders compile), so a cold first
    // decode can cross a no-progress deadline on warmup alone. Spend it once on a throwaway decode —
    // but ONLY on an unguarded background load (no onTick): an ask-time load races a stall guard
    // whose deadline that same warmup silence would trip, relocating the stall into the load catch
    // (a dead-end "could not load" for a model that DID load). A guarded load skips the throwaway
    // and lets the first real decode pay warmup where the ask's own fail-soft handles a trip.
    // minPredict:0 opts out of any backend decode floor (pleias) so the throwaway stays tiny, and
    // _chatModel is assigned only AFTER the prewarm settles, so a concurrent ask mid-warmup loads
    // its own instance instead of decoding over this one's context. Best-effort: a prewarm failure
    // never blocks a model that has already loaded.
    if(typeof onTick!=='function'){
      try{ if(this._ME&&this._ME.streamPhrase){this.setState({modelStatus:name+' · warming…'});
        await this._ME.streamPhrase(model,[{role:'user',content:'.'}],{maxTokens:1,minPredict:0,temperature:0});} }catch(e){}
    }
    this._chatModel=model;
    this.setState({modelStatus:''});
    return model;
  }
  // A summary-shaped question — "summarize this", "what's it about", "give me the gist".
  // Routes the grounded prompt to its summary task (the faithfulness guard), so a
  // "summarize this book" turn draws the lines together instead of restating one.
  _isSummaryQ(q){return /\b(summar(y|ise|ize)|overview|recap|gist|tl;?dr|in short|what(?:'s| is| are)?\s+(?:this|it|the (?:book|text|story|source|document))\s+about|what happens)\b/i.test(String(q||''));}
  // The orientation line for a grounded chat — names WHAT the chat is about so the model
  // is never confused about its subject (the "I don't see a book provided" failure). This
  // is the reader-chat surface, where being clear about the source is the whole point.
  chatOrientation(srcs){
    const titleOf=u=>this.truncLabel(((this.pageOf(u)||{}).title)||this.short(u),60);
    const all=(this.master&&this.master.sentences)||[];
    const count=srcs.length?all.filter((_,i)=>srcs.includes(this.master.sentenceSource[i])).length:all.length;
    const props=count+' proposition'+(count!==1?'s':'')+' read';
    if(!srcs.length){const n=(this.master&&this.master.pages.length)||0;return 'everything you have read'+(n?(' across '+n+' source'+(n!==1?'s':'')):'')+' · '+props;}
    if(srcs.length===1)return titleOf(srcs[0])+' · '+props;
    const names=srcs.slice(0,2).map(titleOf).join(', '),more=srcs.length-2;
    return names+(more>0?(' and '+more+' more'):'')+' ('+srcs.length+' sources) · '+props;
  }
  // WEB AS BRAIN — should THIS turn go read the web (then answer grounded) instead of answering
  // straight from the 3B model? The default is yes whenever the model would otherwise be guessing:
  // the web is on, it isn't a clock question, and the turn either explicitly asks to research
  // ("research X", "more about this book") OR names a real subject the in-scope READING doesn't
  // already cover. A summary of the open doc, a bare greeting, or a turn already grounded in folded
  // sources is answered offline. Turning the web off makes this always false → pure offline chat.
  // ── THE DISCOURSE METACOGNITION — every prompt gets a thinking pass (docs/discourse-routing.md) ──
  // Before any routing, the model reads the DISCOURSE in its own free language: what is the user
  // doing, what would satisfy them, what has to be found out. The paragraph is MEASURED, never
  // parsed (meta-route.js: Born overlap vs direction bases, crosstalk-nulled, relaxed) — and it is
  // shown VERBATIM in the live trail, so the thinking the turn runs on is the feedback the reader
  // sees. Its research current joins _shouldWeb's gates; its novel terms seed the walk. Fails soft
  // on every edge (no model, stall, stop, abstention) → null, and null means today's behavior.
  async _discourseRead(id,q,cur,fold){
    try{
      const M=this._MROUTE||(this._MROUTE=await import(new URL('src/turn/meta-route.js',document.baseURI).href));
      const prevMsgs=((cur&&cur.messages)||[]).filter(m=>m.text&&!m.pending);
      const exchange=prevMsgs.slice(-2).map(m=>((m.role==='user')?'user: ':'assistant: ')+this.truncLabel(this.norm(m.text),240)).join('\n');
      const prompt=M.discoursePrompt(q,fold,{exchange,now:new Date()});
      this._setThink(id,'Reading the conversation — what is this turn really asking for…');
      const guard=this._stallGuard(45000);
      let speech='',acc='';
      try{
        const model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);
        // THE READ, STREAMED — real-time feedback at zero extra model burden. The discourse tokens
        // are already being decoded; paint them into ONE live line as they land (updated in place,
        // never a beat per token) so the long read is legible thinking, not a frozen spinner.
        speech=this.norm(await Promise.race([this._ME.streamPhrase(model,[{role:'user',content:prompt}],{maxTokens:96,temperature:0.25,onToken:(p)=>{const s=String(p||'');if(!s)return;guard.feed();acc+=s;this._liveThink(id,'Reading the conversation — '+this.norm(acc));},signal:guard.signal}),guard.race]));
        guard.clear();
      }catch(e){guard.clear();speech='';}
      if(!speech||this._stopGen)return null;
      const measure=M.metaRoute(speech,fold);
      // The read, said out loud in the trail — the metacognition IS the visible thinking. Shown in
      // FULL (no truncation): the whole read is what the turn runs on, so the reader sees all of it.
      this._liveThink(id,'My read of this turn: '+speech,true);
      this._auditRec(id,'discourse-read',{prompt,output:speech,
        note:'route='+(measure.route||'abstained')+' · kind='+(measure.kind||'—')+' · length='+(measure.lengthDemand||'—')+' · researchDrive='+Number(measure.researchDrive||0).toFixed(3)+' · developDrive='+Number(measure.developDrive||0).toFixed(3)});
      // The read carries lengthDemand + developDrive so _wantsLongform can key the essay/longform
      // decision off the discourse PHYSICS (meta-route.js) rather than a keyword cliff.
      return {speech,route:measure.route,kind:measure.kind,steerKind:measure.steerKind,verdict:measure.verdict,abstained:measure.abstained,
        researchDrive:measure.researchDrive||0,lengthDemand:measure.lengthDemand||'',developDrive:measure.developDrive||0,
        leads:M.leadsOf(speech,{known:q+' '+exchange}).slice(0,3)};
    }catch(e){
      // Fails soft by contract — but keep the WHY inspectable (window.__eoApp._readErr) so a
      // dead metacognition is a diagnosable state, not a silent regression to old behavior.
      try{this._readErr=String((e&&e.stack)||e);}catch(_){/* diagnostics only */}
      return null;
    }
  }
  // THE ZERO-MASS ANCHOR (model-free) — a multi-anchor question with one anchor the reading holds
  // and one it never mentions ("the difference between it and harry potter" over a Golden Compass
  // corpus). The covered anchor grounds the turn while the missing one gets confabulated from
  // priors, riding in under the covered half's citations. _subjectsKnown asks "is ANY subject
  // known" (right for its gate); this asks the complementary question — "is any anchor MISSING
  // while another is covered" — which is exactly the half-grounded comparison shape.
  _anchorGap(q,sources){
    try{
      const subs=this._namedSubjects(q);
      if(subs.length<2)return null;   // single-anchor asks are the named-subject gate's job
      const scopes=(Array.isArray(sources)?sources:(sources?[sources]:[]));
      const missing=subs.filter(s=>!this._subjectKnown(s,scopes));
      if(!missing.length||missing.length>=subs.length)return null;
      return {missing,covered:subs.filter(s=>missing.indexOf(s)<0)};
    }catch(e){return null;}
  }
  // The discourse read, folded into the answer prompt as ONE steering line: what would satisfy
  // the asker, and what the reading does NOT hold. Steering only — the talker is told not to
  // quote it, and an absent/abstained read contributes nothing (empty string, prompt unchanged).
  _steerLine(meta){
    if(!meta)return '';
    const bits=[];
    if(meta.speech)bits.push('The conversation read (steering only — do not quote or mention it): '+meta.speech);
    if(meta.anchorGap)bits.push('What you’ve read does not mention '+meta.anchorGap.missing.join(', ')+' — where the answer needs that, say so plainly and in the first person ("I didn’t find that in what I read", never "the reading doesn’t mention…") instead of filling it in from memory.');
    return bits.join(' ');
  }
  // ── THE TURN AUDIT — every internal prompt and raw output, recorded on the turn ──────────────
  // Each model touch appends {t,stage,prompt?,output?,note?} to the pending turn's `audit` array,
  // and exportChatAudit ships the whole chat — questions, prompts VERBATIM, raw outputs, the
  // step trail, sources — as one JSON file. The audit is the settling made inspectable.
  _auditRec(id,stage,rec){
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li<0||m[li].role!=='asst'||!m[li].pending)return {...c,messages:m};
      m[li]={...m[li],audit:[...(m[li].audit||[]),{t:Date.now(),stage,...rec}]};
      return {...c,messages:m};})}));
  }
  exportChatAudit(chatId){
    const c=(this.state.chats||[]).find(x=>x.id===(chatId||this.state.activeChat));
    if(!c||typeof document==='undefined')return;
    const turns=[];let lastUser=null;
    for(const m of (c.messages||[])){
      if(m.role==='user'){lastUser=m.text;continue;}
      if(m.role!=='asst')continue;
      turns.push({question:lastUser,answer:m.text||'',stance:m.stance||null,
        groundKind:m.groundKind||null,disclosure:m.disclosure||undefined,
        sources:m.sources||[],passages:(m.passages||[]).map(p=>({text:p.text,source:p.u})),
        steps:(((m.research||{}).steps)||[]).map(s=>({kind:s.kind,text:s.text})),
        audit:m.audit||[]});
    }
    const out={tool:'eoreader4',chat:c.title||'',exported:new Date().toISOString(),
      model:this._modelLabel?this._modelLabel():'',sources:c.sources||[],turns};
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='eo-audit-'+(String(c.title||c.id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'chat')+'.json';
    document.body.appendChild(a);a.click();setTimeout(()=>{try{URL.revokeObjectURL(a.href);a.remove();}catch(e){}},0);
  }
  _shouldWeb(q,sources,isolated,meta){
    if(this.state.webBrain===false)return false;            // web turned off → never touch it
    if(this.mechanicalAnswer(q))return false;               // a clock question answers itself
    // A LIVE FACT (weather, price, score, headline) is an ask about the world's NOW — a
    // no-brainer web turn. Gated before every coverage check: no reading covers tomorrow's
    // weather, and incidental term overlap with the sources must never keep this offline.
    if(this._isLiveFact(q))return true;
    if(this._researchIntent(q)||this._isMetaResearch(q))return true;   // asked for research / "more"
    if(this._isSummaryQ(q))return false;                    // "summarize this" → from the doc you have
    // A bare pleasantry / acknowledgement names no subject — don't go research "thanks".
    if(/^(?:thanks?|thank you|thx|ty|ok|okay|k|cool|nice|great|awesome|got it|sounds good|sure|yep|yes|no|yeah|nope|lol|haha|hi|hey|hello|yo|sup|np|no problem|cheers|bye|goodbye|good (?:morning|night))[\s.!?]*$/i.test(q))return false;
    if(!this._researchTerms(q).length)return false;         // nothing contentful to chase
    // THE ZERO-MASS ANCHOR: one anchor covered, another absent → the missing half must be read,
    // not confabulated (the "difference between it and harry potter" case).
    if(meta&&meta.anchorGap)return true;
    // THE DISCOURSE GAP: the metacognition's read settled on RESEARCH — the direction won the
    // relaxation against ground/compose and the incumbent (docs/discourse-routing.md). The winner,
    // not the raw current: a lexical current can't see negation ("NOTHING needs to be found out"
    // still lights research terms), but in the competition that read's ground current dominates —
    // the relaxation is the negation guard.
    if(meta&&meta.route==='research')return true;
    // A NET-NEW space grounds nothing from the library, so the reading can't "cover" the ask —
    // a contentful question goes straight to the web (when it's on) instead of consulting spans.
    if(isolated)return true;
    // A CREATIVE-GENERATION request grounds on its TOPIC ("about iced coffee"), not its frame verb
    // ("write"), which would otherwise overlap a "writer" corpus and wrongly keep the turn offline.
    // Topic the reading doesn't actually cover → go read it before composing.
    const topic=this._genTopic(q);
    if(topic)return !this.groundNotes(topic,sources).relevant;
    // A CORRECTION / CONTRADICTION ("he is no longer a council member", "actually she's CEO now")
    // disputes the in-scope reading itself — so even when that reading "covers" the topic, don't
    // re-assert it offline; go to the web to settle the CURRENT fact (research-accuracy fix).
    if(this._isCorrection(q))return true;
    // A request whose named subject the in-scope reading never mentions ("essay about Grok"
    // over an Errol-Musk corpus) → go read it, rather than let incidental word overlap keep a
    // confabulating answer offline. This is the named-subject gate, on the routing side.
    if(!this._subjectsKnown(q,sources))return true;
    return !this.groundNotes(q,sources).relevant;           // not covered by matched reading → go read
  }
  // THINKING, made legible. Between "researched" and the first streamed token the answer model
  // is busy — pulling passages, loading, prefilling, drafting — but the bubble showed only a bare
  // "…". Narrate that gap instead: set a short status on the still-pending, still-empty assistant
  // bubble so the reader sees WHAT it's doing, not an opaque ellipsis. Cleared for free the moment
  // a real token streams in (the bubble then carries m.text, never the think line).
  _setThink(id,text){const t=String(text||'');
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;
      const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst'&&m[li].pending&&!m[li].text)m[li]={...m[li],think:t};
      return {...c,messages:m};})}));
    // The status line is also a BEAT in the live thinking trail, so the reader watches the turn
    // work in real time — every "re-reading", "composing", "writing on …" stacks up as it happens
    // instead of a single label flickering above a bare spinner.
    this._beat(id,'think',t);}
  // Append a beat to the pending turn's live thinking trail — the real-time record of what the
  // assistant is doing this turn. Creates a lightweight 'think'-mode trail when none exists yet,
  // so EVERY pending turn shows its work (not just web-research turns). Consecutive identical beats
  // coalesce, and the elapsed clock starts ticking on the first beat.
  _beat(id,kind,text){const t=String(text||'');if(!t)return;
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li<0||m[li].role!=='asst'||!m[li].pending)return {...c,messages:m};
      const r=m[li].research||{steps:[],done:false,mode:'think',t0:Date.now()};
      const last=r.steps[r.steps.length-1];
      if(last&&last.kind===kind&&last.text===t)return {...c,messages:m};   // don't repeat the same beat
      m[li]={...m[li],research:{...r,steps:[...r.steps,{kind,text:t}]}};
      return {...c,messages:m};})}));
    this._thinkClock();}
  // A LIVE, IN-PLACE thinking line — updates the trailing beat's text as tokens stream in, rather
  // than appending a new beat per token (which would spam the trail). Streams the discourse read
  // into the visible trail in real time at zero extra model cost. `lead=true` promotes the line to
  // the permanent 'My read of this turn' beat once the read completes.
  _liveThink(id,text,lead){const t=String(text||'');if(!t)return;
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li<0||m[li].role!=='asst'||!m[li].pending)return {...c,messages:m};
      const msg=m[li];const r=msg.research||{steps:[],done:false,mode:'think',t0:Date.now()};
      const steps=r.steps.slice();const last=steps[steps.length-1];const beat={kind:lead?'lead':'think',text:t};
      if(last&&(last.kind==='think'||last.kind==='lead'))steps[steps.length-1]=beat;else steps.push(beat);
      // The streamed read lands in the TRAIL only. The header (m.think) keeps its concise status label
      // (set by _setThink) rather than mirroring the same growing text — otherwise the live read shows
      // twice at once: once ballooning in the folded header, once in the trail beat below it. Only seed
      // the header when the turn has no label yet.
      m[li]={...msg,think:msg.think||(msg.text?'':t),research:{...r,steps}};
      return {...c,messages:m};})}));
    this._thinkClock();}
  // A once-a-second re-render while any turn is pending, so the live trail's elapsed clock ticks even
  // when the model is mid-decode with no fresh beat. Self-stops the instant nothing is pending, so the
  // timer never leaks across turns.
  _thinkClock(){if(this._thinkTimer)return;if(typeof setInterval==='undefined')return;
    this._thinkTimer=setInterval(()=>{
      const pending=(this.state.chats||[]).some(c=>(c.messages||[]).some(m=>m.role==='asst'&&m.pending));
      if(!pending){clearInterval(this._thinkTimer);this._thinkTimer=null;return;}
      this.setState(s=>({_clk:((s._clk||0)+1)%1000000}));
    },1000);}
  // The first beat of thinking, phrased from the matched supply: how much grounded reading the
  // answer has to work from — and WHAT it is on (the matched figures), never a bare count. No
  // matches → say honestly what the reasoning stands on instead ("the meaning graph").
  _thinkGround(ground){const n=(ground&&ground.spans&&ground.spans.length)||0;
    const ents=((ground&&ground.entities)||[]).map(e=>typeof e==='string'?e:((e&&(e.label||e.name))||'')).filter(Boolean).slice(0,3);
    if(!n)return 'No passage matches this directly — reasoning from the meaning graph of what you’ve read…';
    return 'Re-reading '+n+' matching passage'+(n!==1?'s':'')+(ents.length?(' — on '+ents.join(', ')):'')+'…';}
  // COMPOSING, made legible. The bare "Composing the answer…" sat frozen for the whole decode —
  // the model can prefill a grounded prompt for many seconds before the first token, and that dead
  // air is exactly what the live trail exists to kill. So the opening beat NAMES the grounded supply
  // the answer is written FROM (the passages / memory it stands on), and the streaming header below
  // ticks a live word count — content motion, not just a clock. Honest signal only: it reflects the
  // real basis and the real words drawn, never invented stages.
  _composeOpen(grounded,ground){const n=(ground&&ground.spans&&ground.spans.length)||0;
    const srcs=((ground&&ground.sources)||[]).length;
    if(n)return 'Writing from '+n+' passage'+(n!==1?'s':'')+(srcs>1?(' across '+srcs+' sources'):'')+' — citing as I go…';
    if(grounded)return 'Writing from the shape of your reading — no passage matched, so I’ll say where it’s my own…';
    return 'Writing the answer…';}
  // The live header during the decode: the word count drawn so far. Before the first word lands (the
  // prefill gap) it keeps the bare label, so the status line never reads empty.
  _composeTick(acc){const w=(String(acc||'').match(/\S+/g)||[]).length;
    return w?('Writing the answer… · '+w+' word'+(w!==1?'s':'')):'Composing the answer…';}
  // STALL GUARD — the chat model loads on first use and decodes on the CPU, and EITHER step can
  // hang outright: a weights download that stops mid-stream, or a decode that never emits a first
  // token. Both leave a promise that neither resolves nor rejects, so `await ensureChatModel()` /
  // `await streamPhrase()` wait forever and the assistant bubble pulses "…" with no end — the
  // stalled session. (The catch blocks only fire on a REJECTION; a hang reaches neither.) This is
  // a NO-PROGRESS watchdog, not a flat timeout: `feed()` re-arms the deadline and is called on
  // every load tick and every streamed token, so a slow-but-live model runs to completion, while
  // one that goes silent for `ms` trips — aborting the attempt (signal, honoured by the wllama /
  // webllm backends) and rejecting `race`, which drops the answer paths into the grounded
  // fallback they already carry instead of waiting on a model that will never answer.
  _stallGuard(ms=60000){
    const ctrl=(typeof AbortController!=='undefined')?new AbortController():{abort(){},signal:null};
    let timer=null,tripped=false,trip=null;const self=this;
    // clear() also unregisters the guard from the live set so a finished/aborted attempt is no
    // longer a stop target; arm() re-times WITHOUT unregistering (re-arming is liveness, not done).
    const stopTimer=()=>{if(timer){clearTimeout(timer);timer=null;}};
    const clear=()=>{stopTimer();if(self._activeGuards)self._activeGuards.delete(g);};
    const arm=()=>{if(tripped)return;stopTimer();timer=setTimeout(()=>{tripped=true;timer=null;
      try{ctrl.abort();}catch(e){}if(trip)trip(Object.assign(new Error('the chat model stalled'),{stalled:true}));},ms);};
    // abort() — the manual stop. Aborts the in-flight decode/download (the backends honour the
    // signal) and trips the race with a {stopped:true} error so the answer paths can tell a USER
    // stop from a stall and keep whatever streamed instead of swapping in the structural fallback.
    const abort=()=>{if(tripped)return;tripped=true;stopTimer();if(self._activeGuards)self._activeGuards.delete(g);
      try{ctrl.abort();}catch(e){}if(trip)trip(Object.assign(new Error('stopped'),{stopped:true}));};
    const race=new Promise((_,rej)=>{trip=rej;});
    // Swallow the rejection if nobody is racing it at trip time (e.g. after clear()), so a tripped
    // guard never surfaces as an unhandled rejection; the answer path's own race still sees it.
    race.catch(()=>{});
    const g={signal:ctrl.signal,feed:arm,clear,tripped:()=>tripped,race,abort};
    if(self._activeGuards)self._activeGuards.add(g);
    arm();
    return g;
  }
  // STOP — the user's pull-cord for any in-flight generation (the chat decode, a longform arc, or a
  // research walk). Aborts every live stall guard (which cancels the backend decode and trips each
  // answer path into its stopped branch), drops the research busy flag so the curiosity walk bails
  // between hops, and finalizes any still-pending bubble in place — keeping whatever streamed so far
  // rather than discarding it. `_stopGen` rides until the next turn starts, so the arc/walk loops and
  // the answer-path catch blocks all see the stop and don't write past it.
  stopGeneration(){
    this._stopGen=true;
    if(this._activeGuards)for(const g of [...this._activeGuards]){try{g.abort();}catch(e){}}
    this._busy=false;
    this.setState(s=>({busy:false,modelStatus:'',chats:(s.chats||[]).map(c=>{
      const m=c.messages.slice();let touched=false;
      for(let i=0;i<m.length;i++){
        if(m[i].role==='asst'&&m[i].pending){
          const had=String(m[i].text||'').trim();
          m[i]={...m[i],pending:false,think:null,stopped:true,
            text:had?m[i].text:'_Stopped._',
            research:m[i].research?{...m[i].research,done:true}:m[i].research,
            modelNote:had?'Stopped — partial answer kept.':undefined};
          touched=true;
        }
      }
      return touched?{...c,messages:m}:c;
    })}));
  }
  // Is a turn live in the active chat? Drives the composer's Ask⇄Stop swap and the "model is working"
  // banner — derived straight from the pending bubble so every path (chat / arc / research) lights it.
  _genActive(cur){return !!(cur&&(cur.messages||[]).some(m=>m.role==='asst'&&m.pending));}
  // A short, human name for the chat model in scope — for the live "X is working…" indicator.
  _modelLabel(){const b=this.state.backend||'webllm';return ({
    'webllm':'Llama-3.2-3B','qwen-coder-1.5b':'Qwen2.5-Coder 1.5B','qwen-coder-7b':'Qwen2.5-Coder 7B',
    'qwen-coder-0.5b':'Qwen2.5-Coder 0.5B','echo':'Echo'})[b]||b;}
  // LIMNER (docs/limner.md): "/svg [kind] [focus]" draws the reading's EO graph as
  // deterministic SVG, inline in the chat. Headless — no model and no log mutation:
  // it projects this.graph (already a fold of the event log) and the layout engine
  // computes geometry. Self-contained, so it dynamic-imports the organ on first use.
  async _limnChat(raw){
    const q=this.norm(raw);
    const arg=q.replace(/^\/svg\b[\s:]*/i,'').trim();
    let id=this.state.activeChat;
    this.setState(s=>{let chats=s.chats.slice();let idx=chats.findIndex(c=>c.id===id);
      if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(q,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
      const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(q,40);
      chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:q},{role:'asst',text:'',pending:true,think:'Drawing…'}]};
      return {chats,activeChat:id,chatInput:''};});
    this._scrollChat();
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst')m[li]={role:'asst',pending:false,text:'',...patch};return {...c,messages:m};})}),()=>this._scrollChat());
    const g=this.graph;
    if(!g||!g.entities||!g.entities.size){finish({text:'No graph yet — read a URL or import a book first, then try /svg.'});return;}
    try{
      const L=this._LIMN||(this._LIMN=await import(new URL('src/organs/out/limner/index.js',document.baseURI).href));
      // Split a leading view kind off the argument; the remainder centres the view.
      const toks=arg?arg.split(/\s+/):[];let kind='graph';
      if(toks.length&&L.VIEW_KINDS.includes(toks[0].toLowerCase()))kind=toks.shift().toLowerCase();
      const focus=toks.join(' ').trim();
      // Enrich entity labels via labelOf so nodes read as names, not bare hashIds.
      const entities=new Map();
      for(const [eid,e] of g.entities){let lab;try{lab=this.labelOf(eid);}catch(_){}
        entities.set(eid,{...e,label:lab||e.label||eid});}
      const {svg,spec}=await L.limn({graph:{...g,entities},kind,scope:focus?{focus}:{}});
      if(!spec.nodes.length){finish({text:focus?('Nothing to draw around “'+focus+'” yet — no matching figure in the graph.'):'No figures admitted yet — read more, then try /svg.'});return;}
      const cap=(kind+(focus?(' · '+focus):'')+' — '+spec.nodes.length+' nodes, '+spec.edges.length+' edges').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      const responsive=svg.replace('<svg ','<svg style="width:100%;height:auto;max-width:100%;display:block" ');
      finish({svg:'<div class="limner-cap" style="font-size:12px;color:var(--ink3,#888);margin:0 0 4px">'+cap+'</div><div class="limner-figure">'+responsive+'</div>'});
    }catch(e){finish({text:'Couldn’t draw that: '+(e&&e.message||e)});}
  }

  // The Conversation Fold for a chat — a pure projection of its turns that carries
  // the enacted STANCE (compose|ground) forward (src/core/conversation-fold.js). The
  // projector is self-contained and loaded lazily, memoized in the module on
  // (chatId, turn-count, decay-config). If it can't load, routing degrades to a
  // null-stance fold — today's behavior, never worse. See docs/conversation-fold.md.
  async _convFold(cur){
    try{
      const F=this._FOLD||(this._FOLD=await import(new URL('src/core/conversation-fold.js',document.baseURI).href));
      return F.projectFold((cur&&cur.messages)||[],{chatId:(cur&&cur.id)||'',foldRules:{warmWindow:3}});
    }catch(e){return {stance:null,focus:null,warm:[],stanceDesc:'an isolated assistant chat'};}
  }
  // The compose FOCUS enacted by a turn — the KIND that labels the work and the
  // running SUBJECT slot. A turn that names its own kind ("write a haiku") or subject
  // ("about the city") sets them; a bare "write me one" / "make it shorter" borrows
  // the carried focus from the fold so the label and the thread stay coherent.
  _composeFocus(q,fold){
    const s=String(q||'');
    const hasKind=new RegExp('\\b(?:'+this._CK()+')\\b','i').test(s);
    const kind=hasKind?this._composeKind(q):((fold&&fold.focus&&fold.focus.kind)||'poem');
    const m=s.match(/\b(?:about|on|regarding|concerning|describing|inspired\s+by|in\s+the\s+style\s+of)\s+(.+)$/i);
    const subject=m?m[1].replace(/[?.!]+$/,'').trim():((fold&&fold.focus&&fold.focus.subject)||null);
    return {kind,subject};
  }

  // ── MATH: the one model-free short-circuit, brought to the path this UI runs ──
  // A pure arithmetic turn ("what is 2+2?", "sqrt(16)*3", "5!") is answered by math.js —
  // math.js (answer/math.js): mathjs in the browser, a dependency-free built-in evaluator
  // offline. The answer is provably correct and does not depend on any document, so it
  // never warms the model and never goes to the web. The Reader answers in its OWN sendChat,
  // never through src/turn/stages.js where this short-circuit already lives — so it is wired
  // in here too. The gate is strict (the module's extractExpression): anything carrying real
  // words falls straight through to the grounded/chat turn below.
  //
  // A cheap sync pre-gate keeps every NON-math turn from paying an import: a math turn needs a
  // digit AND an operator symbol or a known function name. Loose on purpose (a superset of the
  // real thing) — the authoritative decision stays with the module, which rejects "9-5 job".
  _looksMath(q){
    const s=String(q||'');
    return /\d/.test(s)&&(/[+\-*/^%!]/.test(s)||/\b(?:sqrt|cbrt|abs|exp|ln|log|log10|log2|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|floor|ceil|round|sign|trunc|factorial|pow|min|max|hypot|atan2|mod|nthroot|gcd|lcm)\b/i.test(s));
  }
  // Lazy-load the shared math module (the same answer/math.js the turn pipeline uses). Self-
  // contained, memoized on first use, resolved against document.baseURI like the other organs.
  async _mathMod(){
    try{ return this._MATH||(this._MATH=await import(new URL('src/answer/math.js',document.baseURI).href)); }
    catch(e){ return null; }
  }
  // Answer a math turn, rendering the user turn + a finished assistant bubble. Returns true when
  // it handled the turn, false when the question is not pure math (so sendChat continues normally).
  async _mathChat(q){
    const s=this.norm(q);
    const M=await this._mathMod();
    if(!M||typeof M.answerMath!=='function')return false;
    let ans=null;
    try{ ans=await M.answerMath(s); }catch(e){ ans=null; }
    if(!ans||!ans.text)return false;   // not a math query, or it didn't evaluate to a finite number
    let id=this.state.activeChat;
    this.setState(st=>{let chats=st.chats.slice();let idx=chats.findIndex(c=>c.id===id);
      if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(s,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
      const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(s,40);
      chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:s},{role:'asst',pending:false,text:ans.text,modelNote:'Calculated directly — no model, no web.'}]};
      return {chats,activeChat:id,chatInput:''};});
    this._scrollChat();
    return true;
  }

  async sendChat(qArg,opts={}){
    // qArg lets an internal caller re-drive a turn (the "Just answer" decline re-sends the topic
    // with {steerBypass:true}); the composer's Enter/Ask pass nothing and read the input box.
    const q=this.norm(qArg!=null?qArg:this.state.chatInput);if(!q)return;
    this._stopGen=false;   // a fresh turn clears any prior stop
    if(/^\/svg\b/i.test(q))return this._limnChat(q);
    // MATH — a pure arithmetic question is computed by math.js, before the web/model routing
    // below can strip it to a "subject" and research it. The cheap sync pre-gate keeps a
    // non-math turn from ever loading the module; the module makes the strict final call.
    if(this._looksMath(q)&&await this._mathChat(q))return;
    // THE ESSAY ORGAN — an EXPLICIT "/essay <topic>" walks the organ (runOrganEssay): plan, then
    // section after section to the ≥2500-word floor, steered by the composer's selected type,
    // thinking out loud in the live trail. Explicit command = run it, no ask. The old regex intent
    // ("write an essay on…") is GONE: essay steering is now read off the discourse metacognition
    // below (the steer gate after _discourseRead) and OFFERED for permission, never guessed by a
    // string match (docs/discourse-routing.md). Organ not loaded → the steer gate finds nothing.
    if(this._essayOrganReady()){
      const essayCmd=/^\/essay\b[\s:]*/i.exec(q);
      if(essayCmd){const t=this.norm(q.slice(essayCmd[0].length));if(t)return this.runOrganEssay(t);}
      // THE ARMED WRITE TOGGLE: with essay mode on, a plain sent turn IS the essay commission — the
      // box text is the topic. This is the reliable route to an essay (no string-matching "write me
      // an essay", no compose-continuation stealing it into a poem); the toggle stays on for the next.
      if(this.state.essayArmed&&!opts.steerBypass)return this.runOrganEssay(q);
    }
    // COMPOSE — a generative artifact ("write an emily dickinson poem", "compose a sonnet about
    // the sea") is a make-this, not a question. It must be caught BEFORE _shouldWeb, or the web
    // routing strips it to its subject and researches it — which is exactly why "write an emily
    // dickinson poem" came back as a memory of Dickinson instead of a poem. composeArtifact does
    // the three steps the request asks for: read examples of the form, then WRITE an original one.
    if(this._composeIntent(q))return this.composeArtifact(q);
    const cur=this.activeChatObj();
    // CONTINUATION-BY-DEFAULT — the Conversation Fold (docs/conversation-fold.md §2,§5).
    // "write me one", "do it", "now one about the city", "make it shorter" have no
    // intrinsic KIND — their stance is inherited from the thread, not read off the
    // string. So a follow-up in a thread that was already COMPOSING keeps composing,
    // instead of falling through to the web/grounding path (which would strip it to a
    // subject and answer ABOUT it — the "write an emily dickinson poem" → memory-of-
    // Dickinson bug, one turn later). Model-free (rung 2): the carried stance is the
    // whole decision; a warm model (rung 4) can later override on a clean switch. The
    // absence of a detected switch means continue. Only a compose stance re-routes; a
    // ground / null stance falls through to today's path unchanged.
    const fold=await this._convFold(cur);
    // An EXPLICIT research request ("research dolphins", "look into X") is a performed
    // transition INTO grounding — a structural marker (§5), not an anaphor — so it
    // breaks continuation and takes the web path below. Everything else in a composing
    // thread continues to compose.
    // …but a self-contained question ("what is 237 * 637?") is a SWITCH out of composing, not
    // an anaphoric follow-up — it must not be answered as another poem. (§5 cold-path seed.)
    if(fold.stance==='compose'&&!this._researchIntent(q)&&!this._switchesFromCompose(q)){
      // A composing thread continues composing — but an ESSAY and a creative artifact are different
      // organs. runOrganEssay tags its turn stance:'compose' too, so without this a follow-up after
      // an essay ("make it longer", "one about X", "write me an essay …") fell into composeArtifact,
      // which defaults to a POEM. Continue the essay as an essay when the last piece was one.
      const lastEssay=cur&&[...cur.messages].reverse().find(m=>m.role==='asst'&&!m.pending&&m.text&&m.kind==='essay');
      if(lastEssay&&this._essayOrganReady())return this.runOrganEssay(q);
      return this.composeArtifact(q,fold);
    }
    // The grounding scope for this turn: isolated (net-new, ground nothing from reading),
    // everything (sources:[]), or the tagged sources. An isolated chat answers plainly.
    const _sc=this._answerScope(cur,null);const isolated=_sc.isolated;const sources=_sc.sources;
    // THE REGISTER this turn runs at (the composer's Auto/Grounded/Creative switch). Creative
    // gathers nothing and grounds on nothing — the point is the model speaking for itself —
    // so the web walk, the subject gate, the discourse read, and the grounded frame are all
    // bypassed below.
    const amode=this.state.answerMode||'auto';
    const prev=cur?cur.messages.filter(m=>m.text&&!m.pending):[];
    // Append the user turn + a pending assistant bubble BEFORE any routing, so the discourse
    // read — and every decision that follows it — narrates into a live trail from the first
    // frame. The web path reuses this same bubble (chatResearch pre), never a second one.
    const contentful=amode!=='creative'&&!this.mechanicalAnswer(q)&&this._researchTerms(q).length>0;
    const seedThink=contentful?'Reading the conversation…':'Thinking…';
    let id=this.state.activeChat;
    this.setState(s=>{let chats=s.chats.slice();let idx=chats.findIndex(c=>c.id===id);
      if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(q,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
      const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(q,40);
      chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:q},{role:'asst',text:'',pending:true,think:seedThink,research:{steps:[{kind:'think',text:seedThink}],done:false,mode:'think',t0:Date.now()}}]};
      return {chats,activeChat:id,chatInput:''};});
    this._scrollChat();this._thinkClock();
    // THE DISCOURSE METACOGNITION (docs/discourse-routing.md): the model reads the turn in free
    // language before anything routes; the read is shown verbatim in the trail and its measured
    // currents steer the web decision below. Skipped for clock questions and bare pleasantries
    // (nothing to read); null on any failure — null means today's behavior, unchanged.
    const read=contentful?await this._discourseRead(id,q,cur,fold):null;
    if(this._stopGen)return;
    const anchorGap=(!isolated&&contentful)?this._anchorGap(q,sources):null;
    if(anchorGap)this._beat(id,'warn','“'+anchorGap.missing.join('”, “')+'” '+(anchorGap.missing.length>1?'aren’t':'isn’t')+' in your reading — that part needs the web, or an honest absence.');
    const meta=(read||anchorGap)?{...(read||{researchDrive:0}),anchorGap}:null;
    // THE DISCOURSE STEER (docs/discourse-routing.md) — the metacognition, NOT a regex, has said
    // this turn is a make-this: its speech settled on `compose` and a form cleared its null. Rather
    // than silently run the organ (the old _essayIntent behavior), ASK — park a permission
    // suggestion in the pending bubble ("I think you may want me to write an argument essay…") and
    // stop here. Explicit /essay, compose-verb, and continuation asks already returned above, so
    // this catches only the paraphrased make-this the regexes miss. Bypassed when the user chose
    // "Just answer" (re-sent with steerBypass), and soft: no read / no form / cold model → falls
    // straight through to the answer path below, unchanged.
    if(!opts.steerBypass&&read&&read.route==='compose'&&read.kind){
      const steer=this._steerOf(read);
      if(steer){this._parkSteer(id,q,steer);return;}
    }
    // WEB AS BRAIN (default on): rather than let the small model answer from its own thin knowledge,
    // a question it can't ground in what's been read+folded sends the engine to the web first — it
    // fetches, FOLDS every page into memory (chatResearch → the curiosity walk → readURL→ingest),
    // then answers grounded in the new reading. Raw text only counts once it's parsed and folded.
    // Now discourse-aware: the metacognition's research current and the zero-mass anchor are gates.
    if(amode!=='creative'&&this._shouldWeb(q,sources,isolated,meta))return this.chatResearch(q,{id,meta});
    // Every turn this path enacts is a GROUND turn (an answer from the reading, the web,
    // or the plain assistant) — tag it so the fold carries `ground` forward. The compose
    // continuation above returns before here, so this never mislabels a compose turn.
    // Spread the pending message (not a fresh object) so the turn KEEPS its thinking trail
    // and audit record; the trail collapses via done:true, the think header clears.
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst')m[li]={...m[li],pending:false,text:'',think:'',stance:'ground',research:m[li].research?{...m[li].research,done:true}:undefined,...patch};return {...c,messages:m};})}),()=>this._scrollChat());
    // 1) clock questions — no model
    const mech=this.mechanicalAnswer(q);if(mech){finish({text:mech});return;}
    // 1a) THE NAMED-SUBJECT GATE (offline). We are here only because the web didn't take this
    // turn (web off, or it would have routed to research above). If the question names a subject
    // the in-scope reading never mentions, do NOT hand the model irrelevant spans and a question
    // about a subject it never read — that is the Grok confabulation. Answer honestly instead.
    // (An isolated / net-new chat skips the reading-scoped gate entirely — there is nothing in
    // scope to be absent from, and it must not consult the library.)
    if(!isolated&&amode!=='creative'&&!this._subjectsKnown(q,sources)){finish(this._noSubjectPatch(q,sources));return;}
    // 1b) OPT-IN LONGFORM, offline too: an essay/report/"N words" ask over what's ALREADY been read
    // (web off, or the reading already covers it) becomes a multi-section grounded piece — the arc
    // over the in-scope sources — instead of one capped answer. The opt-in is now PHYSICS, not a
    // keyword cliff: _wantsLongform reads the develop/brief demand off the discourse metacognition
    // (the `read` above), with the keyword _longformIntent kept only as the cold-model floor — so a
    // soft "explain this in detail" no longer trips a full essay walk unless the read agrees. Needs
    // grounded supply; _longformArc itself falls back to the single answer when supply is thin.
    if(!isolated&&amode!=='creative'&&this._wantsLongform(q,read)&&(sources.length||!!(this.graph&&this.graph.entities&&this.graph.entities.size))){
      // THE GENERATION PIPELINE (src/reader/eo-gen.js): an essay ask WALKS THE ARC — open,
      // develop, turn, land — over a rich ground (runContinuation), instead of the capped
      // grounded blurb. On by default when the module is loaded; the old arc is the fallback.
      if(typeof window!=='undefined'&&window.eoGen&&this._essayPipelineOn())return this._pipelineEssay(id,q,sources);
      return this._longformArc(id,q,[]);
    }
    // 2) the spans that surface for this question, scoped to the chat's sources (none when
    //    isolated — and none in the CREATIVE register, which answers from the model alone)
    const ground=(isolated||amode==='creative')?{spans:[],entities:[],sources:[],relevant:false}:this.groundNotes(q,sources);
    // 3) the model — the VOICE OF A READER grounded in those sources and their meaning
    //    graph, so it speaks from the document instead of as a blank-slate assistant.
    this._setThink(id,this._thinkGround(ground));
    const guard=this._stallGuard();
    try{
      const model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);
      // An isolated / net-new chat is never "grounded" — it answers as a plain assistant even
      // when the library is full, so a fresh space stays a blank slate until sources are tagged.
      // The CREATIVE register is never grounded either, by choice rather than by absence.
      const grounded=amode!=='creative'&&!isolated&&((ground.spans&&ground.spans.length)||!!(this.graph&&this.graph.entities&&this.graph.entities.size));
      // GROUNDED register with nothing to ground on: decline honestly rather than let the model
      // invent — abstention over invention is what the register promises. (With the web on, the
      // walk above would normally have gathered ground before we ever get here.)
      if(amode==='grounded'&&!grounded){guard.clear();
        finish({text:'Grounded mode: nothing you’ve read covers this, so I won’t answer from the model alone. Read something on it (or turn the web on and ask again), or switch the register to Auto or Creative.',
          groundKind:'model',register:'grounded'});
        return;}
      let messages;
      // The reader answers as a research LIBRARIAN — sources foregrounded, attributed, quoted —
      // not an expert holding forth (the librarian cue, every grounded turn). A broad / explanatory
      // question additionally gets the answer-first, sectioned SHAPE (headings, bold, bullets);
      // a pointed lookup keeps just the librarian register and answers straight.
      // The discourse read rides in as ONE steering line — what would satisfy the asker, and what
      // the reading does NOT hold (so absence is said plainly instead of padded from priors).
      const steer=this._steerLine(meta);
      const shape=grounded?[this._ME.LIBRARIAN_CUE,(this._ME.shapeForScope&&this._ME.shapeForScope(q))||'',steer].filter(Boolean).join('\n\n'):'';
      if(grounded){
        const pastTurns=prev.filter(m=>m.role==='user').slice(-6).map(m=>this.norm(m.text)).filter(Boolean);
        messages=this._ME.buildGroundedMessages({
          question:q, spans:ground.spans||[], graph:this.meaningGraph(sources),
          orientation:this.chatOrientation(sources),
          task:this._isSummaryQ(q)?'summary':'answer',
          conversation:{pastTurns}, now:new Date(), shape,
        });
      }else{
        // Nothing read yet — fall back to the plain assistant frame (chat works without a doc).
        const history=prev.slice(-8).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text}));
        messages=this._ME.buildChatMessages({question:q,history,now:new Date()});
      }
      this._auditRec(id,'answer-prompt',{prompt:messages.map(mm=>'['+mm.role+']\n'+mm.content).join('\n\n---\n\n')});
      // Stream the reply into the pending bubble token by token (model/stream.js).
      // streamPhrase drives the backend's onToken when it can decode incrementally
      // (webllm, echo), and falls back to draw-then-emit otherwise — either way it
      // returns the full reply, which `finish` then re-renders as bound markdown.
      this._setThink(id,this._composeOpen(grounded,ground));
      let acc='',raf=0;
      const paint=()=>{raf=0;const head=this._composeTick(acc);this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc,think:head};return {...c,messages:m};})}),()=>this._scrollChat());};
      const onToken=(piece)=>{const s=String(piece||'');if(!s)return;guard.feed();acc+=s;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
      // A sectioned answer needs room for the lead + parts + follow-ups; a straight lookup keeps the tighter budget.
      // The creative register writes hotter — invention is the point; grounded stays cool and faithful.
      const raw=await Promise.race([this._ME.streamPhrase(model,messages,{maxTokens:shape?900:512,temperature:amode==='creative'?0.85:0.4,onToken,signal:guard.signal}),guard.race]);
      guard.clear();
      this._auditRec(id,'answer-raw',{output:String(raw||'')});
      // An isolated chat draws on nothing read, so there's no structural fallback to pull from.
      const text=this.normMd(raw)||(isolated||amode==='creative'?'':this.answerQuestion(q,sources).text)||'(no answer)';
      // Surface grounding for EVERY answer, honestly. Matched lines show as citations; a
      // summary that leaned on the source's opening shows those lines, disclosed as such;
      // an answer with no read footing says plainly it's the model's own (_groundReport).
      const gr=this._groundReport(ground,grounded);
      // The turn wears the register it ACTUALLY used, and a grounded answer is read back
      // through the EOT reflection — every proposition judged against the graph (_reflect).
      finish({text:isolated?text:this._withOfficeNote(text,sources),entities:ground.entities,sources:gr.sources,passages:gr.passages,
        groundKind:gr.groundKind,disclosure:gr.disclosure,related:(isolated||amode==='creative')?[]:this.relatedDocs(q,sources),
        register:grounded?'grounded':'creative',reflection:grounded?this._reflect(text):null});
      if(!isolated)this._pivotChatPanel(q+' '+text);
    }catch(e){
      guard.clear();
      // User stop — stopGeneration already finalized the bubble with whatever streamed. Don't
      // overwrite it with a structural fallback.
      if((e&&e.stopped)||this._stopGen)return;
      // An isolated chat has no reading to fall back to — say plainly the model didn't load.
      if(isolated){finish({text:'I couldn’t load a model to answer.',groundKind:'model'});this.setState({modelStatus:''});return;}
      // model unavailable OR stalled — answer structurally from what's read, or say so plainly
      const fb=this.answerQuestion(q,sources);
      const note=this.state.modelStatus?(' · '+this.state.modelStatus):'';
      const relevant=!!(fb.refs&&fb.refs.length);
      const passages=relevant?(fb.refs||[]).map(i=>({text:this.norm(this.master.sentences[i]),u:this.master.sentenceSource[i],i})):[];
      const why=(e&&e.stalled)?'the chat model stalled':'the chat model didn’t load';
      finish({text:fb.text,refs:fb.refs,entities:fb.entities,sources:relevant?fb.sources:[],passages,groundKind:relevant?'matched':undefined,related:this.relatedDocs(q,sources),modelNote:'Answered from your reading — '+why+note+'.',
        register:relevant?'grounded':'creative',reflection:relevant?this._reflect(fb.text):null});
      this._pivotChatPanel(q+' '+(fb.text||''));
      this.setState({modelStatus:''});
    }
  }
  // ── Research mode — chase a topic through fresh sources, then answer ──────────
  // The same engine the ✦ Research button runs (a curiosity walk — docs/curiosity-research.md),
  // but driven from the CHAT and narrated INTO it. It posts the user's turn and a live
  // assistant bubble whose body is a step-by-step research trail; runs a best-first walk that
  // follows the most SURPRISING term while it stays ON TOPIC (curiosity steered, competency
  // leashed); reads every kept page into memory; folds them into what the chat is About; and
  // finally answers, grounded in everything it gathered. One thread per hop, never a fan-out.
  toggleResearchMode(){this.setState(s=>({researchMode:!s.researchMode}));}
  // The web on/off switch (the composer toggle). On is the default; off means the chat answers only
  // from what you've already read, never reaching for the internet. Persisted so the choice sticks.
  toggleWebBrain(){this.setState(s=>{const on=!(s.webBrain!==false);try{localStorage.setItem('eo_webbrain',on?'1':'0');}catch(e){}return {webBrain:on};});}
  // The research-depth policy (shallow / deep / obsessive) → concrete walk knobs. This is the
  // arc's coverage cut: how wide the battery, how many hops, how many pages per thread, and how
  // patiently the leash tolerates a dry thread before stopping.
  _depthCfg(){const d=this.state.researchDepth||'deep';
    if(d==='shallow')  return {key:'shallow',  facets:2, maxHops:3, want:1, wantSeed:1, patience:2};
    // obsessive used to run up to 14 hops × 2 pages each — minutes of reading on the in-browser
    // model, "WAY too long". Reined in: more angles than deep, but a bounded walk (≤9 hops, one
    // page per thread). It exhausts the threads; it does not exhaust the afternoon.
    if(d==='obsessive')return {key:'obsessive',facets:5, maxHops:9, want:1, wantSeed:2, patience:4};
    return                    {key:'deep',     facets:4, maxHops:8, want:1, wantSeed:2, patience:3};}
  cycleResearchDepth(){const order=['shallow','deep','obsessive'];this.setState(s=>{const i=order.indexOf(s.researchDepth||'deep');const next=order[(i+1)%order.length];try{localStorage.setItem('eo_depth',next);}catch(e){}return {researchDepth:next};});}
  // THE REGISTER SWITCH — auto → grounded → creative, persisted (mirrors cycleResearchDepth).
  cycleAnswerMode(){const order=['auto','grounded','creative'];this.setState(s=>{const i=order.indexOf(s.answerMode||'auto');const next=order[(i+1)%order.length];try{localStorage.setItem('eo_answermode',next);}catch(e){}return {answerMode:next};});}
  async chatResearch(q,pre){
    if(this._busy){
      // A walk is already running. A pre-created bubble (sendChat's discourse path) must not be
      // left pending forever — settle it honestly.
      if(pre&&pre.id)this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==pre.id)return c;const m=c.messages.slice(),li=m.length-1;
        if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],pending:false,text:'Another research walk is still running — ask again in a moment.',think:'',research:m[li].research?{...m[li].research,done:true}:undefined};
        return {...c,messages:m};})}));
      return;
    }
    this._stopGen=false;   // a fresh turn clears any prior stop
    // The SUBJECT to chase — named outright when the message carries its own topic, or DERIVED
    // from this chat when the message is a continuation ("do more research", "go deeper"). This is
    // the fix for "it researched the word research": a meta ask now deepens THIS conversation.
    const cur=this.activeChatObj();
    const seed=this._researchSeed(q,cur);
    const topic=seed.topic, anchor=seed.anchor;
    // A BATTERY of distinct angles — not one shot. The salient threads the in-scope reading already
    // raised (for a "this book" / continuation turn) plus a few facets, each its own seed query, so
    // the walk explores several independent threads around the subject instead of chaining off one.
    const lookup=!seed.derived&&this._isSimpleLookup(topic);
    // A LIVE FACT gets the freshest read the walk can make: the seed query carries TODAY'S DATE
    // (search engines rank fresh pages on it) and the walk searches the OPEN WEB directly —
    // Wikipedia-first would answer "what is the weather" with an article about meteorology.
    const live=lookup&&(this._isLiveFact(q)||this._isLiveFact(topic));
    const today=live?new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'';
    // A "go find/read this WORK" turn focuses on the ONE work: read it — its actual text when a
    // Project Gutenberg edition exists — and its context, but do NOT fan out into a battery of facet
    // angles (overview/analysis/history…) that wander off the book. Follow the thread; don't spider.
    const extraSeeds=seed.focus?[]:this._researchBattery(topic,seed.derived,this.chatSourcesOf(cur));
    // The discourse read seeds the walk: MISSING ANCHORS first (the half of the question the
    // reading can't ground — the exact thing to go read), then the metacognition's novel leads.
    // The metacognition deposits mass on the frontier; it never formulates the queries.
    if(pre&&pre.meta&&!seed.focus&&!lookup){
      const want=[...(((pre.meta.anchorGap||{}).missing)||[]),...((pre.meta.leads)||[])];
      for(const w of want){const t=this.norm(w);
        if(t&&extraSeeds.length<5&&!extraSeeds.some(x=>String(x).toLowerCase()===t.toLowerCase()))extraSeeds.unshift(t);}
    }
    const angles=extraSeeds.map(t=>'“'+this._nextQuery(anchor,t)+'”').join(', ');
    const startText=seed.derived
      ? ('Picking up this chat — researching “'+topic+'”'+(angles?(' across '+angles):'')+'. Starting from Wikipedia, then following its cited sources.')
      : live
      ? ('A live question — searching the open web for “'+topic+'” as of '+today+' and reading the freshest source.')
      : lookup
      ? ('Looking up “'+topic+'” — a quick fact, so I’ll read the best source and answer straight.')
      : seed.focus
      ? ('Finding “'+topic+'” and reading it — the full text if it’s on Project Gutenberg, then Wikipedia for context.')
      : ('Researching “'+topic+'”'+(angles?(' — also '+angles):'')+'. Starting from Wikipedia, then following its cited sources to ground it across several.');
    // The turn + pending bubble: REUSED when sendChat already created them (the discourse path —
    // the trail converts from think-mode to a research trail, keeping the read's beats), created
    // fresh when research was entered directly.
    let id=(pre&&pre.id)||this.state.activeChat;
    if(pre&&pre.id){
      this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
        if(li>=0&&m[li].role==='asst'&&m[li].pending){const r=m[li].research||{steps:[],done:false,t0:Date.now()};
          m[li]={...m[li],think:'',research:{...r,mode:'research',steps:[...r.steps,{kind:'start',text:startText}]}};}
        return {...c,messages:m};})}));
      this._scrollChat();this._thinkClock();
    }else{
      this.setState(s=>{let chats=s.chats.slice();let idx=chats.findIndex(c=>c.id===id);
        if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(q,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
        const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(topic,40);
        const research={steps:[{kind:'start',text:startText}],done:false,mode:'research',t0:Date.now()};
        chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:q},{role:'asst',text:'',pending:true,research}]};
        return {chats,activeChat:id,chatInput:''};});
      this._scrollChat();this._thinkClock();
    }
    const pushStep=(kind,text)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst'&&m[li].research){const r=m[li].research;m[li]={...m[li],research:{...r,steps:[...r.steps,{kind,text}]}};}
      return {...c,messages:m};})}),()=>this._scrollChat());
    this._busy=true;this.setState({busy:true});
    const preEnts=(this.graph&&this.graph.entities&&this.graph.entities.size)||0;
    // Actual text first: for a "find/read this work" turn, look the work up on Project Gutenberg and
    // read its full plain text as the primary source, so the answer stands on the BOOK itself, not
    // only articles about it. Fails soft — no match / a fetch error just falls back to the web walk.
    let primaryUrl=null;
    if(seed.focus){
      pushStep('search','Checking Project Gutenberg for the full text of “'+topic+'”…');
      try{const b=await this._gutenbergBook(topic);
        if(b&&b.txtUrl){primaryUrl=b.txtUrl;pushStep('lead','Found “'+b.title+'”'+(b.author&&b.author!=='Unknown author'?(' by '+b.author):'')+' on Project Gutenberg — reading the actual text.');}
        else pushStep('warn','No Project Gutenberg edition found — reading about it from the web instead.');
      }catch(e){pushStep('warn','Couldn’t reach Project Gutenberg — reading about it from the web instead.');}
    }
    let walk={readUrls:[],hops:[]};
    try{walk=await this._curiosityWalk(live?(topic+' '+today):topic,anchor,pushStep,{extraSeeds,lookup,primaryUrl,live});}
    catch(e){pushStep('warn','Research stopped — '+((e&&e.message)||e));}
    this._busy=false;this.setState({busy:false});
    // Stopped mid-walk — stopGeneration already finalized the bubble; don't push a "done" step or
    // start writing the answer on top of it.
    if(this._stopGen)return;
    const readCount=new Set(walk.readUrls).size,hops=walk.hops.length;
    const learned=Math.max(0,((this.graph&&this.graph.entities&&this.graph.entities.size)||0)-preEnts);
    pushStep('done',readCount?('Read '+readCount+' source'+(readCount!==1?'s':'')+' across '+hops+' hop'+(hops!==1?'s':'')+(learned?(' · learned '+learned+' new '+(learned===1?'entity':'entities')):'')+'. Writing it up…')
                              :'Couldn’t gather fresh sources on “'+topic+'” — answering from what’s already read.');
    // Fold what we found into what this chat is About, so the answer is grounded in it and
    // the source chips reflect the new reading.
    for(const u of new Set(walk.readUrls))this.addChatSource(u);
    // Mark the trail done (so it collapses to a summary), then answer into the same bubble. Seed
    // the thinking status in the SAME update so the spinner carries straight over from the research
    // trail to the write-up — no bare-"…" gap while the answer path spins up.
    this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].research)m[li]={...m[li],research:{...m[li].research,done:true,readCount,hops},think:'Writing it up…'};
      return {...c,messages:m};})}));
    // Answer about the SUBJECT (not the literal "do more research" message) grounded in what was
    // read. The longform intent rides from the ORIGINAL turn ("write me an essay…") so stripping
    // the framing off the subject (now just "dolphins") doesn't lose the essay shape.
    await this._answerInto(id,topic,[...new Set(walk.readUrls)],{longform:this._wantsLongform(q,pre&&pre.meta),meta:pre&&pre.meta});
  }
  // Synthesize the grounded answer into the existing pending bubble (which already carries the
  // research trail). Mirrors sendChat's answer path; grounded in whatever the chat is About
  // UNION the sources just gathered — passed in explicitly because the addChatSource setStates
  // above may not have flushed yet, and the new pages must be in scope for this answer.
  // An ask for a LONG, multi-part piece — the opt-in trigger for the arc. Length is never the
  // target (that fights the model's grounded prior); the request only opts INTO the multi-section
  // shape. How long the answer actually runs is set by how much bindable evidence there is.
  _longformIntent(q){return /\b(essays?|treatise|report|deep[\s-]?dive|comprehensive(?:ly)?|in[\s-]?depth|at length|long[\s-]?form|thorough(?:ly)?|detailed|\d{3,}\s*words?|write\s+(?:me\s+)?(?:a|an)\b[^.?!]*\b(?:essay|report|overview|account|piece|article|guide|breakdown))\b/i.test(String(q||''));}
  // _explicitLongform — the STRONG subset of _longformIntent: a named artifact NOUN ("an essay",
  // "a report", "a treatise") or an explicit word count. These name what the user wants outright,
  // so they render longform on their own — unlike the soft QUALIFIERS the old gate also tripped on
  // ("detailed", "thorough", "comprehensive", "in-depth"), which merely describe how any answer
  // should read and belong to the physics measure below, not to a keyword cliff.
  _explicitLongform(q){return /\b(essays?|treatise|dissertation|monograph|report|white[\s-]?paper|\d{3,}\s*words?|write\s+(?:me\s+)?(?:a|an)\b[^.?!]*\b(?:essay|report|overview|account|piece|article|guide|breakdown|treatise))\b/i.test(String(q||''));}
  // _wantsLongform(q, read) — SHOULD this turn render as a developed, multi-section piece rather
  // than one capped answer? The old hard-keyword _longformIntent misfired both ways: soft
  // qualifiers ("in detail", "thorough") tripped a full essay walk over a turn that wanted a solid
  // paragraph, and a paraphrased long ask with no trigger word rendered flat. So the decision now
  // flows from the discourse PHYSICS (meta-route.js: the develop/brief length demand measured off
  // the metacognition's own speech, crosstalk-nulled) with the regex demoted to a FLOOR:
  //   · an EXPLICIT longform artifact ("an essay", "a report", "500 words") renders outright — a
  //     named artifact is a strong seed, not a soft adverb;
  //   · otherwise, when the metacognition read is ALIVE (warm model, a settled read), IT decides —
  //     render iff the speech settled toward a developed treatment (lengthDemand==='develop'), so
  //     "explain this in detail" no longer auto-summons an essay unless the read agrees, and a
  //     paraphrased long ask with no trigger word ("tell me everything about…") still renders;
  //   · length is ORTHOGONAL to the route (meta-route.js): the develop/brief demand is read on
  //     every route and even when the route relaxation abstains, so this keys on `lengthDemand`
  //     directly, never on the route's `abstained` flag;
  //   · a length-neutral read, a COLD model, or an ABSENT read fall back to the keyword floor —
  //     byte-identical to today (the discourse-routing fallback contract).
  // `read` is the discourse measurement (sendChat's `read`, or the `meta` that carries it through
  // the research path); null/absent → the floor.
  _wantsLongform(q,read){
    if(this._explicitLongform(q))return true;                       // named artifact / word count — the strong seed
    if(read){
      if(read.lengthDemand==='develop')return true;                 // the read asks for a developed, multi-section piece
      if(read.lengthDemand==='brief')return false;                  // the read asks for brevity — override the soft-keyword floor
    }
    return this._longformIntent(q);                                 // length-neutral / cold / absent → the keyword floor, unchanged
  }
  // ── COMPOSE: make the artifact, get out of the model's way ────────────────────────────────
  // A small model writes in a named style — Dickinson's dashes, a haiku's 5-7-5, a limerick's bounce
  // — perfectly well from its own training. The bug was NEVER capability; it was the reader's posture.
  // A generative request fell through to the web walk, which stripped it to its subject, researched
  // that, and answered ABOUT it behind a librarian frame — turning "write an emily dickinson poem"
  // into a memory of Dickinson. So _composeIntent catches a request to MAKE a creative artifact and
  // routes it to a plain WRITE: the model is handed the request almost verbatim, in the plain writer
  // frame, and it composes. No web hop, no example scaffolding, no "cite your sources / output only"
  // constraints — the prompting was the thing flattening the poem. Essays/reports stay the grounded
  // arc (_longformArc). The gate is a compose VERB plus a creative KIND, so a question never trips it.
  _CK(){return 'poems?|poetry|sonnets?|haikus?|limericks?|ballads?|odes?|verses?|villanelles?|couplets?|elegy|elegies|epigrams?|hymns?|psalms?|songs?|lyrics?|jingles?|raps?|stories|story|tales?|fables?|fairy[\\s-]?tales?|myths?|legends?|anecdotes?|jokes?|riddles?|dialogues?|monologues?|screenplays?|scripts?|plays?|skits?|rhymes?';}
  _CV(){return 'write|compose|draft|create|pen|author|generate|make(?:\\s+me|\\s+up)?|come\\s+up\\s+with|give\\s+me|tell\\s+me';}
  _composeIntent(q){
    const s=String(q||'');
    return new RegExp('\\b(?:'+this._CV()+')\\b','i').test(s)&&new RegExp('\\b(?:'+this._CK()+')\\b','i').test(s);
  }
  // Mirror of conversation-fold.js switchesFromCompose — the model-free switch-OUT seed
  // (docs/conversation-fold.md §5/§11). Continuation-by-default keeps a compose thread
  // composing; a clearly SELF-CONTAINED question ("what is 237 * 637?", "who wrote Hamlet?")
  // with no back-reference to the piece is a fresh turn and must LEAVE the compose path, not be
  // answered as another poem. Narrow on purpose: an anaphoric follow-up ("make it shorter",
  // "another") carries no fresh subject and is left to continue. Rung 4's warm model is the real
  // detector; this covers the common switch offline until it's wired.
  _switchesFromCompose(q){
    const s=String(q||'').trim();
    if(!s||this._composeIntent(s))return false;
    const wh=/^(?:what|whats|what's|who|who's|whos|why|how|when|where|which|whose|whom)\b/i.test(s);
    const endsQ=/\?\s*$/.test(s);
    if(!wh&&!endsQ)return false;
    const backRef=/\b(?:it|its|it's|this|that|those|them|they|one|another|again|more|shorter|longer|instead|version|the\s+(?:poem|story|piece|song|essay|draft|version))\b/i.test(s);
    return !backRef;
  }
  // The KIND phrase, kept whole ("emily dickinson poem", "haiku"), length/style words peeled. Used
  // only to label the work ("Writing a haiku…"); the model gets the request itself, not this.
  _composeKind(q){
    const m=String(q||'').match(new RegExp('\\b(?:'+this._CV()+')\\s+(?:me\\s+|us\\s+)?(?:an?|another|one|some|the)?\\s*([^.?!,;]*?\\b(?:'+this._CK()+'))\\b','i'));
    let k=m?m[1].trim():'';
    k=k.replace(/^\s*(?:(?:\d+|one|two|three|four|five|several|a\s+few)[-\s]?(?:word|line|stanza|verse)s?\s+)+/i,'').trim();
    k=k.replace(/^\s*(?:short|long|longer|brief|quick|little|simple|original|creative|nice|good|beautiful|funny|sad|happy|silly)\s+/i,'').trim();
    return k||'poem';
  }
  // The compose path: hand the request to the model in the plain writer frame and stream the piece
  // into the bubble. Deliberately minimal — no walk, no examples, no extra system constraints. The
  // model already writes the form; the job here is to stop the reading posture from intercepting it.
  async composeArtifact(q,fold){
    // The enacted compose focus: the KIND that labels the work + the running SUBJECT.
    // A bare "write me one" / "make it shorter" borrows both from the carried fold so
    // "Writing a haiku…" stays a haiku across the thread, not a default poem.
    const focus=this._composeFocus(q,fold);
    const kind=focus.kind;
    const a=/^[aeiou]/i.test(kind)?'an':'a';
    let id=this.state.activeChat;
    const prevObj=this.activeChatObj();
    const prev=((prevObj&&prevObj.messages)||[]).filter(m=>m.text&&!m.pending);
    this.setState(s=>{let chats=s.chats.slice();let idx=chats.findIndex(c=>c.id===id);
      if(idx<0){id=this.chatId();chats=[{id,title:this.truncLabel(q,40),sources:[],messages:[],ts:Date.now()},...chats];idx=0;}
      const c=chats[idx];const title=c.messages.length?c.title:this.truncLabel(q,40);
      chats[idx]={...c,title,messages:[...c.messages,{role:'user',text:q},{role:'asst',text:'',pending:true,think:'Writing '+a+' '+kind+'…'}]};
      return {chats,activeChat:id,chatInput:''};});
    this._scrollChat();this._thinkClock();
    // finish settles the turn, tags it `stance:'compose'` with its focus so the fold carries the
    // compose activity forward — the next "write me one" / "do it" continues it (§2, §5).
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst')m[li]={...m[li],pending:false,stance:'compose',register:'creative',focus,...patch};return {...c,messages:m};})}),()=>this._scrollChat());
    const guard=this._stallGuard();
    let model=null;
    try{model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);}catch(e){model=null;}
    if(!model){guard.clear();finish({text:'I couldn’t load a model to write the '+kind+'.'});return;}
    // The request itself is the prompt, in the plain assistant frame (no doc, no grounding) — the
    // same path that already writes a clean poem with the web off. Prior turns ride as history so
    // "make it shorter" / "now one about the sea" continue the thread.
    const history=prev.slice(-8).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text}));
    const messages=this._ME.buildChatMessages({question:q,history,now:new Date()});
    this._auditRec(id,'compose-prompt',{prompt:messages.map(mm=>'['+mm.role+']\n'+mm.content).join('\n\n---\n\n')});
    let acc='',raf=0;
    const paint=()=>{raf=0;this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc};return {...c,messages:m};})}),()=>this._scrollChat());};
    const onToken=(piece)=>{const sx=String(piece||'');if(!sx)return;guard.feed();acc+=sx;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
    let raw='';
    try{raw=await Promise.race([this._ME.streamPhrase(model,messages,{maxTokens:700,temperature:0.85,onToken,signal:guard.signal}),guard.race]);}
    catch(e){raw=acc;}
    this._auditRec(id,'compose-raw',{output:String(raw||'')});
    // THE FIRST GO, THEN EVALUATE (the lag posture, spec-enacted-writer §6). The piece shown above
    // is a NORMAL answer, not a tentative "first go" — the writer still reads it back once and may
    // rewrite, but that pass is surfaced only in the working banner ("Reading it back…") and the
    // bubble swaps ONLY if a real rewrite actually lands. No "first go" label promising a revision
    // that (at this model size) usually never comes.
    let out=this.normMd(raw)||acc;
    let revised=false,firstGo='';
    if(out&&out.trim()&&!guard.signal.aborted){
      firstGo=out;
      out=await this._reviseIfNeeded(model,q,out,guard,(t)=>{this.setState({modelStatus:t});});
      this.setState({modelStatus:''});
      revised=(out!==firstGo);   // _reviseIfNeeded returns the SAME string on OK, a new one on rewrite
    }
    guard.clear();
    // Keep the first go alongside the revision so the bubble can offer a before/after affordance —
    // the reader can open the original draft and see exactly what the second look changed.
    finish(revised?{text:out,modelNote:'Revised after a second look',firstDraft:firstGo}:{text:out||'(the model returned nothing to write)'});
  }
  // Read the first go back and update only if it falls short. One extra pass: the writer judges its
  // own draft against the request — replies OK when it already lands, or a better full version when it
  // doesn't. Conservative: any failure, an empty verdict, or an OK keeps the first go untouched.
  async _reviseIfNeeded(model,q,draft,guard,onStatus){
    try{
      if(typeof onStatus==='function')onStatus('Reading it back…');
      const msgs=[
        {role:'system',content:'You are the writer, reviewing your own draft. Read it against the request — the form it should take, the voice, and exactly what was asked. If the draft already meets the request well, reply with only the word OK. If it falls short, reply with an improved, complete version of the piece and nothing else — no commentary, no preamble.'},
        {role:'user',content:'Request: '+q+'\n\nDraft:\n'+draft},
      ];
      const verdict=await Promise.race([this._ME.streamPhrase(model,msgs,{maxTokens:700,temperature:0.7,onToken:()=>guard.feed(),signal:guard.signal}),guard.race]);
      let v=(this.normMd(verdict)||'').trim();
      if(!v||/^ok\b/i.test(v))return draft;                 // it judged the first go good enough
      v=v.replace(/^(?:sure[,!.]?\s+|certainly[,!.]?\s+|here(?:'s| is| you go|’s)\b[^\n:]*:?\s*)/i,'').trim();
      return v.replace(/[^a-z]/gi,'').length>=20?v:draft;   // a real rewrite, not a stray token
    }catch(e){return draft;}                                 // any trouble → keep the first go
  }
  async _answerInto(id,q,gathered,opts){
    // OPT-IN LONGFORM (the arc, in the reader's own primitives): SEG the gathered evidence into one
    // section per source (a fold), CON each grounded ONLY in that source's spans (re-prompt per
    // fold), EVA each fold for new coverage and NUL when it would only re-cite, then assemble. Any
    // other ask — or thin supply — takes the ordinary single answer. Length stays EMERGENT.
    // `opts.longform` lets the caller carry the intent from the ORIGINAL turn when `q` has been
    // reduced to a bare subject (research strips "write me an essay about" down to "dolphins").
    if((opts&&opts.longform)||this._wantsLongform(q,opts&&opts.meta))return this._longformArc(id,q,gathered);
    return this._answerSingle(id,q,gathered,opts&&opts.meta);
  }
  async _answerSingle(id,q,gathered,meta){
    // A grounded answer over the gathered/scoped reading — tag `ground` for the fold.
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst')m[li]={...m[li],pending:false,stance:'ground',...patch};return {...c,messages:m};})}),()=>this._scrollChat());
    const cur=this.state.chats.find(c=>c.id===id);
    // Fold the freshly-gathered pages into the chat's scope: "everything" stays everything,
    // a tagged/gathered set widens to include them, and a net-new chat that gathered nothing
    // stays isolated (grounds on nothing read) rather than silently falling back to everything.
    const _sc=this._answerScope(cur,gathered);const isolated=_sc.isolated;const sources=_sc.sources;
    // The named-subject gate again, after the web walk: if the research turned up nothing that
    // names the subject (the corpus still doesn't know it), answer honestly rather than letting
    // the model confabulate it from whatever was gathered. (Skipped for an isolated chat.)
    if(!isolated&&!this._subjectsKnown(q,sources.length?sources:[...new Set([...(gathered||[])])])){finish(this._noSubjectPatch(q,sources));return;}
    const ground=isolated?{spans:[],entities:[],sources:[],relevant:false}:this.groundNotes(q,sources);
    this._setThink(id,this._thinkGround(ground));
    const guard=this._stallGuard();
    try{
      const model=await Promise.race([this.ensureChatModel(guard.feed),guard.race]);
      const amode=this.state.answerMode||'auto';
      const grounded=!isolated&&((ground.spans&&ground.spans.length)||!!(this.graph&&this.graph.entities&&this.graph.entities.size));
      // The GROUNDED register's honesty gate, after the walk: even fresh research turned up
      // nothing to ground on, so decline rather than let the model invent (abstention over invention).
      if(amode==='grounded'&&!grounded){guard.clear();
        finish({text:'Grounded mode: even after looking, nothing read covers this — I won’t answer from the model alone. Switch the register to Auto or Creative to hear its best guess.',
          groundKind:'model',register:'grounded'});
        return;}
      let messages;
      // The research/web chat path: same librarian register (+ sectioned shape on a broad question),
      // plus the discourse read's steering line when the turn carried one (what would satisfy the
      // asker, and what even the gathered reading still doesn't hold).
      const shape=grounded?[this._ME.LIBRARIAN_CUE,(this._ME.shapeForScope&&this._ME.shapeForScope(q))||'',this._steerLine(meta)].filter(Boolean).join('\n\n'):'';
      if(grounded){
        messages=this._ME.buildGroundedMessages({question:q,spans:ground.spans||[],graph:this.meaningGraph(sources),
          orientation:this.chatOrientation(sources),task:this._isSummaryQ(q)?'summary':'answer',conversation:{pastTurns:[]},now:new Date(),shape});
      }else{messages=this._ME.buildChatMessages({question:q,history:[],now:new Date()});}
      this._auditRec(id,'answer-prompt',{prompt:messages.map(mm=>'['+mm.role+']\n'+mm.content).join('\n\n---\n\n')});
      this._setThink(id,this._composeOpen(grounded,ground));
      let acc='',raf=0;
      const paint=()=>{raf=0;const head=this._composeTick(acc);this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc,think:head};return {...c,messages:m};})}),()=>this._scrollChat());};
      const onToken=(piece)=>{const s=String(piece||'');if(!s)return;guard.feed();acc+=s;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
      // A sectioned answer needs room for the lead + parts + follow-ups; a straight lookup keeps the tighter budget.
      const raw=await Promise.race([this._ME.streamPhrase(model,messages,{maxTokens:shape?900:512,temperature:0.4,onToken,signal:guard.signal}),guard.race]);
      guard.clear();
      this._auditRec(id,'answer-raw',{output:String(raw||'')});
      // normMd (not norm): keep the reply's line structure so lists/headings survive into _md.
      const text=this.normMd(raw)||(isolated?'':this.answerQuestion(q,sources).text)||'(no answer)';
      const gr=this._groundReport(ground,grounded);
      // Badge the register the turn ACTUALLY used, and reflect a grounded answer against the graph.
      finish({text:isolated?text:this._withOfficeNote(text,sources),entities:ground.entities,sources:gr.sources,passages:gr.passages,
        groundKind:gr.groundKind,disclosure:gr.disclosure,related:isolated?[]:this.relatedDocs(q,sources),
        register:grounded?'grounded':'creative',reflection:grounded?this._reflect(text):null});
    }catch(e){
      guard.clear();
      // User stop — keep the partial bubble stopGeneration already finalized.
      if((e&&e.stopped)||this._stopGen)return;
      if(isolated){finish({text:'I couldn’t load a model to answer.',groundKind:'model'});this.setState({modelStatus:''});return;}
      const fb=this.answerQuestion(q,sources);
      const relevant=!!(fb.refs&&fb.refs.length);
      const passages=relevant?(fb.refs||[]).map(i=>({text:this.norm(this.master.sentences[i]),u:this.master.sentenceSource[i],i})):[];
      const why=(e&&e.stalled)?'the chat model stalled':'the chat model didn’t load';
      finish({text:fb.text,refs:fb.refs,entities:fb.entities,sources:relevant?fb.sources:[],passages,groundKind:relevant?'matched':undefined,related:this.relatedDocs(q,sources),modelNote:'Answered from what I gathered — '+why+'.',
        register:relevant?'grounded':'creative',reflection:relevant?this._reflect(fb.text):null});
      this.setState({modelStatus:''});
    }
  }
  // THE ARC, in the reader's own primitives — multi-section grounded longform (spec-the-arc).
  // The document is a fold of its events; the turn a fold of its stages; the ARC a fold of a
  // section plan. The plan's sections are THEMES, not sources. The old fold ran one section PER
  // SOURCE: with eight pages all ABOUT one subject (the dolphin essays), every section re-told
  // the same material — evolution, communication, intelligence, pods — and each was headed by a
  // raw page title ("Dolphins Essay - 1049 Words | Bartleby"). So instead: POOL every relevant
  // span across the in-scope sources, then cluster the pool by what the spans are ABOUT. One
  // section now reads on one idea drawn from wherever it was read, headed by the theme — the
  // repetition and the page-title headings both fall out.
  //   POOL  gather every relevant span across the in-scope sources; drop near-duplicates.
  //   SEG   cluster the pool into themes by shared distinctive terms → the section plan, ranked.
  //   LEAD  open with one short grounded paragraph over the strongest spans overall (no heading).
  //   CON   generate each section grounded ONLY in its theme's spans (a re-prompt per fold).
  //   EVA   does this fold add NEW coverage (terms not already covered)? …
  //   NUL   …if it would only re-cite, skip it. Saturation, not a token target, sets the length.
  // Degrades to the single answer when supply is thin (<4 spans / <2 themes) or anything throws.
  async _longformArc(id,q,gathered){
    // An essay/report is the GROUNDED arc (distinct from creative compose) — tag `ground`,
    // and badge it grounded (patch may override, e.g. an honest no-subject decline).
    const finish=(patch)=>this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;
      if(li>=0&&m[li].role==='asst')m[li]={...m[li],pending:false,stance:'ground',register:'grounded',...patch};return {...c,messages:m};})}),()=>this._scrollChat());
    const cur=this.state.chats.find(c=>c.id===id);
    // A net-new chat that gathered nothing has no reading to build an arc over — don't fall back
    // to the whole library; answer plainly instead.
    const _sc=this._answerScope(cur,gathered);
    if(_sc.isolated)return this._answerSingle(id,q,gathered);
    const had=this.chatSourcesOf(cur);
    const scope=had.length?[...new Set([...had,...(gathered||[])])]:[];
    const allUrls=scope.length?scope:[...new Set((this.master&&this.master.sentenceSource||[]).filter(Boolean))];
    // QUALITY GATE on the grounding pool: an essay grounded in essay-mill pages recaps those essays
    // (the plagiarism failure). Ground only in real sources when any are in scope; fall back to the
    // full set just in case the whole scope is mills (then it's an honest recap, not a silent one).
    const hostOf=u=>{try{return new URL(/^https?:/i.test(u)?u:'https://'+u).hostname;}catch(e){return '';}};
    const good=allUrls.filter(u=>!this._lowQualitySource(hostOf(u)));
    const urls=good.length?good:allUrls;
    // The named-subject gate: don't build a multi-section essay about a subject the in-scope
    // reading never names (the Grok case) — answer honestly instead of confabulating sections.
    if(!this._subjectsKnown(q,urls)){finish(this._noSubjectPatch(q,scope));return;}
    this._setThink(id,'Gathering the relevant passages across '+urls.length+' source'+(urls.length!==1?'s':'')+'…');
    // POOL — every relevant span across the in-scope sources, near-duplicates removed so two
    // sources phrasing the same fact don't seed two sections.
    const pool=[],seenKey=new Set(),poolEnts=new Set();
    for(const u of urls){
      const g=this.groundNotes(q,[u]);
      if(!g.relevant)continue;
      for(const e of (g.entities||[]))poolEnts.add(e);
      for(const s of (g.spans||[])){
        if(!s.text||s.text.length<=24)continue;
        const key=s.text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,72);
        if(!key||seenKey.has(key))continue;seenKey.add(key);
        pool.push(s);
      }
    }
    if(pool.length<4)return this._answerSingle(id,q,gathered);   // thin supply — a flat answer reads better
    this._setThink(id,'Found '+pool.length+' passages — mapping out the sections…');
    // SEG — cluster the pool into themes; each becomes one section. <2 themes → single answer.
    const plan=this._clusterSpans(pool,q).slice(0,6);
    if(plan.length<2)return this._answerSingle(id,q,gathered);
    // Guard the load too: a hung download would otherwise wedge the whole arc. On a stall the arc
    // degrades gracefully (model=null → each fold writes its section structurally from the spans).
    let model=null;try{const lg=this._stallGuard();model=await Promise.race([this.ensureChatModel(lg.feed),lg.race]);lg.clear();}catch(e){model=null;}
    const NOVELTY=0.2;
    const covered=new Set(),parts=[],usedHead=new Set(),allEnts=new Set(poolEnts),allSrcs=new Set(),allPass=[];
    // CITATION REGISTRY for the inline superscripts — one footnote number per distinct source, in
    // first-appearance order. _md renders a ⟦cSLOT⟧ sentinel as a superscript glyph showing `n`;
    // the registry rides on the pending message (attached in paint) so the numbers form WHILE the
    // essay streams, and the references list below points at the same numbers. (slot = array index
    // the sentinel carries; n = the displayed footnote number.)
    const cites={},slotOf=new Map();
    const citeFor=(u,sample)=>{if(!u)return -1;if(!slotOf.has(u)){const slot=slotOf.size;
      cites[slot]={u,n:slot+1,text:sample||'',label:this.truncLabel((((this.pageOf(u)||{}).title)||(/^text:/i.test(u)?'text':this.short(u))),40)};
      slotOf.set(u,slot);}return slotOf.get(u);};
    // Bind each SENTENCE of a finished section to the best-matching span it leans on, appending that
    // span's source as an inline superscript (the receipt the reader wanted — every claim shows where
    // it's grounded). Lexical overlap, the same match _citeAnnotate uses, but numbered off the shared
    // registry so a source keeps one number across the whole essay. Headings never get a footnote.
    const SENT=/(?<=[.!?])\s+/;
    const citeBody=(body,spans)=>{
      const ptok=(spans||[]).filter(s=>s&&s.text&&s.u).map(s=>({s,set:new Set(this._researchTerms(s.text))})).filter(p=>p.set.size);
      if(!ptok.length)return body;
      return String(body||'').split('\n').map(line=>{
        if(!line.trim()||/^\s*#{1,6}\s/.test(line))return line;
        return line.split(SENT).map(sent=>{
          const toks=this._researchTerms(sent);if(toks.length<3)return sent;
          const tset=new Set(toks);let best=null,bestScore=0;
          for(const {s,set} of ptok){let hit=0;for(const t of tset)if(set.has(t))hit++;const score=hit/tset.size;if(hit>=2&&score>bestScore){bestScore=score;best=s;}}
          if(best&&bestScore>=0.25){const slot=citeFor(best.u,best.text);if(slot>=0)return sent+'⟦c'+slot+'⟧';}
          return sent;
        }).join(' ');
      }).join('\n');
    };
    let acc='',raf=0;
    const paint=()=>{raf=0;this.setState(s=>({chats:s.chats.map(c=>{if(c.id!==id)return c;const m=c.messages.slice(),li=m.length-1;if(li>=0&&m[li].role==='asst'&&m[li].pending)m[li]={...m[li],text:acc,cites};return {...c,messages:m};})}),()=>this._scrollChat());};
    // The grounding guidance carried into every fold — synthesize across sources, bound claims by
    // identity/space/time, never recap one source end to end (GROUNDING_CUE), in the librarian register.
    const groundShape=[this._ME.LIBRARIAN_CUE,this._ME.GROUNDING_CUE].filter(Boolean).join('\n\n');
    // A grounded fold: stream `spans` into the running essay under an optional `header`, then append
    // the result to `parts`. Shared by the LEAD (no header) and each CON theme section. ACCUMULATE the
    // streamed tokens (`streamed`), don't REPLACE — each onToken piece is one token, so `acc=base+
    // streamed` grows the live view left-to-right. Returns true if it wrote a section, false if the
    // model gave nothing — a barren fold is SKIPPED (no header, no raw-source paste), which is the fix
    // for the essay "crapping out" into a pasted source line (the bled "…| Bartleby" title): a failed
    // section now drops cleanly instead of dumping verbatim source text as prose.
    const fold=async(spans,header)=>{
      this._setThink(id,header?('Writing on: '+header+'…'):'Drafting the opening…');
      const head=header?('## '+header+'\n\n'):'';
      acc=(parts.join('\n\n')+(parts.length?'\n\n':'')+head);paint();
      let body='',streamed='';
      if(model){
        const fg=this._stallGuard();
        try{
          const srcs=[...new Set(spans.map(s=>s.u).filter(Boolean))];const gscope=srcs.length?srcs:urls;
          const msgs=this._ME.buildGroundedMessages({question:q,spans,graph:this.meaningGraph(gscope),
            orientation:this.chatOrientation(gscope),task:'answer',conversation:{pastTurns:[]},now:new Date(),shape:groundShape});
          const base=acc;
          const onToken=(piece)=>{const t=String(piece||'');if(!t)return;fg.feed();streamed+=t;acc=base+streamed;if(!raf)raf=(typeof requestAnimationFrame!=='undefined')?requestAnimationFrame(paint):setTimeout(paint,32);};
          // A stall here keeps whatever streamed and falls through to the structural fallback below,
          // so one wedged section never wedges the whole essay.
          body=this.normMd(await Promise.race([this._ME.streamPhrase(model,msgs,{maxTokens:384,temperature:0.4,onToken,signal:fg.signal}),fg.race]))||this.normMd(streamed);
        }catch(e){body=this.normMd(streamed);}
        fg.clear();
      }
      if(!body){acc=parts.join('\n\n');paint();return false;}   // barren fold — skip it, don't paste raw source
      parts.push(head+citeBody(body,spans));
      for(const s of spans.slice(0,2))allPass.push({text:s.text,u:s.u,i:s.i});
      for(const s of spans)if(s.u)allSrcs.add(s.u);
      acc=parts.join('\n\n');paint();
      return true;
    };
    // LEAD — open on the strongest spans across the whole pool (a frame, not a theme section).
    await fold([...pool].sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,5),null);
    if(this._stopGen)return;   // user stop — stopGeneration kept the partial; don't write past it
    // CON — one grounded section per theme, headed by the theme, while it still adds coverage.
    for(const sec of plan){
      if(this._stopGen)return;
      // EVA → NUL: a fold whose terms are already covered would only re-cite — skip it.
      const terms=new Set(sec.spans.flatMap(s=>this._researchTerms(s.text)));
      const fresh=[...terms].filter(t=>!covered.has(t));
      if(covered.size&&terms.size&&fresh.length/terms.size<NOVELTY)continue;
      let head=(sec.heading&&!usedHead.has(sec.heading.toLowerCase()))?sec.heading:null;
      if(head)usedHead.add(head.toLowerCase());
      await fold(sec.spans,head);
      for(const t of terms)covered.add(t);
    }
    if(this._stopGen)return;
    if(parts.length<2)return this._answerSingle(id,q,gathered);
    const arcText=parts.join('\n\n');
    finish({text:arcText,entities:[...allEnts].slice(0,8),sources:[...allSrcs],
      passages:allPass.slice(0,12),cites:Object.keys(cites).length?cites:null,groundKind:'matched',related:this.relatedDocs(q,scope),
      reflection:this._reflect(arcText)});
  }
  // SEG for the arc: group pooled spans into THEMES, one section each. A theme IS a salient
  // content word — the spans that share it are its section, and that word (Title-Cased) is its
  // heading, clean by construction. So grouping and naming are the same act: no separate
  // heading-derivation step that can name a section "Even" or "Have". The subject's own words
  // and a stoplist of function/verb/adverb/generic words are barred from being theme words (else
  // every span shares them and the pool is one blob). Each span lands in its single best theme;
  // themes are ranked by how many spans they organize, capped at six.
  _clusterSpans(pool,q){
    const stop=this._themeStop();
    const subj=new Set();for(const t of this._researchTerms(q)){subj.add(t);subj.add(t.replace(/s$/,''));subj.add(t+'s');}
    const ok=t=>t.length>=4&&t.length<=14&&!subj.has(t)&&!stop.has(t)&&/^[a-z][a-z'’-]*$/.test(t);
    const termsOf=s=>[...new Set(this._researchTerms(s.text).filter(ok))];
    const items=pool.map((s,idx)=>({s,idx,terms:termsOf(s)})).filter(it=>it.terms.length);
    if(!items.length)return [];
    // term → the spans that carry it. A term in ≥2 spans is a candidate theme (it recurs).
    const byTerm=new Map();
    for(const it of items)for(const t of it.terms){if(!byTerm.has(t))byTerm.set(t,new Set());byTerm.get(t).add(it.idx);}
    const cands=[...byTerm.entries()].filter(([,set])=>set.size>=2)
      .sort((a,b)=>b[1].size-a[1].size||(a[0]<b[0]?-1:1));   // most-organizing first, stable by name
    // Greedily claim themes: each takes its still-unclaimed spans; a theme needs ≥2 of them.
    const MAXSEC=6,claimed=new Set(),themes=[];
    for(const [t,set] of cands){
      if(themes.length>=MAXSEC)break;
      const idxs=[...set].filter(i=>!claimed.has(i));
      if(idxs.length<2)continue;
      for(const i of idxs)claimed.add(i);
      themes.push({heading:this._titleCase(t),spans:idxs.map(i=>pool[i]),score:idxs.length});
    }
    return themes;
  }
  _titleCase(t){t=String(t||'');return t?t.charAt(0).toUpperCase()+t.slice(1):t;}
  // Words barred from being a theme/heading — function words, light verbs, adverbs, and generic
  // nouns that recur everywhere and name nothing. Built once. Folds in the reader's STOP set.
  _themeStop(){
    if(this._themeStopSet)return this._themeStopSet;
    const extra=('also even ever just like much many more most less least very really quite rather still only both each every all any some other others another such including include includes included around within without along among between toward towards regarding concerning despite although though however therefore thus hence because since while whereas about above below over under into onto from with without been being have has had does did done able about often well able about '+
      'observe observed observes observing show shows showed shown showing know knows knew known knowing make makes made making become becomes became becoming use uses used using found find finds finding call calls called calling allow allows allowed help helps helped need needs needed want wants wanted give gives gave given keep kept take takes took taken come comes came see sees saw seen get gets got go goes went develop develops developed exhibit exhibits exhibited range ranges ranged consist consists consisting include '+
      'thing things way ways kind kinds sort sorts lot lots number numbers amount amounts part parts piece pieces example examples variety varieties form forms type types group groups member members aspect aspects fact facts case cases point points level levels area areas place places time times day days '+
      'able such must can could would should shall will might may said say says tell told known').split(/\s+/).filter(Boolean);
    const s=new Set(extra);if(this.STOP)for(const t of this.STOP)s.add(t);
    return (this._themeStopSet=s);
  }
  // The curiosity walk, in the reader's own primitives (searchLinks / readURL / the graph).
  // CURIOSITY steers (chase the most surprising new term), COMPETENCY leashes (only follow
  // threads that stay salient to the question; set aside pages that drift). One thread per
  // hop. onStep(kind,text) narrates each beat into the live chat bubble. Returns the URLs it
  // read and the hop trace.
  async _curiosityWalk(seed,anchor,onStep,opts){
    const step=(k,t)=>{try{onStep&&onStep(k,t);}catch(e){}};
    const readUrls=[],hops=[];
    const seen=new Map();                 // term → mass read so far this walk (the prior surprise is measured against)
    const chased=new Set();               // lead terms already used / already in the question — never re-chase
    for(const t of this._researchTerms(anchor))chased.add(t);
    // The fixed topic frame the leash measures drift against — the question's words, weighted to
    // dominate, enriched once by the first page actually read, then frozen.
    const topic=new Map();for(const t of this._researchTerms(anchor))topic.set(t,(topic.get(t)||0)+3);
    let baseline=0,topicFrozen=false,stray=0;
    // The SUBJECT's identifying company — the FIGURES (graph entities) co-present with the
    // anchor in the calibrating page's fold, the anchor's own figures excluded. Cosine saliency
    // alone is too generous a leash: "World War I", "Nuclear War: A Scenario" and "Democratic
    // peace theory" all share the words "war"/"peace" with the book "War and Peace", so they
    // scored salient and were SAVED. A page must share at least one of these specific figures
    // (Tolstoy, Pierre, Napoleon…) — through the graph's own merged identity, not a word stem —
    // to be about the SAME subject and not a namesake sharing only the topic word.
    const _stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    const anchorWords=new Set(this._researchTerms(anchor).map(_stem));
    const subjectFigures=new Set();
    const cfg=this._depthCfg();                 // shallow / deep / obsessive → the walk's reach
    // The frontier is a FIFO of leads; the seed (the Wikipedia entry point for the subject) leads.
    // A node normally carries {query,term} (searched, Wikipedia-first); a node may instead carry
    // {url} — a SOURCE cited by a read article, read DIRECTLY rather than searched. Cited sources
    // are unshifted (read depth-first, right after the article that cited them) so the walk verifies
    // the subject across the encyclopedia AND its primary sources before fanning out to the battery.
    const frontier=[{query:seed,term:null}];
    // EXTRA SEEDS — the battery: a few more ENTRY POINTS for the subject (the salient threads the
    // reading already raised, plus neutral facets), each its own Wikipedia search, so the walk opens
    // the topic from several angles instead of chaining off one.
    const extra=(opts&&opts.extraSeeds)||[];
    for(const t of extra){const tt=String(t||'').trim();if(tt&&!chased.has(tt)){chased.add(tt);frontier.push({query:this._nextQuery(anchor,tt),term:tt});}}
    // PRIMARY TEXT — a Project Gutenberg full-text edition, read FIRST and directly so the BOOK
    // itself (not an article about it) anchors the walk: its own characters and places become the
    // referent set the relevance leash then checks every later page against.
    if(opts&&opts.primaryUrl)frontier.unshift({url:opts.primaryUrl,term:'source',via:'gutenberg'});
    // BREADTH × DEPTH: the policy caps the hops — shallow stops at the strongest answer, obsessive
    // exhausts the threads — but never fewer than the seeded battery so every planned angle runs.
    // A LOOKUP overrides the dial entirely: one hop on the seed, the strongest answer, no fan-out
    // and no curiosity follow — so even on "obsessive" a "what's the temp" stays a quick lookup.
    const lookup=!!(opts&&opts.lookup);
    // How many CITED sources to follow out of each Wikipedia article — the depth of the source
    // graph — and a hard cap across the whole walk, so it reads primary sources without reading the
    // whole afternoon. A lookup follows none (it wants one fast answer, not a graph).
    const citedPer=lookup?0:(cfg.key==='shallow'?1:(cfg.key==='obsessive'?3:2));
    const citedMax=citedPer?citedPer+1:0;
    const harvested=new Set();   // article URLs whose cited sources are already on the frontier
    let citedTotal=0;
    const maxHops=lookup
      ? frontier.length
      : Math.max(frontier.length,Math.min(cfg.maxHops+citedMax,frontier.length+citedMax+(cfg.key==='obsessive'?3:1)));
    // entCount() — the graph is undefined until the FIRST page is folded (rebuild builds it), and a
    // fresh chat reaches this loop with no graph at all. Reading this.graph.entities.size unguarded
    // then threw on the first read, discarding the ENTIRE walk — so guard it like every other graph read.
    const entCount=()=>(this.graph&&this.graph.entities&&this.graph.entities.size)||0;
    // After a Wikipedia article is read, enqueue its cited primary sources as the NEXT hops (unshift
    // = depth-first), narrated so the sources grounding the answer are visible in real time.
    const harvestCited=async(url,title)=>{
      if(!citedPer||citedTotal>=citedMax||harvested.has(url)||!/wikipedia\.org\/wiki\//i.test(url))return;
      harvested.add(url);
      let cited=[];try{cited=await this._wikiCitedSources(url,citedPer);}catch(e){cited=[];}
      cited=cited.filter(u=>!this.state.pages.find(p=>p.url===u||p.url==='https://'+u)&&!frontier.find(f=>f.url===u));
      if(!cited.length)return;
      step('lead','“'+(title||this.short(url))+'” cites '+cited.length+' source'+(cited.length!==1?'s':'')+' — following '+(cited.length===1?'it':'them')+' to verify: '+cited.map(u=>this.short(u)).join(', '));
      for(let i=cited.length-1;i>=0;i--){if(citedTotal>=citedMax)break;frontier.unshift({url:cited[i],term:'source',via:'wiki-cite'});citedTotal++;}
    };
    while(hops.length<maxHops&&frontier.length){
      if(this._stopGen)break;   // user stop — bail out of the walk between hops
      const node=frontier.shift();
      const isUrl=!!node.url;
      let links=[];
      if(isUrl){
        links=[node.url];
        step('read',node.via==='gutenberg'?('Reading the full text from Project Gutenberg — '+this.short(node.url)+' …'):('Reading a source cited by Wikipedia — '+this.short(node.url)+' …'));
      }else{
        const liveWalk=!!(opts&&opts.live);
        step('search',node.term?('Following “'+node.term+'” — searching “'+node.query+'”'):(liveWalk?('Searching the open web for “'+node.query+'”'):('Searching Wikipedia for “'+node.query+'”')));
        // WIKIPEDIA FIRST (then its sources) — except a LIVE FACT, which goes straight to the
        // open web: the encyclopedia carries the concept of weather, never today's. A provider
        // hiccup must not end the whole walk — _wikiFirstLinks falls back to the open web; if
        // even that fails, the thread is dry and we try the next one (`patience` dry threads
        // in a row ends it).
        try{links=liveWalk?this._dropMills((await this.searchLinks(node.query,9))||[]).slice(0,6):await this._wikiFirstLinks(node.query,6);}catch(e){step('warn','Search unavailable on that thread — '+((e&&e.message)||e));hops.push({query:node.query,term:node.term,got:0,next:null,error:String((e&&e.message)||e)});if(++stray>=cfg.patience)break;continue;}
      }
      links=this._dropMills((links||[]).filter(u=>!this.state.pages.find(p=>p.url===u||p.url==='https://'+u)));
      // UNCALIBRATED walk: no page has frozen the topic frame yet, so the next read decides what
      // "on topic" means for every later hop. Read the candidate whose TITLE names the subject
      // first (the Dolphin article before "Whale (film)"), instead of trusting search rank.
      if(!topicFrozen&&!isUrl&&links.length>1){
        const score=new Map(links.map(u=>[u,this._titleAnchorScore(u,anchorWords)]));
        links=links.map((u,i)=>[u,i]).sort((a,b)=>(score.get(b[0])-score.get(a[0]))||(a[1]-b[1])).map(x=>x[0]);
      }
      if(!links.length){if(!isUrl)step('warn','No fresh sources on that thread.');hops.push({query:node.query||node.url,term:node.term,got:0,next:null,empty:true});if(++stray>=cfg.patience)break;continue;}
      const want=isUrl?1:(node.term?cfg.want:cfg.wantSeed);let got=0,attempts=0;const keptText=[];
      for(let i=0;i<links.length&&got<want&&attempts<5;i++){
        const url=links[i];attempts++;
        if(!isUrl)step('read','Reading '+this.short(url)+' …');
        // A single bad page (a parse/ingest throw) must not kill the walk and lose every hop
        // already gathered — isolate each read so the walk degrades to skipping that candidate.
        try{
          const preEnts=entCount();
          const res=await this.readURL(url,'REAFFERENCE',this.state.viewUrl||null,{onStep:step});
          if(!res)continue;   // blocked / too little text — readURL already logged why; try the next candidate
          const arrival=this._profile(this._pageText(url));
          const sal=this._saliency(topic,arrival);
          if(!topicFrozen){
            // THE SEED GATE (_aboutAnchor): the page about to calibrate the leash must itself be
            // about the SUBJECT — otherwise it is set aside like any stray, the frame stays
            // unfrozen, and the next candidate gets its turn. Without this, one bad top search
            // hit became both a saved source AND the yardstick every later page was measured by.
            // A Gutenberg primary text is exempt: it was already matched to the work by title.
            if(!(isUrl&&node.via==='gutenberg')&&!this._aboutAnchor(url,anchorWords,arrival)){
              this.tossPage(url);step('warn','Set aside '+this.short(url)+' — not about “'+anchor+'”, so it can’t anchor the research');continue;}
            baseline=sal;for(const t of arrival.keys())topic.set(t,(topic.get(t)||0)+1);
            // Seed the subject's figure neighborhood from the calibrating fold: every proper
            // figure co-present with the anchor, the anchor's own figures dropped (else every
            // "war"/"peace" page would trivially "share" it).
            const A=this._anchorFigures(anchorWords);
            for(const fid of this._pageFigures(url).keys()){if(!A.has(fid)&&this._properFigure(fid))subjectFigures.add(fid);}
            topicFrozen=true;}
          else{
            if(baseline>0&&sal<0.34*baseline){this.tossPage(url);step('warn','Set aside '+this.short(url)+' — drifting off “'+anchor+'”');continue;}
            // NAMESAKE leash, on the graph: known subject, but this page's fold touches NONE of
            // its figures — same topic words, different subject. Coupling is through the graph's
            // merged identity (a page mentioning Pierre folds INTO the Pierre figure), so this
            // survives coref where a stem match wouldn't. (Skipped when the neighborhood is too
            // sparse to judge, mirroring pageRelevant's <4 guard, so a thin seed never over-tosses.)
            if(subjectFigures.size>=4){
              const S=new Set([...subjectFigures].map(x=>this._repOf(x)));
              let shared=false;for(const fid of this._pageFigures(url).keys()){if(S.has(fid)){shared=true;break;}}
              if(!shared){this.tossPage(url);step('warn','Set aside '+this.short(url)+' — not about “'+anchor+'” (shares no figures with it)');continue;}}
          }
          got++;readUrls.push(url);keptText.push(this._pageText(url));
          const grew=Math.max(0,entCount()-preEnts);
          step('graph','Read “'+(res.title||this.short(url))+'” · +'+grew+' new entit'+(grew===1?'y':'ies'));
          // The grounding move: a freshly read Wikipedia article's cited sources become the next
          // hops, so the answer stands on the encyclopedia AND its primary sources, not essay mills.
          await harvestCited(url,res.title);
        }catch(e){step('warn','Couldn’t read '+this.short(url)+' — '+((e&&e.message)||e));}
      }
      // CURIOSITY: of everything just kept, what's the most surprising NEW turn? That becomes
      // the single next thread, sharpened by the anchor so it never drifts into a namesake.
      let next=null;
      if(keptText.length){
        const arrival=this._profile(keptText.join('\n'));
        const leads=this._leads(seen,arrival,chased);
        for(const [k,m] of arrival)seen.set(k,(seen.get(k)||0)+m);
        if(!lookup&&leads.length&&hops.length+1<maxHops){next=leads[0].term;chased.add(next);frontier.push({query:this._nextQuery(anchor,next),term:next});
          step('lead','The most surprising turn here is “'+next+'” — chasing it next.');}
      }
      hops.push({query:node.query||node.url,term:node.term,got,next});
      if(!got){if(++stray>=cfg.patience)break;}else stray=0;
    }
    return {readUrls,hops};
  }
  // The content terms that carry a page's topic — lowercased words, function words dropped.
  _researchTerms(s){return (String(s||'').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g)||[]).filter(t=>!this.STOP.has(t));}
  // Bind each PROPOSITION of an answer to the passage it leans on, so the claim links back
  // inline (the ¶ pill _md renders) instead of dumping a generic passage list at the bottom.
  // A lightweight lexical match — content-term overlap per sentence against each gathered
  // passage — line by line so markdown structure (## headings, - bullets) is preserved; a
  // heading never gets a pill. Returns the text with ⟦cN⟧ sentinels + an idx→{u,label} registry.
  // THE EOT REFLECTION (ground/reflect.js via eo-gen): read a settled answer BACK — parse it
  // into Existential-Operator Triples, compare each proposition with the reading's graph, and
  // judge every claim by how many INDEPENDENT origins witness it (corroborated / single-source /
  // interpretation / not in graph). The master fold already holds the doc shape reflect wants:
  // the folded EOT events, the sentence array, and per-sentence source provenance — so
  // origin(i) maps each witness back to the page it came from, and cross-source reads produce
  // genuine diversity-of-origins. Best-effort: any fault returns null, never costs the answer.
  _reflect(text){
    try{
      if(!text||typeof window==='undefined'||!window.eoGen||!window.eoGen.reflectAnswer)return null;
      const m=this.master;
      if(!m||!m.events||!m.events.length||!m.sentences||!m.sentences.length)return null;
      const doc={log:{events:m.events,snapshot:()=>m.events},sentences:m.sentences,units:m.sentences,
        origin:(i)=>({docId:(m.sentenceSource&&m.sentenceSource[i])||'reading'}),docId:'reading'};
      const r=window.eoGen.reflectAnswer({answer:text,doc});
      return (r&&r.eot&&r.eot.length)?r:null;
    }catch(e){return null;}
  }
  _citeAnnotate(text,passages){
    const ps=(passages||[]).filter(p=>p&&p.text&&p.u!=null&&p.i!=null);
    if(!ps.length)return {text:String(text||''),reg:null};
    const ptok=ps.map(p=>({p,set:new Set(this._researchTerms(p.text))}));
    const reg={};const SENT=/(?<=[.!?])\s+/;
    const out=String(text||'').split('\n').map(line=>{
      if(!line.trim()||/^\s*#{1,6}\s/.test(line))return line;           // blank or heading → no cite
      return line.split(SENT).map(sent=>{
        const toks=this._researchTerms(sent);
        if(toks.length<3)return sent;                                    // too short to bind confidently
        const tset=new Set(toks);let best=null,bestScore=0;
        for(const {p,set} of ptok){
          if(!set.size)continue;let hit=0;for(const t of tset)if(set.has(t))hit++;
          const score=hit/tset.size;
          if(hit>=2&&score>bestScore){bestScore=score;best=p;}
        }
        if(best&&bestScore>=0.3){
          if(!reg[best.i]){
            // A true footnote number per distinct PASSAGE (first-appearance order): the glyph ⟦cN⟧
            // and the references list below share this number. The verbatim passage text rides in
            // `text` so the references can preview the actual source line — the librarian apparatus.
            const n=Object.keys(reg).length+1;
            reg[best.i]={u:best.u,n,text:best.text,label:this.truncLabel((((this.pageOf(best.u)||{}).title)||(/^text:/i.test(best.u)?'text':this.short(best.u))),40)};
          }
          return sent+'⟦c'+best.i+'⟧';
        }
        return sent;
      }).join(' ');
    }).join('\n');
    return {text:out,reg:Object.keys(reg).length?reg:null};
  }
  // The bubble's click delegate: a citation pill (data-u) opens its source and scrolls to the
  // cited section (data-quote). Other clicks inside the answer (markdown links carry their own
  // href) fall through untouched.
  _onCite(e){let el=e&&(e.target||e.srcElement);for(let d=0;el&&d<6;d++){if(el.getAttribute){const u=el.getAttribute('data-u');if(u){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();this._hideCiteCard(true);this._goToPassage(u,el.getAttribute('data-quote')||'');return;}}el=el.parentNode;}}
  // Open a cited source and scroll it to the exact passage the citation marks — "go to the
  // section of the page it's from". If the source is already open we just scroll; otherwise we
  // load it, then poll for the iframe to render before scrolling to the verbatim passage.
  _goToPassage(u,quote){
    if(!u)return;
    const already=this.state.viewUrl===this.norm(u);
    if(!already)this.goWeb(u);
    if(!quote)return;
    let tries=0;
    const tick=()=>{const ifr=document.querySelector('iframe[data-eo-center]');const d=ifr&&ifr.contentDocument;
      if(d&&d.body&&d.body.childNodes.length){this._scrollToText(quote);}
      else if(tries++<60){setTimeout(tick,80);}};
    setTimeout(tick,already?0:140);
  }
  // ── Citation hover-card ───────────────────────────────────────────────────
  // Hovering an inline citation pill in a chat answer floats a small card with the source title
  // and the verbatim passage it cites; a "Go to the section" action opens that source scrolled to
  // the passage. Wired as ONE delegated pair of native listeners — mouseover/mouseout bubble, while
  // React's onMouse* synthetic props would not delegate across the answer's raw-HTML children.
  _initCiteHover(){
    if(this._citeHoverInit||typeof document==='undefined')return;
    this._citeHoverInit=true;
    this._onCiteOver=(e)=>{const p=this._closestCite(e.target);if(p)this._showCiteCard(p);};
    this._onCiteOut=(e)=>{const p=this._closestCite(e.target);if(!p)return;const to=e.relatedTarget;if(to&&this._citeCard&&this._citeCard.contains(to))return;this._hideCiteCard();};
    document.addEventListener('mouseover',this._onCiteOver);
    document.addEventListener('mouseout',this._onCiteOut);
  }
  _closestCite(el){for(let d=0;el&&el.getAttribute&&d<4;d++){if(el.classList&&el.classList.contains('eo-cite'))return el;el=el.parentNode;}return null;}
  _citeCardEl(){
    if(this._citeCard)return this._citeCard;
    const el=document.createElement('div');
    el.className='eo-cite-card';el.setAttribute('role','tooltip');
    el.style.cssText='position:fixed;z-index:9000;max-width:330px;display:none;background:#1b1f26;color:#e7eaef;border:1px solid #2c333d;border-radius:11px;box-shadow:0 12px 34px rgba(0,0,0,.42);padding:12px 13px;font-size:12.5px;line-height:1.5;font-family:inherit;';
    el.addEventListener('mouseenter',()=>{clearTimeout(this._citeCardHideT);});
    el.addEventListener('mouseleave',()=>this._hideCiteCard());
    document.body.appendChild(el);this._citeCard=el;return el;
  }
  _showCiteCard(pill){
    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const quote=pill.getAttribute('data-quote')||'',label=pill.getAttribute('data-label')||'source',host=pill.getAttribute('data-host')||'',u=pill.getAttribute('data-u')||'';
    const card=this._citeCardEl();
    card.innerHTML=
      '<div style="display:flex;align-items:baseline;gap:7px;margin-bottom:7px;">'
        +'<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#7c8696;flex:0 0 auto;">Source</span>'
        +'<span style="font-weight:700;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(label)+'</span>'
      +'</div>'
      +(quote?'<div style="color:#cfd5de;border-left:2px solid #5b34d6;padding-left:9px;margin-bottom:9px;max-height:140px;overflow:auto;">“'+esc(quote)+'”</div>':'')
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">'
        +(host?'<span style="font-size:10.5px;color:#7c8696;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(host)+'</span>':'<span></span>')
        +'<button type="button" data-cite-go style="flex:0 0 auto;font-size:11px;font-weight:700;color:#fff;background:#5b34d6;border:none;border-radius:7px;padding:5px 11px;cursor:pointer;">Go to the section →</button>'
      +'</div>';
    const go=card.querySelector('[data-cite-go]');
    if(go)go.onclick=(e)=>{e.preventDefault();e.stopPropagation();this._hideCiteCard(true);this._goToPassage(u,quote);};
    // Position near the pill, flipping above and clamping horizontally to stay on-screen.
    card.style.visibility='hidden';card.style.display='block';
    const r=pill.getBoundingClientRect(),cw=card.offsetWidth,ch=card.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
    const left=Math.min(Math.max(8,r.left),Math.max(8,vw-cw-8));
    let top=r.bottom+8;if(top+ch>vh-8)top=Math.max(8,r.top-ch-8);
    card.style.left=left+'px';card.style.top=top+'px';card.style.visibility='visible';
    clearTimeout(this._citeCardHideT);
  }
  _hideCiteCard(now){clearTimeout(this._citeCardHideT);const el=this._citeCard;if(!el)return;if(now){el.style.display='none';}else{this._citeCardHideT=setTimeout(()=>{el.style.display='none';},180);}}
  // A page reduced to its term-frequency profile — the unit the walk measures surprise on.
  _profile(text){const m=new Map();for(const t of this._researchTerms(text))m.set(t,(m.get(t)||0)+1);return m;}
  // The prose of an already-read page, for the surprise / saliency measure.
  _pageText(url){const p=this.pageOf(url);return p?(p.text||(p.sentences||[]).join(' ')):'';}
  // The stemmed content terms of a URL's TITLE — the Wikipedia slug ("Whale_(film)" → whale,
  // film) or, off-wiki, the last path segment. The cheapest honest signal of what a candidate
  // is ABOUT before spending a fetch on it.
  _titleTerms(url){
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    let t='';
    try{const p=new URL(/^https?:/i.test(url)?url:'https://'+url);
      const m=p.pathname.match(/\/wiki\/([^#?]+)/i);
      t=decodeURIComponent(m?m[1]:(p.pathname.split('/').filter(Boolean).pop()||''));
    }catch(e){t=String(url||'');}
    return new Set(this._researchTerms(t.replace(/[_\-+.]/g,' ')).map(stem));
  }
  // How many of the anchor's stems the candidate's title names — the rank the seed hop reads in.
  // Ordering only: it decides which candidate to FETCH first; the fold decides what is kept.
  _titleAnchorScore(url,anchorStems){let n=0;for(const w of this._titleTerms(url)){if(anchorStems.has(w))n++;}return n;}
  // The graph's canonical id for an entity (label merges resolve here) — identity is the
  // graph's own, so two pages "share a figure" by mentioning the SAME merged entity.
  _repOf(x){return (this.graph&&this.graph.representative)?this.graph.representative(x):x;}
  // The anchor resolved to GRAPH FIGURES — every entity whose label names an anchor word
  // (the same resolution rule the thread basis uses in surfer/salience.js). This is the one
  // unavoidable lexical boundary: the question arrives as words. Past this point relevance
  // is measured on the graph, not on strings.
  _anchorFigures(anchorStems){
    const out=new Set();
    if(!this.graph||!this.graph.entities||!anchorStems||!anchorStems.size)return out;
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    for(const id of this.graph.entities.keys()){
      const l=String(this.labelOf(id)||'').toLowerCase();
      if(!l||this.isURLish(l))continue;
      if(l.split(/[^a-z0-9'’-]+/).some(w=>w&&anchorStems.has(stem(w))))out.add(this._repOf(id));
    }
    return out;
  }
  // A page as a STATE over the graph's figures: canonical entity id → mention mass inside
  // THIS page's sentences (the same event walk mentionsOf runs, scoped to one source). This
  // is what the page IS after the fold — the unit every physics measure below reads.
  _pageFigures(url){
    const m=new Map();
    if(!this.graph||!this.master||!this.master.events)return m;
    const S=new Set();for(let i=0;i<this.master.sentences.length;i++)if(this.master.sentenceSource[i]===url)S.add(i);
    if(!S.size)return m;
    for(const e of this.master.events){
      if(e.sentIdx==null||!S.has(e.sentIdx))continue;
      for(const x of [e.id,e.src,e.tgt,e.from,e.to]){if(x==null)continue;const r=this._repOf(x);m.set(r,(m.get(r)||0)+1);}
    }
    return m;
  }
  // Is this figure an IDENTIFYING referent (a proper name that could pin a subject), not
  // topic filler? The same discipline corefContext applies: a capitalized, non-URL label
  // with at least one non-generic content word.
  _properFigure(id){
    const l=String(this.labelOf(id)||'');
    if(!l||!/[A-Z]/.test(l)||this.isURLish(l))return false;
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    return l.toLowerCase().split(/[^a-z0-9'’-]+/).some(w=>w.length>=3&&!this.STOP.has(w)&&!this.isGenericName(stem(w)));
  }
  // The anchor's standing in a page's OWN fold: its figures' mention mass, their Born weight
  // (the mass share of the anchor subspace in the page state), and their RANK among the
  // page's figures. Null when the fold produced no figures to read (a structureless page).
  _anchorFigureRank(url,anchorStems){
    const figs=this._pageFigures(url);
    if(!figs.size)return null;
    const A=this._anchorFigures(anchorStems);
    let anchorMass=0,total=0,rank=1;
    for(const [id,v] of figs){total+=v;if(A.has(id))anchorMass+=v;}
    for(const [id,v] of figs){if(!A.has(id)&&v>anchorMass)rank++;}
    return {mass:anchorMass,born:total>0?anchorMass/total:0,rank,figures:figs.size};
  }
  // THE SEED GATE — is this page actually ABOUT the anchor's subject? The first page a walk
  // keeps CALIBRATES the whole relevance leash (it sets the saliency baseline, freezes the
  // topic frame, and seeds the figure neighborhood), so it must never be taken on faith: a
  // Wikipedia search for "dolphins … smallest kind" ranked "Whale (film)" first (its plot
  // mentions a dolphin), the film froze the frame, the walk SAVED it as a source — and then
  // tossed genuinely relevant pages for not matching the film.
  //
  // Judged on the PHYSICS, not the words: readURL has already folded the page, so the page
  // exists as figures with mention mass. The gate asks whether the anchor's figures are
  // PRINCIPAL in the page's own fold — real mass, top-rank among the page's figures — or a
  // bit part. The Dolphin article folds "dolphin" as figure #1; "Whale (film)" folds it as
  // a walk-on far down the cast. Term mass is only the degraded channel, for a fold that
  // produced no figures at all. No contentful anchor → nothing to judge against → pass.
  _aboutAnchor(url,anchorStems,arrival){
    if(!anchorStems||!anchorStems.size)return true;
    const r=this._anchorFigureRank(url,anchorStems);
    if(r)return r.mass>=2&&r.rank<=5;
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    let anchorMass=0,maxMass=0;
    for(const [t,m] of (arrival||new Map())){if(m>maxMass)maxMass=m;if(anchorStems.has(stem(t)))anchorMass+=m;}
    return anchorMass>=3&&anchorMass>=0.15*maxMass;
  }
  // SALIENCY (the competency leash): cosine overlap of a page's terms with the fixed topic frame.
  _saliency(topic,arrival){
    if(!arrival.size||!topic.size)return 0;
    let dot=0,ta=0,tb=0;
    for(const [k,w] of topic){tb+=w*w;dot+=w*(arrival.get(k)||0);}
    for(const a of arrival.values())ta+=a*a;
    return (ta&&tb)?dot/Math.sqrt(ta*tb):0;
  }
  // CURIOSITY's leads: the most surprising real terms on a page — repeated, not seen before (or
  // far more here than in the prior), not already chased, not OCR/markup junk. Terms the engine
  // also resolved as ENTITIES are boosted (it understood them, not just saw them — competency).
  _leads(prior,arrival,chased){
    const ents=new Set();try{for(const e of this.graph.entities.values()){const l=this.labelOf(e.id);if(l)ents.add(l.toLowerCase());}}catch(e){}
    const out=[];
    for(const [t,c] of arrival){
      if(chased.has(t)||!this._plausibleLead(t))continue;
      const had=prior.get(t)||0;const novelty=1/(1+had);
      if(!((had===0&&c>=2)||(novelty>0.5&&c>=3)))continue;   // only genuinely new, repeated turns are worth a hop
      let w=c*novelty;if(ents.has(t))w*=1.6;
      out.push({term:t,weight:w});
    }
    out.sort((a,b)=>b.weight-a.weight);
    return out.slice(0,4);
  }
  // Reject OCR / markup artifacts so a junk "word" is never chased (it would top surprise).
  _plausibleLead(t){t=String(t||'').toLowerCase();
    if(t.length<3)return false;if(!/[aeiouy]/.test(t))return false;
    if(/[a-z]\d[a-z]/.test(t))return false;if(/(.)\1\1/.test(t))return false;
    if(/[^aeiouy\d'’-]{6,}/.test(t))return false;return true;}
  // The query that chases ONE lead, kept coherent by the anchor (the standing question) so a
  // bare surprising term never matches a namesake.
  _nextQuery(anchor,term){const a=String(anchor||'').trim(),t=String(term||'').trim();
    if(!t)return a;if(!a)return t;return a.toLowerCase().includes(t.toLowerCase())?a:(a+' '+t);}
  // The grounded answer: rank read sentences by question-term overlap, quote the best,
  // and surface the entities the question names. Scope restricts to one source.
  // Clip a passage to a sane sentence length for display/grounding — a guard against a
  // mis-segmented giant "sentence" being pasted verbatim or blowing the model's context. Cuts on
  // a word boundary and marks the elision; a normal sentence (under the cap) is returned untouched.
  _clipPassage(s){s=String(s||'');if(s.length<=this.MAX_PASSAGE)return s;return s.slice(0,this.MAX_PASSAGE).replace(/\s+\S*$/,'')+'…';}
  answerQuestion(q,scope){
    if(!this.master||!this.master.sentences.length)
      return {text:'I haven’t read anything yet. Read a URL or import a book — it has to be read fully — then ask.',refs:[],entities:[],sources:[]};
    const scopes=(Array.isArray(scope)?scope:(scope?[scope]:[]));
    const qwords=q.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!this.STOP.has(w));
    if(!qwords.length) return {text:'Ask about a name, place, or idea from what you’ve read.',refs:[],entities:[],sources:[]};
    const inScope=i=>!scopes.length||scopes.includes(this.master.sentenceSource[i]);
    const ents=[];
    if(this.graph)for(const e of this.graph.entities.values()){if(!this.showable(e.id))continue;const lab=this.labelOf(e.id).toLowerCase();if(qwords.some(w=>lab===w||(lab.length>3&&lab.includes(w))||(w.length>3&&w.includes(lab))))ents.push(e.id);}
    const scored=[];
    for(let i=0;i<this.master.sentences.length;i++){if(!inScope(i))continue;const s=this.norm(this.master.sentences[i]);
      // A "sentence" longer than this is a SEGMENTATION ARTIFACT — a list, table, or directory
      // page (e.g. "List of Russian sportspeople") the parser couldn't break into real sentences.
      // It is not a prose answer; pasting it dumps thousands of off-topic names. Skip it as a
      // passage. (The page is still folded into the graph as entities; it just can't BE the answer.)
      if(s.length>this.MAX_PASSAGE)continue;
      const low=s.toLowerCase();if(!this._proseOk(low))continue;let v=0;for(const w of qwords)if(low.includes(w))v++;if(v>0)scored.push({i,v});}
    scored.sort((a,b)=>b.v-a.v||a.i-b.i);
    const top=scored.slice(0,3);
    if(!top.length) return {text:'I didn’t find anything about that in what I’ve read.',refs:[],entities:ents.slice(0,6),sources:[]};
    const text=top.map(o=>this._clipPassage(this.norm(this.master.sentences[o.i]))).join(' ');
    const sources=[...new Set(top.map(o=>this.master.sentenceSource[o.i]).filter(Boolean))];
    return {text,refs:top.map(o=>o.i),entities:ents.slice(0,6),sources};
  }
  // View-model for the chat: the left-panel thread list + the active thread, ready
  // for the template. Pure read of state.chats; no engine work here.
  chatVals(base){
    base.chats=(this.state.chats||[]).map(c=>{
      const active=c.id===this.state.activeChat;
      const ss=this.chatSourcesOf(c);
      const scopeSub=this.chatScopeAll(c)?'everything':(ss.length?(ss.length===1?this.truncLabel(((this.pageOf(ss[0])||{}).title)||'a source',22):ss.length+' sources'):'net-new');
      return {id:c.id,title:this.truncLabel(c.title||'New chat',32),
        sub:scopeSub+' · '+Math.ceil(c.messages.length/2)+' Q',
        active,onOpen:()=>this.openChat(c.id),
        rowStyle:'display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;margin-bottom:3px;cursor:pointer;border:1px solid '+(active?'var(--accline)':'transparent')+';background:'+(active?'var(--accbg)':'transparent')+';'};
    });
    base.hasChats=base.chats.length>0;
    const cur=this.activeChatObj();
    if(!cur)return;
    base.chatOn=true;
    // How chat is laid out depends on the responsive tier + whether a page is open:
    //   docked  → a page is open and the viewport is wide enough → chat is its own column.
    //   drawer  → a page is open but width is tight (mid tier, not phone) → absolute overlay.
    //   else    → no page, or phone → chat fills the centre / single pane.
    const onPhone=this.phone(), paneChat=(this.state.pane||'doc')==='chat';
    const docked=!!this.state.viewUrl && !this.narrow();
    const drawer=!!this.state.viewUrl && this.narrow() && !onPhone;
    // Dedicated chat cell: the wide-tier docked column OR the phone "Chat" pane (so the
    // chat input never sits under the bottom nav, and reading stays untouched on doc pane).
    base.chatDockedOn=docked || (onPhone && paneChat);
    // In-<main> chat: the mid-tier overlay drawer, or the desktop no-page centre-fill.
    base.chatOverlayOn=!docked && !onPhone;
    const gOpen=this.state.groundOpen||{};
    const titleForUrl=u=>this.truncLabel(((this.pageOf(u)||{}).title)||(/^text:/i.test(u)?'text':this.short(u)),24);
    const msgs=cur.messages.map((m,mi)=>{
      const isUser=m.role==='user';
      // Grounding chips: the verbatim passages the answer leaned on (the richest, most
      // mechanical trail), then the source(s) and the entities it named. Each passage chip
      // opens its source; entity chips pivot the panel.
      const passages=(m.passages||[]).map(p=>({label:this.truncLabel(this.norm(p.text),46),title:this.norm(p.text),onOpen:()=>this.goWeb(p.u)}));
      const sources=(m.sources||[]).map(u=>({label:titleForUrl(u),title:u,onOpen:()=>this.goWeb(u)}));
      const cites=passages.length?passages:sources;   // prefer passages; fall back to bare sources
      // Each entity carries the DOMAIN it was read from — the source provenance, shown as a muted
      // suffix on the chip. The primary source is the one that mentions the entity most (stable,
      // meaningful when an entity spans several); a "+N" trails when more than one source has it.
      // This is what surfaces the entity-collision case at a glance — "Dolphin · ifaw.org" reads
      // apart from "Dolphins · miamidolphins.com" without opening either.
      const entities=(m.entities||[]).map(id=>{
        let dom='',extra=0;
        if(this.master&&this.graph){
          const cnt={};
          for(const i of this.mentionsOf(id)){const u=this.master.sentenceSource[i];if(u)cnt[u]=(cnt[u]||0)+1;}
          const srcs=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
          if(srcs.length){dom=this.short(srcs[0]);extra=srcs.length-1;}
        }
        return {label:this.labelOf(id),domain:dom,hasDomain:!!dom,hasExtra:extra>0,extraLabel:'+'+extra,onClick:()=>this.clickEntity(id),
          style:'display:inline-flex;align-items:baseline;gap:5px;font-size:11px;font-weight:600;color:var(--acc);background:var(--accbg);border:1px solid var(--accline);border-radius:6px;padding:2px 8px;cursor:pointer;margin:3px 4px 0 0;',
          domStyle:'font-size:9px;font-weight:500;color:var(--acc);opacity:.55;letter-spacing:.02em;white-space:nowrap;'};
      });
      // Render the model's markdown LIVE — even while the bubble is still pending — so lists, bold
      // and line breaks form as the answer streams in, not only once it finishes. User turns stay plain.
      const isMd=!isUser&&!!m.text;
      // Inline footnotes. The longform arc bakes ⟦cN⟧ sentinels into the text AS IT STREAMS and
      // rides its own registry on `m.cites`, so the superscripts grow with the essay — use it
      // directly (pending and settled). Any other answer gets the post-hoc binder once it settles
      // (matched lexically against its passages), so streaming stays cheap. `m.text` already carries
      // sentinels in the longform case, so it's passed straight through.
      const liveReg=(isMd&&m.cites&&Object.keys(m.cites).length)?m.cites:null;
      const ann=(!liveReg&&isMd&&!m.pending&&(m.passages||[]).length)?this._citeAnnotate(m.text,m.passages):null;
      // A LIMNER /svg render (docs/limner.md): the message carries finished SVG
      // markup on `m.svg`; show it as the bubble body verbatim (our own template's
      // output, every text node escaped at the source — render.js).
      const hasSvg=!isUser&&!!m.svg;
      const bodyHtml=hasSvg?m.svg:(isMd?this._md((ann?ann.text:m.text),liveReg||(ann&&ann.reg)):'');
      // The numbered REFERENCES the inline footnotes point at — each previewing the verbatim source
      // line (the librarian apparatus, shown by default). When the binder found no inline match we
      // still list the passages the answer drew on, so the source text is always in view.
      // ~40–60 words is the span that carries a claim with its qualifier and reads as complete
      // (featured-snippet research); longer than the old 46-char chip, clamped in the view so it
      // stays tidy. Each ref also carries its source identity (favicon + domain) and a hasIcon flag.
      const refOf=(u,n,text)=>({n,label:titleForUrl(u),domain:this.short(u)||titleForUrl(u),
        preview:this.truncLabel(this.norm(text),300),onOpen:()=>this.goWeb(u)});
      let refs=[];
      if(liveReg){
        refs=Object.keys(liveReg).map(i=>liveReg[i]).sort((a,b)=>a.n-b.n).map(c=>refOf(c.u,c.n,c.text));
      }else if(ann&&ann.reg){
        refs=Object.keys(ann.reg).map(i=>ann.reg[i]).sort((a,b)=>a.n-b.n).map(c=>refOf(c.u,c.n,c.text));
      }else if(!isUser&&!m.pending&&(m.passages||[]).length){
        refs=(m.passages||[]).slice(0,6).map((p,k)=>refOf(p.u,k+1,p.text));
      }
      // The grounding mode this turn was tagged with (sendChat/_answerInto via _groundReport):
      // 'matched' (lines that matched), 'opening' (drew on the source's opening), 'model' (the
      // model's own words). Older/structural turns carry none — fall back to the matched look
      // when there are chips to show. The disclosure line rides alongside (opening / model).
      const groundKind=m.groundKind||((cites.length||entities.length)?'matched':null);
      const disclosure=m.disclosure||'';
      // THE REGISTER this turn wears (docs/creative-grounded-modes.md) — grounded (anchored to
      // sources, hoverable back to them) vs creative (the model writing freely, marked plainly
      // as invention). Explicit per-turn tag when the turn set one; older turns fall back to
      // the stance/groundKind they already carry. Icons are Phosphor by codepoint (anchor /
      // sparkle), the same convention as RICON below — never emoji.
      const register=(!isUser&&!m.pending)?(m.register||(m.stance==='compose'?'creative'
        :(m.groundKind==='model'?'creative':(((m.passages||[]).length||m.groundKind)?'grounded':null)))):null;
      const REGMETA={
        grounded:{icon:'\ue514',label:'grounded',fg:'#15803d',bg:'#e9f6ee',line:'#bfe3cc',edge:'#15803d',dash:'solid',
          title:'Grounded — the claims are checked against sources; hover a citation to see where each one allegedly comes from.'},
        creative:{icon:'\ue6a2',label:'creative',fg:'#6d28d9',bg:'#f1edfc',line:'#d8ccf7',edge:'#8b5cf6',dash:'dashed',
          title:'Creative — written freely by the model, not tied to sources. Read it as invention, not record.'}};
      const regMeta=register?REGMETA[register]:null;
      const regCount=(register==='grounded')?refs.length:0;
      // THE EOT REFLECTION panel — the answer parsed back into Existential-Operator Triples and
      // judged against the graph, each claim with the independent origins that witness it
      // (ground/reflect.js via _reflect). Rendered as trusted HTML built HERE from escaped
      // parts; the source chips are eo-cite spans, so the existing hover-card (_showCiteCard)
      // and click-to-passage (_onCite) pick them up with no new wiring.
      const refl=(!isUser&&!m.pending&&m.reflection&&m.reflection.eot&&m.reflection.eot.length)?m.reflection:null;
      const reflKey=cur.id+':'+mi+':refl';const reflOn=!!gOpen[reflKey];
      let reflectionHtml='',reflectionTitle='';
      if(refl){
        const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const att=s=>esc(s).replace(/"/g,'&quot;');
        // Status pills: checks = corroborated (≥2 independent origins) · check = single source ·
        // brain = interpretation (the engine's own notes) · x-circle = grounded to void ·
        // check-circle = attribute matches · question = new figure. Phosphor codepoints.
        const RSTAT={
          corroborated:{icon:'\ue53a',label:'corroborated',fg:'#15803d',bg:'#e9f6ee',note:'witnessed by several independent sources'},
          'single-source':{icon:'\ue182',label:'single source',fg:'#b45309',bg:'#fdf3e7',note:'witnessed by one origin only — a second, independent source would corroborate it'},
          interpretation:{icon:'\ue74e',label:'interpretation',fg:'#7c3aed',bg:'#f1edfc',note:'present only through the engine’s own notes — nothing outside the reading witnesses it'},
          unwitnessed:{icon:'\ue4f8',label:'grounded to void',fg:'#dc2626',bg:'#fdecec',note:'no proposition in the graph witnesses this \u2014 it rests on the void, the model\u2019s own training'},
          matches:{icon:'\ue184',label:'matches graph',fg:'#15803d',bg:'#e9f6ee',note:'the graph holds this attribute'},
          novel:{icon:'\ue3e8',label:'new figure',fg:'#b45309',bg:'#fdf3e7',note:'a figure nothing read mentions'}};
        const rows=[...refl.eot].sort((a,b)=>(a.kind==='relation'?0:1)-(b.kind==='relation'?0:1))
          .filter(r=>!(r.kind==='entity'&&r.status==='known')).slice(0,14);
        reflectionHtml=rows.map(r=>{
          const st=RSTAT[r.status]||RSTAT.unwitnessed;
          const chips=(r.sources||[]).map(src=>{
            const u=String(src.docId||'');const host=/^text:/i.test(u)?'':this.short(u);
            const label=this.truncLabel((((this.pageOf(u)||{}).title)||host||u),34);
            const quote=this.truncLabel(this.norm(src.text||''),300);
            return '<span class="eo-cite" data-u="'+att(u)+'" data-quote="'+att(quote)+'" data-label="'+att(label)+'" data-host="'+att(host)+'" style="display:inline-flex;align-items:center;font-size:10px;font-weight:600;color:var(--acc);background:var(--accbg);border:1px solid var(--accline);border-radius:6px;padding:1px 7px;cursor:pointer;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(label)+'</span>';
          }).join('');
          const diverse=(r.kind==='relation'&&(r.origins||0)>=2)
            ?'<span title="Witnessed by several distinct sources — diverse corroboration, not one page repeated." style="flex:0 0 auto;font-size:9.5px;font-weight:700;color:#15803d;">'+r.origins+' independent origins</span>':'';
          return '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);">'
            +'<span title="'+att(st.note)+'" style="flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:'+st.fg+';background:'+st.bg+';border-radius:6px;padding:2px 7px;"><span style="font-family:\'Phosphor\';font-size:11px;line-height:1;">'+st.icon+'</span>'+st.label+'</span>'
            +'<code style="flex:1 1 auto;min-width:0;font-size:10.5px;color:var(--ink);background:transparent;word-break:break-word;">'+esc(r.line)+'</code>'
            +chips+diverse+'</div>';
        }).join('');
        const sm=refl.summary||{};
        const bits=[];if(sm.corroborated)bits.push(sm.corroborated+' corroborated');if(sm.singleSource)bits.push(sm.singleSource+' single-source');
        if(sm.interpretation)bits.push(sm.interpretation+' interpretation');if(sm.unwitnessed)bits.push(sm.unwitnessed+' grounded to void');
        reflectionTitle='EOT reflection · '+(sm.relations||0)+' proposition'+((sm.relations||0)!==1?'s':'')+' vs the graph'+(bits.length?(' — '+bits.join(' · ')):'');
      }
      // Always disclose the footing of an assistant answer: chips when grounded, a plain
      // caveat when it's the model's own. Only a bare 'model' turn with nothing to say (no
      // disclosure, no chips) stays silent.
      const hasGround=!isUser&&!m.pending&&(cites.length>0||entities.length>0||!!disclosure);
      const gKey=cur.id+':'+mi, gOn=!!gOpen[gKey];
      const gBits=[]; if(cites.length)gBits.push(cites.length+(passages.length?(' passage'+(cites.length!==1?'s':'')):(' source'+(cites.length!==1?'s':''))));
      if(entities.length)gBits.push(entities.length+' entit'+(entities.length!==1?'ies':'y'));
      // The chip's headline reflects the mode — never implying a citation the answer doesn't have.
      const groundLabel=groundKind==='opening'
        ? 'Drawn from the opening'+(gBits.length?(' — '+gBits.join(' · ')):'')
        : groundKind==='model'
        ? 'Not grounded in your reading'+(entities.length?(' — '+entities.length+' entit'+(entities.length!==1?'ies':'y')):'')
        : 'Grounded in '+gBits.join(' · ');
      // Related docs — other read sources ranked by relevancy. Default to the top 3; a
      // "+N more" reveals the rest. Offered alongside an answer (and instead of weak
      // grounding when the in-scope sources didn't actually match the question).
      const relAll=(m.related||[]).map(r=>({label:r.title,title:r.url,onOpen:()=>this.goWeb(r.url),
        chipStyle:'display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--ink2);background:var(--app);border:1px solid var(--line2);border-radius:6px;padding:2px 8px;cursor:pointer;'}));
      const relKey=cur.id+':'+mi+':rel', relOn=!!gOpen[relKey];
      const related=relOn?relAll:relAll.slice(0,3);
      // The COMPOSE before/after: when the second-look pass actually rewrote the draft, the turn
      // keeps the first go (m.firstDraft). The "Revised after a second look" note becomes a toggle
      // that opens the original draft beneath the shown piece — the reader sees what changed.
      const revKey=cur.id+':'+mi+':rev', revOn=!!gOpen[revKey];
      const hasRevision=!isUser&&!m.pending&&!!m.firstDraft&&String(m.firstDraft)!==String(m.text);
      // The RESEARCH TRAIL — the live, step-by-step record of the curiosity walk this turn ran
      // (searched · read · followed a surprising lead · set a strayer aside · done). While the
      // walk runs it stays open and grows; once done it collapses to a one-line summary the user
      // can re-open. Makes "it actually went and researched" legible, the way a research-mode
      // chat shows its work.
      // Phosphor icon glyphs (placed by codepoint; the iconStyle below carries font-family:Phosphor):
      // sparkle · magnifying-glass · book-open · plus-circle · arrow-bend-down-right · warning · check · circle-dashed.
      const RICON={start:'\ue6a2',search:'\ue30c',read:'\ue0e6',graph:'\ue3d6',lead:'\ue01a',warn:'\ue4e0',done:'\ue182',think:'\ue602'};
      const RCOL ={start:'var(--acc)',search:'#2563eb',read:'#b45309',graph:'#15803d',lead:'var(--acc)',warn:'#dc2626',done:'#15803d',think:'#7c8088'};
      const r=m.research;
      const pendingTurn=!!m.pending;
      const mode=(r&&r.mode)||'research';
      // The walk runs (mode 'research', not yet done); the trail also covers the COMPOSE phase that
      // follows — and plain 'think'-mode turns that never hit the web — so the live view stays up the
      // whole time the turn is working, never collapsing to a bare spinner mid-thought.
      const walkRunning=!!(r&&!r.done&&pendingTurn&&mode==='research');
      // Freeze the elapsed clock on the first render after the turn settles, so a later re-render
      // never recomputes a stale, ballooning "Thought for …" off the original start.
      if(r&&!pendingTurn&&r.t0&&!r.tEnd)r.tEnd=Date.now();
      const t0=r&&r.t0,tEnd=(r&&r.tEnd)||Date.now();
      const secs=t0?Math.max(0,Math.floor((tEnd-t0)/1000)):0;
      const fmtSecs=(n)=>n>=60?(Math.floor(n/60)+':'+String(n%60).padStart(2,'0')):(n+'s');
      // Keep the chip while the turn works (always), for a real web walk (its provenance is worth
      // keeping), or for any think-turn that took more than one beat. A trivial instant answer (one
      // 'Thinking…' beat) leaves no chip behind.
      const hasResearch=!!(r&&r.steps&&r.steps.length)&&(pendingTurn||mode==='research'||r.steps.length>1);
      const researchRunning=hasResearch&&pendingTurn;
      // COLLAPSIBLE, LIKE CLAUDE'S THINKING. While the turn runs, the trail is open by default but
      // the header FOLDS it to just the live status line — a separate `liveKey` tracks that running
      // collapse so it never fights the done-state toggle (resKey). Once the turn settles, resKey
      // re-opens the full trail as before.
      const resKey=cur.id+':'+mi+':res', liveKey=cur.id+':'+mi+':reslive';
      const liveCollapsed=!!gOpen[liveKey];
      const resOn=hasResearch&&(pendingTurn?!liveCollapsed:!!gOpen[resKey]);
      const researchSteps=hasResearch?r.steps.map(s=>({icon:RICON[s.kind]||'·',text:s.text,
        rowStyle:'display:flex;align-items:flex-start;gap:7px;font-size:11.5px;line-height:1.45;color:var(--ink2);',
        iconStyle:'flex:0 0 auto;width:16px;height:16px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-family:\'Phosphor\';font-size:12.5px;color:'+(RCOL[s.kind]||'#9aa1ab')+';background:'+(RCOL[s.kind]||'#9aa1ab')+'1c;margin-top:1px;',
        textStyle:'flex:1;min-width:0;'})):[];
      const rc=(r&&r.readCount)||0,hp=(r&&r.hops)||0;
      // The header reads as a LIVE status while working — the current beat plus a ticking clock — then
      // settles into a one-line summary (sources·hops for a walk, "Thought for Ns" for a plain turn).
      // When the live trail is OPEN, the current step already shows as its newest beat below — so the
      // header drops to a generic status ("Thinking…"/"Researching…") rather than repeating that exact
      // line above it. Collapsed, the trail is hidden, so the header carries the live step detail.
      const liveTrailOpen=researchRunning&&!liveCollapsed;
      const liveStatus=walkRunning?'Researching…':(mode==='research'?'Composing the answer…':'Thinking…');
      const researchTitle=pendingTurn
        ? ((liveTrailOpen?liveStatus:(m.think||liveStatus))+(secs?(' · '+fmtSecs(secs)):''))
        : (mode==='research'
            ? ('Researched '+rc+' source'+(rc!==1?'s':'')+' · '+hp+' hop'+(hp!==1?'s':''))
            : ('Thought'+(secs?(' for '+fmtSecs(secs)):'')));
      // WHILE WORKING: the trail is Claude-style thinking — open by default and showing the FULL
      // reasoning (every beat) inside a bounded scroll pane (researchLiveBox below), so the wait is
      // legible instead of a frozen spinner. The header folds it away (liveCollapsed) to just the
      // live status line; it re-opens on click. Once the turn settles, resKey governs the summary.
      const researchLiveOn=researchRunning&&!liveCollapsed;
      const researchFullOn=!researchRunning&&resOn;
      const researchLive=researchLiveOn?researchSteps:[];
      const researchHasEarlier=false;
      const researchEarlierLabel='';
      // A caret even while running, reflecting the open/closed state — the trail is togglable now.
      const researchCaret=researchRunning?(researchLiveOn?'▾':'▸'):(resOn?'▾':'▸');
      // A spinner in the chip header keeps constant motion while the turn works (the model can decode
      // for seconds between beats); it swaps to the expand caret once the turn settles.
      const traceSpinStyle=pendingTurn?'flex:0 0 auto;width:11px;height:11px;border-radius:50%;border:2px solid var(--accline);border-top-color:var(--acc);animation:eospin .8s linear infinite;display:inline-block;box-sizing:border-box;':'display:none;';
      // While researching with no answer yet, the trail IS the message — suppress the empty
      // pulsing bubble. Once the answer streams in (or for a normal turn) the bubble shows.
      // Until the first token, show the live "thinking" line (what the model is doing right now)
      // as its OWN row — a continuously spinning loader + steady text — not the answer bubble.
      // A spinner gives motion at every instant (CSS runs even between re-renders); the old
      // opacity pulse read as the feedback "fading out", which is the opposite of reassuring.
      // The live thinking trail now carries the "what it's doing right now" status (with its own
      // header spinner), so the standalone spinner row is only a fallback for the rare pending turn
      // that has no trail at all.
      const thinking=!!m.pending&&!m.text&&!!m.think&&!hasResearch;
      // While the turn is still working with no answer text yet, the live trail IS the message —
      // suppress the empty pulsing bubble. Once a token streams in (or the turn settles) it shows.
      // THE DISCOURSE STEER SUGGESTION (docs/discourse-routing.md): when the metacognition read the
      // turn as a make-this, the bubble carries a `suggest` instead of an answer — the permission
      // prompt + the two choices. It renders in its own block, so the (empty) answer bubble is
      // suppressed. The handlers accept/decline off the stored steer (topic + measured type/kind).
      const sug=(!isUser&&m.suggest)?m.suggest:null;
      const showBubble=!thinking&&!sug&&!(pendingTurn&&!m.text);
      // main's streaming fills m.text on a still-pending bubble; show it as it arrives.
      return {isUser,pending:!!m.pending,thinking,think:m.think||'',showBubble,text:m.pending?(m.text||m.think||'…'):m.text,isMd:isMd||hasSvg,plain:!(isMd||hasSvg),html:bodyHtml,onCite:(e)=>this._onCite(e),
        hasSuggest:!!sug,suggestText:sug?sug.text:'',suggestWriteLabel:sug?sug.writeLabel:'',suggestAnswerLabel:sug?sug.answerLabel:'',
        onSuggestWrite:sug?(()=>this._acceptSteer(cur.id,mi)):null,onSuggestAnswer:sug?(()=>this._declineSteer(cur.id,mi)):null,
        thinkRowStyle:'max-width:80%;display:flex;align-items:center;gap:9px;background:var(--card);border:1px solid var(--line);padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.55;color:var(--ink2);',
        thinkSpinnerStyle:'flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:2px solid var(--accline);border-top-color:var(--acc);animation:eospin .8s linear infinite;display:inline-block;box-sizing:border-box;',
        hasResearch,researchRunning,researchSteps,researchOpen:resOn,researchTitle,
        researchLiveOn,researchFullOn,researchLive,researchHasEarlier,researchEarlierLabel,
        researchLiveBox:'margin-top:7px;display:flex;flex-direction:column;gap:5px;max-height:260px;overflow-y:auto;',
        researchEarlierStyle:'font-size:10.5px;color:var(--ink3);margin-top:1px;padding-left:23px;',
        researchCaret,traceSpinStyle,onToggleResearch:()=>this.toggleGround(pendingTurn?liveKey:resKey),
        researchStyle:'max-width:80%;margin-bottom:7px;background:var(--app);border:1px solid var(--line2);border-radius:11px;padding:9px 12px;align-self:flex-start;',
        researchHeadStyle:'display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--ink3);background:transparent;border:none;padding:0;cursor:pointer;',
        // The register badge — worn above the bubble; the tinted left border rides bubbleStyle.
        hasRegister:!!regMeta,registerIcon:regMeta?regMeta.icon:'',registerTitle:regMeta?regMeta.title:'',
        registerLabel:regMeta?(regMeta.label+(regCount?(' · '+regCount+' source'+(regCount!==1?'s':'')):'')):'',
        registerStyle:regMeta?('display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+regMeta.fg+';background:'+regMeta.bg+';border:1px solid '+regMeta.line+';border-radius:999px;padding:2px 9px;margin-bottom:5px;cursor:default;'):'',
        registerIconStyle:'font-family:\'Phosphor\';font-size:11.5px;line-height:1;',
        // The EOT reflection — collapsed beneath the ground block; rows are trusted HTML built above.
        hasReflection:!!refl,reflectionOpen:reflOn,onToggleReflection:()=>this.toggleGround(reflKey),
        reflectionTitle,reflectionCaret:reflOn?'▾':'▸',reflectionHtml,
        reflectionStyle:'max-width:88%;margin-top:7px;',
        reflectionHeadStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3);background:transparent;border:none;padding:2px 0;cursor:pointer;',
        reflectionBodyStyle:'margin-top:6px;display:flex;flex-direction:column;gap:5px;',
        hasMeta:!isUser&&!m.pending&&(sources.length>0||entities.length>0),
        sources:cites,hasSources:cites.length>0,entities,hasEntities:entities.length>0,
        hasGround,groundOpen:gOn,onToggleGround:()=>this.toggleGround(gKey),
        groundLabel,groundCaret:gOn?'▾':'▸',
        refs,refsHas:refs.length>0,
        refsLabel:'Sources · '+refs.length,
        refsStyle:'max-width:88%;margin-top:10px;border-top:1px solid var(--line);padding-top:8px;',
        refsHeadStyle:'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);margin:0 0 4px;',
        refRowStyle:'display:flex;align-items:flex-start;gap:9px;padding:8px 6px;border-radius:8px;cursor:pointer;',
        refNumStyle:'flex:0 0 auto;font-size:11px;font-weight:700;color:var(--acc);min-width:13px;text-align:right;margin-top:1px;',
        refBodyStyle:'flex:1;min-width:0;',
        refPreviewStyle:'font-size:12.5px;line-height:1.5;color:var(--ink);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;',
        refSrcStyle:'display:block;font-size:10.5px;font-weight:600;color:var(--ink3);margin-top:4px;',
        groundDisclosure:disclosure,hasDisclosure:!!disclosure,
        disclosureStyle:'font-size:11px;line-height:1.45;color:var(--ink3);font-style:italic;margin-top:5px;',
        groundStyle:'max-width:80%;margin-top:7px;',
        groundHeadStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3);background:transparent;border:none;padding:2px 0;cursor:pointer;',
        related,hasRelated:relAll.length>0,relatedHasMore:relAll.length>3,
        onToggleRelated:()=>this.toggleGround(relKey),
        relatedMoreLabel:relOn?'Show fewer':('+'+(relAll.length-3)+' more'),
        relatedStyle:'max-width:80%;margin-top:7px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;',
        relatedHeadStyle:'font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3);margin-right:1px;',
        relatedMoreStyle:'font-size:10.5px;font-weight:600;color:var(--acc);background:transparent;border:none;cursor:pointer;padding:2px 4px;',
        // The plain note yields to the interactive affordance when there IS a before/after to show.
        hasNote:!!m.modelNote&&!hasRevision,note:(m.modelNote||''),
        hasRevision,revisionOpen:revOn,onToggleRevision:()=>this.toggleGround(revKey),
        revisionLabel:(m.modelNote||'Revised after a second look'),revisionCaret:revOn?'▾':'▸',
        revisionBefore:String(m.firstDraft||''),
        revisionToggleStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--ink3);margin-top:5px;background:transparent;border:none;padding:0;cursor:pointer;',
        revisionPanelStyle:'max-width:80%;margin-top:6px;border:1px solid var(--line);border-radius:11px;padding:9px 12px;background:var(--app);',
        revisionHeadStyle:'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);margin:0 0 5px;',
        revisionBeforeStyle:'font-size:13px;line-height:1.55;color:var(--ink2);white-space:pre-wrap;word-break:break-word;',
        rowStyle:'display:flex;flex-direction:column;'+(isUser?'align-items:flex-end;':'align-items:flex-start;')+'margin-bottom:15px;',
        bubbleStyle:(isUser?'background:var(--acc);color:#fff;border:1px solid var(--acc);':'background:var(--card);color:'+((m.pending&&!m.text)?'var(--ink3)':'var(--ink)')+';border:1px solid var(--line);')
          // The register's edge: solid green = grounded, dashed violet = creative — legible while scrolling.
          +(regMeta?('border-left:3px '+regMeta.dash+' '+regMeta.edge+';'):'')
          +'max-width:80%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word;'+(m.pending&&!m.text?'animation:eopulse 1.4s infinite;':''),
        noteStyle:'font-size:10.5px;color:var(--ink3);margin-top:5px;max-width:80%;',
        srcRowStyle:'display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;max-width:80%;',
        srcChipStyle:'display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--ink2);background:var(--app);border:1px solid var(--line2);border-radius:6px;padding:2px 8px;cursor:pointer;'};
    });
    // What this chat is ABOUT. Three states, shown distinctly in the header:
    //   isolated  → a NET-NEW space: nothing tagged, grounds on nothing read.
    //   everything → the explicit "Everything you've read" tag (a removable chip).
    //   specific  → one removable chip per tagged source.
    const ss=this.chatSourcesOf(cur);
    const isEvery=this.chatScopeAll(cur), isIso=this.chatIsolated(cur);
    const titleOf=u=>this.truncLabel(((this.pageOf(u)||{}).title)||this.short(u),26);
    const aboutChips=ss.map(u=>({label:titleOf(u),url:u,onOpen:()=>this.goWeb(u),
      onRemove:ev=>{if(ev&&ev.stopPropagation)ev.stopPropagation();this.removeChatSource(u);},
      chipStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--acc);background:var(--accbg);border:1px solid var(--accline);border-radius:7px;padding:3px 4px 3px 9px;max-width:200px;',
      xStyle:'border:none;background:transparent;color:var(--acc);cursor:pointer;font-size:13px;line-height:1;padding:0 2px;border-radius:4px;'}));
    const pages=(this.master&&this.master.pages)||[];
    const nSrc=pages.length;
    // The "+ Add source" picker, organized by TOPIC: each primary page with the branching
    // pages found from it nested underneath (indented), so you grab things by subject — not
    // from a flat list. Already-tagged sources drop out.
    const addable=this._chatAddTree(new Set(ss)).filter(n=>!n.tagged).map(n=>({label:this.truncLabel(n.title,34),host:this.short(n.url),
      onAdd:()=>this.addChatSource(n.url),
      rowStyle:'display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 11px;border-radius:8px;cursor:pointer;'
        +(n.depth?('margin-left:'+(n.depth*14)+'px;border-left:2px solid var(--line2);border-radius:0 8px 8px 0;'):'')
        +(n.depth===0&&n.kids?'font-weight:700;':'')}));
    // A turn is live in this chat (model decoding, an arc writing, or a research walk running) —
    // the single signal that lights the "model is working" banner and swaps Ask → Stop.
    const genActive=this._genActive(cur);
    const ml=this._modelLabel();
    // The status line text: the model name + what it's doing while a turn is live; the load progress
    // otherwise (the model downloading before the first chat). One row serves both.
    const statusText=genActive
      ? (ml+(this.state.modelStatus?(' · '+this.state.modelStatus):' is working — generating your answer…'))
      : (this.state.modelStatus||'');
    base.chat={title:this.truncLabel(cur.title||'New chat',40),drawer,docked,
      // Export this chat's full audit — every internal prompt, raw model output, step trail,
      // and source — as one JSON file (the "are we really chatting or grepping spans" answer).
      onExportAudit:()=>this.exportChatAudit(cur.id),
      scopeLabel:isEvery?'everything you have read':(ss.length?(ss.length===1?titleOf(ss[0]):(ss.length+' sources')):'a net-new space'),
      // The header subtitle spells out what the chat draws on, so isolation is legible.
      subLabel:isIso?'A net-new space — tag sources to ground it in your reading'
        :isEvery?('Grounded across everything you’ve read'+(nSrc?(' · '+nSrc+' source'+(nSrc!==1?'s':'')):''))
        :('Grounded in '+(ss.length===1?('“'+titleOf(ss[0])+'”'):(ss.length+' sources'))),
      about:aboutChips,hasAbout:aboutChips.length>0,
      // Distinct chips for the three states: the muted "net new" hint, the removable
      // "everything" tag, and the "+ tag everything" quick action shown when neither is set.
      aboutIsolated:isIso,scopeEverythingOn:isEvery,
      everyLabel:'Everything you’ve read'+(nSrc?(' · '+nSrc+' source'+(nSrc!==1?'s':'')):''),
      onTagEverything:()=>this.setChatScopeAll(true),onUntagEverything:()=>this.setChatScopeAll(false),
      // Offer the "everything" tag (inline chip + a row atop the picker) whenever the chat isn't
      // already ranging over everything and there is at least one source to range over.
      tagEveryOn:!isEvery&&nSrc>0,
      addOpen:!!this.state.chatAddOpen,addable,hasAddable:addable.length>0,noAddable:addable.length===0,onToggleAdd:()=>this.toggleChatAdd(),
      // Attach a file straight from the chat — like a regular chatbot's paperclip. It imports,
      // shows up instantly as a pending Source, and tags itself into THIS chat once read.
      onImport:()=>this.onImportClick(cur.id),
      addEmptyMsg:nSrc?'All your sources are already tagged in this chat.':'Read a URL or import a book to tag a source.',
      messages:msgs,empty:msgs.length===0,
      // The empty-state copy tracks the scope: a fresh space reads as a blank slate.
      emptyHint:isIso?'A fresh, empty chat.':'Ask anything about what you’ve read.',
      emptySub:isIso?'Nothing from your reading is in scope yet — tag sources above, or just start typing.':'Answers are quoted from your sources — every claim links back.',
      generating:genActive,
      modelStatus:statusText,hasStatus:genActive||!!this.state.modelStatus,
      // The banner reads as a calm hint while loading, and a live accent pill while the model works —
      // so it's unmistakable WHERE the app is busy with the model.
      statusStyle:genActive
        ? 'max-width:720px;margin:0 auto 8px;font-size:11.5px;font-weight:600;color:var(--acc);background:var(--accbg);border:1px solid var(--accline);border-radius:9px;padding:6px 11px;display:flex;align-items:center;gap:8px;'
        : 'max-width:720px;margin:0 auto 8px;font-size:11.5px;color:var(--ink3);display:flex;align-items:center;gap:8px;',
      shellStyle:drawer
        ? 'position:absolute;top:0;right:0;bottom:0;width:min(440px,92%);z-index:20;display:flex;flex-direction:column;min-height:0;background:var(--app);border-left:1px solid var(--line);box-shadow:-14px 0 44px rgba(20,24,30,.16);animation:eoslide .18s ease-out;'
        : 'height:100%;display:flex;flex-direction:column;min-height:0;background:var(--app);'+(docked?'border-left:1px solid var(--line);':''),
      placeholder:this.state.researchMode?'Name a topic to research — I’ll go read about it…'
        :isIso?'Ask anything — nothing tagged yet…'
        :isEvery?'Ask about everything you’ve read…'
        :('Ask about '+(ss.length===1?('“'+titleOf(ss[0])+'”'):('these '+ss.length+' sources'))+'…')};
  }
  // ── Project Gutenberg — a source of sources ──────────────────────────────
  // Search the catalog (gutendex), fetched through the same proxy. Returns books
  // that have a plain-text edition we can read.
  async searchGutenberg(query){
    const api='https://gutendex.com/books/?search='+encodeURIComponent(query);
    let data;
    try{const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent(api));if(!r.ok)throw new Error('HTTP '+r.status);data=JSON.parse(await r.text());}
    catch(e){this.feedLine('warn','Gutenberg search failed — '+(e&&e.message||e));return [];}
    return this._gutenBooks(data).slice(0,16);
  }
  // The one Gutenberg edition that IS the requested work — so "go find the book war and peace"
  // reads Tolstoy's actual text, not a Wikipedia article about it. Rank by how much the catalog
  // title overlaps the asked-for title (a real match, not a namesake), then by popularity (the
  // canonical edition). Null when nothing plain-text matches — the walk then falls back to the web.
  async _gutenbergBook(title){
    const want=new Set(this._researchTerms(title));if(!want.size)return null;
    let books=[];try{books=await this.searchGutenberg(title);}catch(e){return null;}
    const score=b=>{const t=new Set(this._researchTerms(b.title));let s=0;want.forEach(w=>{if(t.has(w))s++;});return s;};
    const scored=books.filter(b=>b&&b.txtUrl&&score(b)>0).sort((a,b)=>(score(b)-score(a))||((b.downloads||0)-(a.downloads||0)));
    return scored[0]||null;
  }
  // Map a gutendex response to readable books — only those with a plain-text edition.
  _gutenBooks(data){
    return ((data&&data.results)||[]).map(b=>{
      const f=b.formats||{};
      const txt=f['text/plain; charset=utf-8']||f['text/plain; charset=us-ascii']||f['text/plain']||(Object.entries(f).find(([k,v])=>/text\/plain/i.test(k)&&!/\.zip$/i.test(v))||[])[1];
      const a0=(b.authors&&b.authors[0])||null;
      return {id:b.id,title:b.title,author:(a0&&a0.name)||'Unknown author',
        authorBirth:(a0&&a0.birth_year)||null,authorDeath:(a0&&a0.death_year)||null,txtUrl:txt,
        cover:f['image/jpeg']||null,downloads:b.download_count||0,subjects:b.subjects||[],bookshelves:b.bookshelves||[]};
    }).filter(b=>b.txtUrl);
  }
  // A few short, readable genre/topic tags from gutendex's verbose subject strings
  // ("Adventure stories -- Fiction" → "Adventure stories").
  _gutenTags(b){const seen=new Set(),out=[];
    [].concat(b.subjects||[],b.bookshelves||[]).forEach(s=>{const t=String(s).split(' -- ')[0].trim();const k=t.toLowerCase();
      if(t&&t.length<30&&!seen.has(k)){seen.add(k);out.push(t);}});
    return out.slice(0,3);
  }
  // Gutendex names come "Surname, Forename" (catalog order). Flip to natural
  // reading order — "Kafka, Franz" → "Franz Kafka" — so the byline reads as a name,
  // not an index entry. Single-token or organisational names pass through untouched.
  authorDisplay(name){
    name=String(name||'').trim();
    if(!name||name==='Unknown author')return name;
    const c=name.split(',');
    if(c.length===2){const last=c[0].trim(),first=c[1].trim();if(first&&last)return first+' '+last;}
    return name;
  }
  // Elegant title/author/date metadata for a Gutenberg book. The author's life
  // dates (from gutendex) place the work in its era; an "Original publication" line
  // in the raw header, when present, gives the true publication year and wins.
  bookMeta(book,raw){
    const author=this.authorDisplay(book.author);
    const life=book.authorBirth?(book.authorBirth+'–'+(book.authorDeath||'')):'';
    let published=null;
    const head=String(raw||'').split(/\*\*\*\s*START OF/i)[0];
    const m=head.match(/Original publication:[^\n]*?\b(1[0-9]{3}|20[0-9]{2})\b/i);
    if(m)published=m[1];
    return {author,authorDates:life,published};
  }
  // Strip Project Gutenberg's license header/footer so only the work is read.
  stripGutenberg(t){
    t=String(t||'').replace(/\r\n/g,'\n');
    const sm=t.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i);
    if(sm)t=t.slice(sm.index+sm[0].length);
    const em=t.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
    if(em)t=t.slice(0,em.index);
    return t.trim();
  }
  // Type a query: a URL is opened; anything else searches Project Gutenberg.
  searchBooks(query){
    this.setState({gutenLoading:true,gutenResults:null,gutenQuery:query,activeChat:null,viewUrl:null,selId:null,newTabOpen:false});
    this.searchGutenberg(query).then(res=>{this.setState({gutenLoading:false,gutenResults:res});if(!res.length)this.feedLine('warn','No books found for “'+query+'”.');});
  }
  // Read a chosen book FULLY (fetch → strip → parse) before it becomes a source.
  // Until the parse completes the book is "reading…" and cannot be chatted with.
  async readGutenberg(book){
    if(this.state.gutenReading)return;
    this.setState({gutenReading:book.id});
    this.feedSep('Project Gutenberg');this.feedLine('read','Fetching “'+book.title+'”…');
    let text;
    try{const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent(book.txtUrl));if(!r.ok)throw new Error('HTTP '+r.status);text=await r.text();}
    catch(e){this.feedLine('warn','Could not fetch the book — '+(e&&e.message||e));this.setState({gutenReading:null});return;}
    const meta=this.bookMeta(book,text);                   // read title/author/date from the raw header
    text=this.stripGutenberg(text);
    if(text.length<200){this.feedLine('warn','That edition had too little readable text.');this.setState({gutenReading:null});return;}
    this.feedLine('read','Reading “'+book.title+'” fully — '+Math.round(text.length/1000)+'k chars…');
    await this.sleep(20);                                  // let the feed paint before the synchronous parse
    const r=await this.importText(text,book.title,meta);
    this.setState({gutenReading:null,gutenResults:null,gutenQuery:''});
    if(r)this.feedLine('done','Read fully · '+(r.propCount!=null?r.propCount:r.sentenceCount)+' propositions — ready to chat');
  }
  async ingest(url,title,text,via,image,parent,wikiLinks,meta,onProgress){
    // A long text (a whole book) folds in SLOWLY: given a progress sink the parser yields between
    // chunks and reports how far it has read, so the tab stays alive and the reader narrates as it
    // goes. Short texts keep the one-shot synchronous parse. An engine predating the chunked parser
    // ignores onProgress and parses in a single pass — still correct, just not incremental.
    const doc=(onProgress&&String(text||'').length>40000)
      ? await this.E.parseText(text,{coordSubjects:true,chunkSize:250,onProgress})
      : this.E.parseText(text,{coordSubjects:true});
    const propCount=this.countPropositions(doc.sentences);
    // Keep the raw text on the page so an imported book can be re-rendered as a
    // readable book in the center (see _bookHtml / loadCenter's text: branch).
    const page={url,title,text:String(text||''),events:doc.log.snapshot(),sentences:doc.sentences,propCount,ts:Date.now(),via:via||'read',_doc:doc,svo:0,image:image||null,parent:parent||null,wikiLinks:wikiLinks||null,
      author:(meta&&meta.author)||null,authorDates:(meta&&meta.authorDates)||null,published:(meta&&meta.published)||null,
      // How the source was READ, and — for audio/video — a playable handle plus the transcription
      // organ's own record: its witness readings and the contested spans, so a media source can be
      // played back with the transcript aligned and its non-objective readings audited.
      modality:(meta&&meta.modality)||'text',
      media:(meta&&meta.media)||null,mediaKind:(meta&&meta.mediaKind)||(meta&&meta.isVideo?'video':null),
      _organ:(meta&&meta.doc)||null,audit:(meta&&meta.doc&&meta.doc.audit)||null};
    const pages=[...this.state.pages,page];this.rebuild(pages);
    this.setState(s=>({pages,rev:s.rev+1,selId:s.selId||this.topEntity()}));
    // Second reader: fold the LLM's SVO reading onto the same log, then re-project.
    if(this.state.llm && this.state.llmAvail && this.SVO) this.runSVO(page);
    return {title,sentenceCount:doc.sentences.length,propCount,url};
  }
  // PROPOSITIONS, not sentences. A proposition is a clause — a single predication —
  // and the SVO reader already decomposes every sentence into clauses (the unit it
  // bonds over). So the count the reader shows is the clause total: at least one per
  // sentence, more wherever a sentence coordinates or subordinates ("he woke, and he
  // crawled" is two). Falls back to the sentence count if the engine predates the
  // clause segmenter export.
  countPropositions(sentences){
    const sents=sentences||[];
    const seg=this.E&&this.E.segmentClauses;
    if(!seg)return sents.length;
    let n=0;for(const s of sents)n+=Math.max(1,seg(s).length);
    return n;
  }
  // A researched page is RELEVANT only if it actually shares a specific referent with
  // the focal entity's PRE-research context (proper-noun set captured before reading).
  // A page about a different "DMC" (Devil May Cry) shares none → it gets set aside.
  pageRelevant(url,proper){
    if(!proper||proper.size<4)return true;                 // too sparse to judge — keep
    const idxs=[];for(let i=0;i<this.master.sentences.length;i++)if(this.master.sentenceSource[i]===url)idxs.push(i);
    if(!idxs.length)return true;
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    const words=new Set();idxs.forEach(i=>this.master.sentences[i].toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{if(w)words.add(stem(w));}));
    let hits=0;proper.forEach(t=>{if(words.has(t))hits++;});
    return hits>=1;
  }
  // Drop a page from the record entirely and re-project — undoes its fold (including any
  // by-label entity merges it caused), as if it had never been read.
  tossPage(url){const pages=this.state.pages.filter(p=>p.url!==url);this.rebuild(pages);this.setState(s=>({pages,rev:s.rev+1}));}
  async runSVO(page){
    if(!page||!page._doc||!this.SVO)return;
    const run=++this._svoRun; const sents=page._doc.sentences;
    let triples=[];
    try{
      triples=await this.SVO.extractSVO(sents,{ claude:window.claude, batchSize:8, maxSentences:56,
        isCancelled:()=>this._svoRun!==run });
    }catch(e){ return; } // silent: the regex reading + grain embedding already stand
    if(this._svoRun!==run){return;} // a newer read superseded this pass
    let res={edges:0};
    try{ res=this.SVO.foldSVO({doc:page._doc,triples}); }catch(e){ return; }
    if(!res.edges){return;}
    page.events=page._doc.log.snapshot(); page.svo=res.edges;
    this.rebuild(this.state.pages);
    this.setState(s=>({rev:s.rev+1}));
  }
  // grain of an edge (Ground · Figure · Pattern) — the proposition embedding tested
  // against the three bands. Read from the argspan cut when present (verb already
  // separated), else from the two endpoint labels. Cached per projection rev.
  edgeGrain(e){
    if(!this.SVO||!this.SVO.grainOfBond)return null;
    if(!this._grainCache||this._grainCacheRev!==this.state.rev){this._grainCache=new Map();this._grainCacheRev=this.state.rev;}
    const key=(e.from||'')+'|'+(e.to||'')+'|'+(e.via||'')+'|'+(e.seq||0);
    if(this._grainCache.has(key))return this._grainCache.get(key);
    let subject=this.labelOf(e.from),object=this.labelOf(e.to);
    const ev=(e.seq!=null&&this.master&&this.master.events[e.seq])||null;
    if(ev&&ev.argspan!=null&&this.master.events[ev.argspan]){const sp=this.master.events[ev.argspan];if(sp.subject&&sp.subject.text)subject=sp.subject.text;if(sp.object&&sp.object.text)object=sp.object.text;}
    const g=this.SVO.grainOfBond({subject,object}).grain;
    this._grainCache.set(key,g);
    return g;
  }
  edgeReader(e){const ev=(e.seq!=null&&this.master&&this.master.events[e.seq])||null;return ev&&ev.reader||'svo-regex';}

  // ── extracted propositions: the SVO triples on the edges, not the source
  // sentences. Reads the argspan cut (subject/verb/object spans) when the reader
  // separated them, else falls back to the bond's endpoints + verb (via).
  edgeTriple(e){
    const ev=(e.seq!=null&&this.master&&this.master.events[e.seq])||null;
    const sp=(ev&&ev.argspan!=null&&this.master.events[ev.argspan])||null;
    const subject=(sp&&sp.subject&&sp.subject.text)?this.norm(sp.subject.text):this.labelOf(e.from);
    const object=(sp&&sp.object&&sp.object.text)?this.norm(sp.object.text):this.labelOf(e.to);
    const verb=(sp&&sp.verb&&sp.verb.text)?this.norm(sp.verb.text):(e.via||e.relType||e.kind||'—');
    const reader=(ev&&ev.reader)||(sp&&sp.reader)||'svo-regex';
    const grain=e.grain||(ev&&ev.grain)||this.edgeGrain(e)||'Figure';
    const conf=(ev&&ev.confidence!=null)?ev.confidence:(e.confidence!=null?e.confidence:0.6);
    const neg=(p=>p==='−'||p==='-'||p==='negative')((ev&&ev.polarity)||e.polarity);
    const irr=(((ev&&ev.modality)||e.modality)==='irrealis');
    const speech=((ev&&ev.op==='SIG')||e.op==='SIG'||e.kind==='SIG');
    const u=e.sentIdx!=null?this.master.sentenceSource[e.sentIdx]:null;
    const t={s:subject,v:verb,o:object,grain,reader,conf:Math.round(conf*100)/100};
    if(neg)t.neg=true;if(irr)t.irr=true;if(speech)t.speech=true;
    if(u)t.src=this.srcId(u);if(e.sentIdx!=null)t.sent=e.sentIdx;
    t.rel=this.eotRel(verb,neg);            // canonical EOT relation token (hyphenated, not- for negation)
    t.eot=this.eotSurface(t);               // the proposition in EOT LINK surface — never the flat arrow
    return t;
  }
  // The EOT relation token (docs/eot-surface-syntax.md §5.3): the verb, hyphenated so it
  // reads as one label, with the spec's `not-` carrying negation. Mirrors perceiver/surfaces.plainRel.
  eotRel(verb,neg){const v=String(verb||'').trim().replace(/[.!?]+$/,'').replace(/\s+/g,'-')||'linked-to';return (neg?'not-':'')+v;}
  // A proposition in EOT surface (docs/eot-surface-syntax.md): a relation is a LINK
  // `SUBJECT -> OBJECT : relation`, never the retired flat-arrow notation.
  eotSurface(t){return `${t.s} -> ${t.o} : ${t.rel!=null?t.rel:this.eotRel(t.v,t.neg)}`;}
  entityTriples(id){
    const subj=[],obj=[],seen=new Set();
    for(const e of this.edgesOf(id)){
      if(e.from===e.to)continue;
      if(this.isURLish(this.labelOf(e.from))||this.isURLish(this.labelOf(e.to)))continue;
      const t=this.edgeTriple(e),k=t.s+'|'+t.v+'|'+t.o+'|'+(t.sent==null?'':t.sent);
      if(seen.has(k))continue;seen.add(k);
      (e.from===id?subj:obj).push(t);
    }
    return {subj,obj};
  }

  labelOf(id){const e=this.graph.entities.get(id);if(e&&e.label)return e.label;return (this._refLabel&&this._refLabel.get(id))||id;}
  conceptual(label){
    const raw=this.norm(label);if(!raw)return false;
    const l=raw.toLowerCase().replace(/[.,;:'"()\u2019\u2018\u201c\u201d]/g,'').trim();
    if(!l)return false;
    if(l.replace(/[^a-z]/gi,'').length<2)return false;          // no real letters
    if(/^[\d\s.,:/\u2013\u2014-]+$/.test(l))return false;        // pure number / year / date
    const words=l.split(/\s+/);
    const temporal=w=>this.MONTHS.has(w)||this.DOW.has(w)||this.TEMPORAL.has(w)||/^\d{1,4}(st|nd|rd|th)?s?$/.test(w)||/^(19|20)\d{2}$/.test(w);
    if(words.every(temporal))return false;                       // "march", "25 march 2022", "last week"
    if(words.length===1&&this.STOP.has(l))return false;          // lone stopword
    return true;
  }
  showable(id){const l=this.labelOf(id);return !this.isURLish(l)&&this.conceptual(l)&&!this.strayCapital(id);}
  // A generic concept ("tourism", "runoff") means something specific ON THIS PAGE. Its
  // qualifier is the page's dominant PROPER-NOUN subject (Great Barrier Reef), which we
  // surface in the title — while the bare concept stays reachable via its Wikipedia link.
  isGenericConcept(id){const cap=this.capIndex();const toks=(this.labelOf(id)||'').toLowerCase().split(/\s+/).filter(Boolean);return toks.length>0&&toks.every(w=>cap.lower.has(w))&&toks.some(w=>w.length>=4);}
  contextAnchor(id,vu){
    // Prefer the page's SUBJECT — the entity whose name the page title carries (the
    // article is ABOUT the Great Barrier Reef, so that's the context, not Queensland).
    const p=vu?this.pageOf(vu):null;
    if(p&&p.title){const tl=p.title.toLowerCase();let best=null,bl=0;
      for(const e of this.graph.entities.values()){
        if(e.id===id||!this.showable(e.id))continue;
        const l=this.labelOf(e.id);if(!l||l.length<4)continue;
        if(tl.indexOf(l.toLowerCase())>=0&&l.length>bl){bl=l.length;best=e.id;}
      }
      if(best)return best;
    }
    // Fallback: the dominant proper-noun entity actually mentioned on this page.
    const cap=this.capIndex();let best=null,bw=-1;
    for(const e of this.graph.entities.values()){
      if(e.id===id||!this.showable(e.id))continue;
      const toks=(this.labelOf(e.id)||'').toLowerCase().split(/\s+/).filter(Boolean);
      if(!toks.length||toks.every(w=>cap.lower.has(w)))continue;          // skip other generic concepts
      if(vu&&!this.mentionsOf(e.id).some(i=>this.master.sentenceSource[i]===vu))continue;
      const w=this.weightOf(e);if(w>bw){bw=w;best=e.id;}
    }
    return best;
  }
  // A stray sentence-initial capital is the ambiguous part of speech the reading must
  // drop: "Soft" out of "Soft coral atlas of the Great Barrier Reef." The regex
  // admission can't tell it from a name, so we test it the way the embedding pass does
  // — a single token whose capital is POSITIONAL (it only ever opens a sentence) and
  // which also lives in the corpus as a lowercase common word is an adjective, not an
  // entity. Real names ("Thornbank", "Vela") appear mid-sentence or never lowercase.
  capIndex(){
    if(this._capIdx&&this._capIdxRev===this.state.rev)return this._capIdx;
    const lower=new Set(),capMid=new Set();
    const sents=(this.master&&this.master.sentences)||[];
    for(const s of sents){
      const toks=String(s).split(/\s+/); let pos=0;
      for(const raw of toks){
        const w=raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g,''); if(!w){pos++;continue;}
        if(/^[a-z][a-z]+$/.test(w))lower.add(w);
        else if(/^[A-Z][a-z]+$/.test(w)&&pos>0)capMid.add(w);
        pos++;
      }
    }
    this._capIdx={lower,capMid};this._capIdxRev=this.state.rev;return this._capIdx;
  }
  strayCapital(id){
    const lab=this.labelOf(id); if(!lab||/\s/.test(lab))return false;            // multiword names stand
    const w=lab.replace(/[^A-Za-z]/g,''); if(!w||!/^[A-Z][a-z]+$/.test(w))return false;
    const {lower,capMid}=this.capIndex();
    if(capMid.has(w))return false;                                              // seen capitalized mid-sentence → a real name
    const lw=w.toLowerCase();
    return lower.has(lw)||this.COMMON_OPENER.has(lw);                            // positional capital of a common word → drop
  }
  weightOf(e){return e?(Math.log(1+(e.sightings||1))+(this.incident.get(e.id)||0)):0;}
  edgesOf(id){return this.graph.edges.filter(e=>(e.from===id||e.to===id)&&e.from!==e.to);}
  mentionsOf(id){const s=new Set();for(const e of this.master.events){if(e.sentIdx==null)continue;const ids=[e.id,e.src,e.tgt,e.from,e.to].filter(Boolean).map(x=>this.graph.representative(x));if(ids.includes(id))s.add(e.sentIdx);}return [...s].sort((a,b)=>a-b);}
  aliasesOf(id){const s=new Set();for(const ev of this.master.events){if(ev.op==='INS'&&ev.id&&ev.label&&this.graph.representative(ev.id)===id)s.add(ev.label);}const e=this.graph.entities.get(id);if(e&&e.label)s.add(e.label);return [...s].filter(a=>!this.isURLish(a));}
  // A true alias is another SURFACE FORM of the same referent — not a distinct entity
  // that merely shares a token. "Nashville Downtown Partnership" is not an alias of
  // "Nashville"; it is a connected entity. Admit only: identical normalized strings,
  // same content-words reordered, or an acronym↔expansion pair.
  trueAlias(lab,a){
    const clean=s=>this.norm(s).toLowerCase().replace(/[.\-'’"()]/g,'');
    const nl=clean(lab).replace(/\s+/g,''),na=clean(a).replace(/\s+/g,'');
    if(!na)return false; if(na===nl)return true;
    const toks=s=>clean(s).split(/\s+/).filter(w=>w&&!this.STOP.has(w));
    const sl=new Set(toks(lab)),sa=new Set(toks(a));
    if(sl.size&&sl.size===sa.size&&[...sl].every(w=>sa.has(w)))return true;
    const initials=s=>this.norm(s).split(/\s+/).filter(w=>/[A-Za-z]/.test(w)).map(w=>w[0].toLowerCase()).join('');
    if(na===initials(lab)||nl===initials(a))return true;
    return false;
  }
  truncLabel(s,n){s=this.norm(s);return s.length>n?s.slice(0,n-1)+'…':s;}
  // The node's neighborhood as a graph: center = the entity, ring = real neighbors
  // (clickable, edge colored by grain) plus co-referent surface forms the merge folded
  // in (dashed facet nodes). This is what 'connections' should be — not alias chips.
  egoGraph(sel,nbrs,facets){
    const h=React.createElement;
    const W=900,H=500,cx=W/2,cy=H/2+2;
    const lab=this.labelOf(sel),hov=this.state.hoverEnt;
    const GRAINC={Ground:'#2f6f9e',Figure:'#b06f2a',Pattern:'#2f7d54'};
    const real=nbrs.filter(n=>n&&n.id!=null).slice(0,12).map(n=>({label:this.labelOf(n.id),id:n.id,
      rel:(n.vias&&n.vias.find(v=>v&&v.length<22))||(n.vias&&n.vias[0])||'related',
      w:Math.max(0.001,n.w||1),grain:n.grain||'Figure',llm:!!n.llm,real:true}));
    const fac=(facets||[]).slice(0,5).map(f=>({label:f,id:null,rel:'also called',w:0.3,grain:null,real:false}));
    const N=Math.max(real.length,1);
    const wmax=Math.max.apply(null,real.map(n=>n.w).concat([1]));
    const rx=Math.min(330,210+N*9), ry=Math.min(182,132+N*5);
    real.forEach((nd,i)=>{const ang=-Math.PI/2+i*(2*Math.PI/N);
      nd._ca=Math.cos(ang);nd._sa=Math.sin(ang);nd._x=cx+nd._ca*rx;nd._y=cy+nd._sa*ry;
      nd._r=Math.max(17,Math.min(31,16+Math.sqrt(nd.w/wmax)*15));});
    fac.forEach((nd,i)=>{const ang=-Math.PI/2+(i+0.5)*(2*Math.PI/Math.max(fac.length,1));
      nd._ca=Math.cos(ang);nd._sa=Math.sin(ang);nd._x=cx+nd._ca*120;nd._y=cy+nd._sa*92;nd._r=12;});
    const ring=[...real,...fac];
    const anyHover=ring.some(n=>n.real&&n.id===hov);
    const cc=this.hashColor(lab);
    const layers=[];
    // soft backdrop guide rings
    layers.push(h('ellipse',{key:'g1',cx,cy,rx,ry,fill:'none',stroke:'#ecebe6',strokeWidth:1}));
    layers.push(h('ellipse',{key:'g2',cx,cy,rx:rx*0.6,ry:ry*0.6,fill:'none',stroke:'#f2f1ec',strokeWidth:1}));
    // curved edges (under nodes)
    ring.forEach((nd,i)=>{const on=nd.real&&nd.id===hov,faded=anyHover&&!on;
      const gc=nd.real?(GRAINC[nd.grain]||GRAINC.Figure):'#c7bca4';
      const dx=nd._x-cx,dy=nd._y-cy,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
      const sx=cx+ux*41,sy=cy+uy*41,ex=nd._x-ux*nd._r,ey=nd._y-uy*nd._r;
      const mx=(sx+ex)/2,my=(sy+ey)/2,off=nd.real?13:7;
      layers.push(h('path',{key:'e'+i,d:'M '+sx+' '+sy+' Q '+(mx-uy*off)+' '+(my+ux*off)+' '+ex+' '+ey,fill:'none',
        stroke:on?'#8a531e':gc,strokeLinecap:'round',
        strokeWidth:on?3.4:(nd.real?1.2+(nd.w/wmax)*2.6:1),
        strokeDasharray:nd.real?'none':'2 5',opacity:faded?0.1:(nd.real?0.5:0.42)}));});
    // nodes + outward labels with white halo for legibility
    ring.forEach((nd,i)=>{const on=nd.real&&nd.id===hov,faded=anyHover&&!on,c=nd.real?this.hashColor(nd.label):'#b3a585';
      const side=nd._ca>0.34?1:(nd._ca<-0.34?-1:0);
      let lx,ly,anchor;
      if(side===1){lx=nd._x+nd._r+10;ly=nd._y;anchor='start';}
      else if(side===-1){lx=nd._x-nd._r-10;ly=nd._y;anchor='end';}
      else {anchor='middle';lx=nd._x;ly=nd._sa>0?nd._y+nd._r+16:nd._y-nd._r-21;}
      const name=this.truncLabel(nd.label,20),rel=nd.real?this.truncLabel(nd.rel,22):'also called';
      const tw=Math.max(name.length,rel.length)*5.9+14,hx=anchor==='start'?lx-6:anchor==='end'?lx-tw+6:lx-tw/2;
      const els=[];
      if(on)els.push(h('circle',{key:'h',cx:nd._x,cy:nd._y,r:nd._r+6,fill:'none',stroke:c,strokeWidth:1.5,opacity:0.4}));
      els.push(h('circle',{key:'cf',cx:nd._x,cy:nd._y,r:nd._r,fill:nd.real?c:'#fbfaf7',opacity:nd.real?0.12:1}));
      els.push(h('circle',{key:'c',cx:nd._x,cy:nd._y,r:nd._r,fill:'none',stroke:nd.real?c:'#beb091',strokeWidth:on?3:(nd.real?2:1.2),strokeDasharray:nd.real?'none':'3 3'}));
      els.push(h('text',{key:'in',x:nd._x,y:nd._y+4,textAnchor:'middle',style:{fontSize:(nd.real?12:10)+'px',fontWeight:'700',fill:nd.real?c:'#9aa1ab',pointerEvents:'none'}},this.initials(nd.label)));
      els.push(h('rect',{key:'lh',x:hx,y:ly-12,width:tw,height:nd.real?30:17,rx:6,fill:'#fff',opacity:faded?0:0.8}));
      els.push(h('text',{key:'ln',x:lx,y:ly,textAnchor:anchor,style:{fontSize:'11.5px',fontWeight:on?'700':'600',fill:nd.real?'#23262b':'#8a8267',pointerEvents:'none'}},name));
      els.push(h('text',{key:'lr',x:lx,y:ly+13,textAnchor:anchor,style:{fontSize:'9.5px',fontStyle:nd.real?'normal':'italic',fill:nd.real?(GRAINC[nd.grain]||'#9aa1ab'):'#9aa1ab',pointerEvents:'none'}},rel));
      layers.push(h('g',{key:'n'+i,style:{cursor:nd.real?'pointer':'default',opacity:faded?0.3:1,transition:'opacity .15s ease'},
        onClick:nd.real?(()=>this.clickEntity(nd.id)):null,
        onMouseEnter:nd.real?(ev=>this.entHover(nd.id,ev)):null,
        onMouseLeave:nd.real?(()=>this.entLeave()):null},els));});
    // center entity on top
    const nm=this.truncLabel(lab,28),nmw=nm.length*7.2+20;
    layers.push(h('g',{key:'center'},[
      h('circle',{key:'cg',cx,cy,r:49,fill:cc,opacity:0.06}),
      h('circle',{key:'crf',cx,cy,r:40,fill:cc,opacity:0.12}),
      h('circle',{key:'cr',cx,cy,r:40,fill:'none',stroke:cc,strokeWidth:2.6}),
      h('text',{key:'ci',x:cx,y:cy+6,textAnchor:'middle',style:{fontSize:'17px',fontWeight:'800',fill:cc,pointerEvents:'none'}},this.initials(lab)),
      h('rect',{key:'cp',x:cx-nmw/2,y:cy+49,width:nmw,height:24,rx:12,fill:cc,opacity:0.1}),
      h('text',{key:'cn',x:cx,y:cy+65,textAnchor:'middle',style:{fontSize:'13px',fontWeight:'700',fill:cc,pointerEvents:'none'}},nm)
    ]));
    // grain legend
    const leg=[['Ground',GRAINC.Ground],['Figure',GRAINC.Figure],['Pattern',GRAINC.Pattern]];
    layers.push(h('g',{key:'legend'},leg.reduce((acc,[t,col],i)=>{const yy=22+i*17;
      acc.push(h('circle',{key:'ld'+i,cx:13,cy:yy-3,r:4,fill:col}));
      acc.push(h('text',{key:'lt'+i,x:23,y:yy,style:{fontSize:'10px',fontWeight:'600',fill:'#7a8089'}},t));return acc;},[])));
    return h('svg',{viewBox:'0 0 '+W+' '+H,preserveAspectRatio:'xMidYMid meet',style:{display:'block',width:'100%',height:'auto',maxHeight:'54vh'}},layers);
  }
  // Compact neighbourhood "web" for the side panel — same grammar as egoGraph
  // (grain-coloured edges, dashed=facet, click to pivot) but tuned for ~300px.
  egoGraphMini(sel,nbrs){
    const h=React.createElement;
    const W=300,H=232,cx=W/2,cy=H/2;
    const lab=this.labelOf(sel),hov=this.state.hoverEnt;
    const GRAINC={Ground:'#2f6f9e',Figure:'#b06f2a',Pattern:'#2f7d54'};
    const all=(nbrs||[]).filter(n=>n&&n.id!=null&&!this.isURLish(this.labelOf(n.id)));
    const MAXN=9, extra=Math.max(0,all.length-MAXN);
    const real=all.slice(0,MAXN)
      .map(n=>({label:this.labelOf(n.id),id:n.id,w:Math.max(0.001,n.w||1),grain:n.grain||'Figure'}));
    if(!real.length)return null;
    const N=real.length, wmax=Math.max.apply(null,real.map(n=>n.w).concat([1]));
    // Ring radii grow with crowding so neighbours never collide, capped to keep the
    // centre legible. Labels are free to spill past the ring — the viewBox is grown
    // at the end to wrap every node and label, so nothing ever clips the card edge.
    const rx=Math.min(120,76+N*6), ry=Math.min(94,54+N*6);
    real.forEach((nd,i)=>{const ang=-Math.PI/2+i*(2*Math.PI/N);
      nd._ca=Math.cos(ang);nd._sa=Math.sin(ang);nd._x=cx+nd._ca*rx;nd._y=cy+nd._sa*ry;
      nd._r=Math.max(13,Math.min(21,12+Math.sqrt(nd.w/wmax)*9));});
    const anyHover=real.some(n=>n.id===hov), cc=this.hashColor(lab), layers=[];
    // Track content bounds as we draw, then fit the viewBox around them.
    let minX=cx-rx,maxX=cx+rx,minY=cy-ry,maxY=cy+ry;
    const fit=(x0,y0,x1,y1)=>{if(x0<minX)minX=x0;if(x1>maxX)maxX=x1;if(y0<minY)minY=y0;if(y1>maxY)maxY=y1;};
    layers.push(h('ellipse',{key:'g1',cx,cy,rx,ry,fill:'none',stroke:'#ecebe6',strokeWidth:1}));
    // Edges: grain-coloured, width by bond strength, curvature alternating per spoke
    // so a dense fan reads as separate arcs instead of one smudge.
    real.forEach((nd,i)=>{const on=nd.id===hov,faded=anyHover&&!on,gc=GRAINC[nd.grain]||GRAINC.Figure;
      const dx=nd._x-cx,dy=nd._y-cy,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
      const sx=cx+ux*28,sy=cy+uy*28,ex=nd._x-ux*nd._r,ey=nd._y-uy*nd._r;
      const mx=(sx+ex)/2,my=(sy+ey)/2,off=(i%2?9:-9);
      layers.push(h('path',{key:'e'+i,d:'M '+sx+' '+sy+' Q '+(mx-uy*off)+' '+(my+ux*off)+' '+ex+' '+ey,fill:'none',
        stroke:on?'#8a531e':gc,strokeLinecap:'round',strokeWidth:on?2.6:(1+(nd.w/wmax)*1.8),opacity:faded?0.12:0.5}));});
    real.forEach((nd,i)=>{const on=nd.id===hov,faded=anyHover&&!on,c=this.hashColor(nd.label);
      const side=nd._ca>0.3?1:(nd._ca<-0.3?-1:0);let lx,ly,anchor;
      if(side===1){lx=nd._x+nd._r+5;ly=nd._y+3;anchor='start';}
      else if(side===-1){lx=nd._x-nd._r-5;ly=nd._y+3;anchor='end';}
      else{anchor='middle';lx=nd._x;ly=nd._sa>0?nd._y+nd._r+11:nd._y-nd._r-6;}
      const name=this.truncLabel(nd.label,16),tw=name.length*5.3+8;
      const hx=anchor==='start'?lx-4:anchor==='end'?lx-tw+4:lx-tw/2;
      fit(nd._x-nd._r,nd._y-nd._r,nd._x+nd._r,nd._y+nd._r);
      fit(hx,ly-9,hx+tw,ly+4);
      const els=[];
      if(on)els.push(h('circle',{key:'h',cx:nd._x,cy:nd._y,r:nd._r+4,fill:'none',stroke:c,strokeWidth:1.4,opacity:0.4}));
      els.push(h('circle',{key:'cf',cx:nd._x,cy:nd._y,r:nd._r,fill:c,opacity:0.12}));
      els.push(h('circle',{key:'c',cx:nd._x,cy:nd._y,r:nd._r,fill:'none',stroke:c,strokeWidth:on?2.4:1.6}));
      els.push(h('text',{key:'in',x:nd._x,y:nd._y+3.5,textAnchor:'middle',style:{fontSize:'10px',fontWeight:'700',fill:c,pointerEvents:'none'}},this.initials(nd.label)));
      els.push(h('rect',{key:'lh',x:hx,y:ly-9,width:tw,height:13,rx:4,fill:'#fff',opacity:faded?0:0.82}));
      els.push(h('text',{key:'ln',x:lx,y:ly,textAnchor:anchor,style:{fontSize:'9.5px',fontWeight:on?'700':'600',fill:'#33373d',pointerEvents:'none'}},name));
      layers.push(h('g',{key:'n'+i,style:{cursor:'pointer',opacity:faded?0.32:1,transition:'opacity .15s ease'},
        onClick:()=>this.clickEntity(nd.id),onMouseEnter:(ev)=>this.panelNodeHover(nd.id,ev),onMouseLeave:()=>this.panelNodeLeave()},els));});
    layers.push(h('g',{key:'center'},[
      h('circle',{key:'cf',cx,cy,r:27,fill:cc,opacity:0.1}),
      h('circle',{key:'cr',cx,cy,r:27,fill:'none',stroke:cc,strokeWidth:2.2}),
      h('text',{key:'ci',x:cx,y:cy+5,textAnchor:'middle',style:{fontSize:'13px',fontWeight:'800',fill:cc,pointerEvents:'none'}},this.initials(lab))
    ]));
    // The ring is capped at MAXN; the remainder lives in the full explorer below.
    if(extra>0){layers.push(h('text',{key:'more',x:cx,y:maxY+13,textAnchor:'middle',
      style:{fontSize:'9px',fontWeight:'700',fill:'#9aa1ab',letterSpacing:'.03em',pointerEvents:'none'}},'+'+extra+' more'));maxY+=16;}
    // Grow the viewBox to wrap all content with a small margin, so rim labels never
    // clip no matter how long they are. Handlers read this._gvb to stay consistent.
    const pad=8,vbx=minX-pad,vby=minY-pad,vbw=(maxX-minX)+pad*2,vbh=(maxY-minY)+pad*2;
    this._gvb={x:vbx,y:vby,w:vbw,h:vbh};
    const gz=this.state.gz||{k:1,x:0,y:0};
    const stage=h('g',{key:'stage',transform:'translate('+gz.x+' '+gz.y+') scale('+gz.k+')'},layers);
    return h('svg',{viewBox:vbx+' '+vby+' '+vbw+' '+vbh,preserveAspectRatio:'xMidYMid meet',
      onPointerDown:e=>this.gzDown(e),
      ref:el=>{if(el&&!el.__wb){el.__wb=true;el.addEventListener('wheel',this._gzWheel,{passive:false});}},
      style:{display:'block',width:'100%',height:'auto',cursor:this._gzDrag?'grabbing':'grab',touchAction:'none'}},[stage]);
  }
  setLens(l){this.setState({panelLens:l});}
  panelNodeHover(id,ev){clearTimeout(this._pivotT);this._hovEnt=id;const st={hoverEnt:id,hoverHref:null,hoverAhead:null};const x=(ev&&ev.clientX!=null)?ev.clientX:null,y=(ev&&ev.clientY!=null)?ev.clientY:null;if(x!=null)st.hoverXY={x,y};this.setState(st);if(x!=null)this._startCardWatch(x,y);}
  panelNodeLeave(){this._stopCardWatch();this._hovEnt=null;this.setState({hoverEnt:null});}
  // The short take a reading reads INTO the entity — the predicate it lays over it.
  _readingLabel(id,i){
    const lab=this.labelOf(id),s=this.clean(this.master.sentences[i]);
    let pred=s;const at=s.toLowerCase().indexOf(lab.toLowerCase());
    if(at>=0){pred=s.slice(at+lab.length).replace(/^[\s,;:\u2014\-]+/,'');
      pred=pred.replace(/^(is|are|was|were|has|have|had|been|became?|becomes?|remains?|serves?(?:\sas)?|acts?\sas|represents?|provides?|forms?|constitutes?|comprises?|contains?|includes?)\s+/i,'');}
    pred=pred.replace(/^(a|an|the|one|its|their|this|that)\s+/i,'');
    const w=this.norm(pred).split(/\s+/).slice(0,6).join(' ').replace(/[,.;:\u2014-]+$/,'');
    return this.truncLabel(w||this.norm(s),28);
  }
  // ── in-article attribution: WHO, inside a source, is making this claim ─────────
  // Not the publisher (en.wikipedia.org) but the cited voice — "CNN labelled it…",
  // "according to UNESCO", "the Queensland National Trust named it…". Heuristic, but
  // the user needs to see who is actually being quoted, not just where it was read.
  _sayer(text,self){
    const s=this.norm(text||''); if(!s||s.length<12)return null;
    // SAYING verbs only — active attribution. Descriptive/passive-prone verbs (found,
    // predicted, attributed, listed…) are deliberately excluded: "X is predicted to…"
    // is the entity being described, not a source speaking.
    const SAY='said|says|stated|states|reported|reports|noted|notes|argued|argues|claimed|claims|wrote|writes|added|explained|explains|warned|warns|confirmed|announced|announces|told|testified|insists|insisted|contends|contended|maintains|maintained|acknowledged|suggested|suggests|concluded|asserts|asserted|labelled|labeled|labels|named|names|called|calls|credited|describes|described|recalled';
    const BE=/\b(is|are|was|were|be|been|being|has|have|had|gets?|got|becomes?|became)$/i;
    let m;
    m=s.match(/\b[Aa]ccording to\s+((?:[Tt]he\s|[Aa]\s|[Aa]n\s)?[A-Z][\w.'’&-]*(?:\s+(?:of\s|the\s|for\s|at\s|and\s|de\s|van\s|von\s)?[A-Z0-9][\w.'’&-]*){0,5})/);
    if(m){const r=this._trimSayer(m[1],self); if(r)return r;}
    m=s.match(new RegExp('\\b([A-Z][\\w.\'’&-]*(?:\\s+[A-Z][\\w.\'’&-]*){0,5})\\s+who\\s+(?:'+SAY+')\\b'));
    if(m){const r=this._trimSayer(m[1],self); if(r)return r;}
    m=s.match(new RegExp('(?:^|[.;:\\u2014]\\s|,\\s|\\bthat\\s)([A-Z][\\w.\'’&-]*(?:\\s+[A-Za-z.\'’&-]+){0,5}?)\\s+(?:'+SAY+')\\b'));
    if(m&&!BE.test(m[1])){const r=this._trimSayer(m[1],self); if(r)return r;}
    m=s.match(/[,”"\u201d]\s*(?:said|wrote|noted|added|told|reported|argued|according to)\s+((?:[Tt]he\s)?[A-Z][\w.'’&-]*(?:\s+[A-Z][\w.'’&-]*){0,4})/);
    if(m){const r=this._trimSayer(m[1],self); if(r)return r;}
    return null;
  }
  _trimSayer(x,self){if(!x)return null;x=this.norm(x).replace(/^(the|a|an)\s+/i,'').replace(/[,.;:]+$/,'').trim();
    let w=x.split(/\s+/); if(w.length>6){x=w.slice(0,6).join(' ');w=x.split(/\s+/);}
    const low=x.toLowerCase();
    if(self&&low===String(self).toLowerCase())return null;
    if(/^(other|this|these|those|their|its|it|such|many|most|some|several|each|both|one|another|every|all|no|any)\b/i.test(x))return null;
    if(w.length===1&&this.STOP&&this.STOP.has(low))return null;
    if(!/[A-Za-z]/.test(x)||/^(it|this|that|these|those|they|he|she|we|i)$/i.test(x))return null;
    return (x.length>=2&&x.length<=46)?x:null;}
  _refLike(s){return /(archived from|retrieved\b|\bdoi:|\bisbn\b|wayback|\boriginal (on|pdf)|\bpp?\.\s*\d|\bvol\.\s*\d|cite (web|journal|news|book)|\.pdf\b)/i.test(String(s||''));}
  // Candidate readings — what the record says ABOUT the entity (subject-role, defined,
  // and evaluative lines). Each carries a base amplitude: its characterizing force.
  _readingCandidates(id){
    const lab=this.labelOf(id),ll=lab.toLowerCase(),esc=ll.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pool=new Set();
    this.subjectSentences(id).forEach(i=>pool.add(i));
    (this.master.events||[]).filter(ev=>ev.op==='DEF'&&ev.key==='predicate'&&ev.sentIdx!=null&&this.graph.representative(ev.id)===id).forEach(ev=>pool.add(ev.sentIdx));
    this.mentionsOf(id).filter(i=>this.bandOf(i)==='eva').forEach(i=>pool.add(i));
    const amp=i=>{const s=this.clean(this.master.sentences[i]),low=s.toLowerCase();let v=0.6;
      const at=low.indexOf(ll);if(at>=0&&at<30)v+=0.8;
      if(new RegExp('\\b'+esc+'\\b\\s+(is|are|was|were)\\b').test(low))v+=0.9;
      if(this.bandOf(i)==='eva')v+=0.6; else if(this.bandOf(i)==='def')v+=0.4;
      v+=Math.min(0.8,s.length/240); if(s.length>240)v-=0.6; return Math.max(0.15,v);};
    return [...pool].filter(i=>{const s=this.clean(this.master.sentences[i]);return s&&s.length>=28&&this._proseOk(s)&&!this._refLike(s);})
      .map(i=>({i,s:this.clean(this.master.sentences[i]),a:amp(i),src:this.master.sentenceSource[i],band:this.bandOf(i)}));
  }
  // Symmetric eigendecomposition (cyclic Jacobi) — small N only. Returns eigenvalues
  // and eigenvectors (vectors[j] is the eigenvector for values[j]).
  _jacobiEig(A){
    const n=A.length,a=A.map(r=>r.slice());
    const V=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    for(let sweep=0;sweep<80;sweep++){
      let off=0;for(let p=0;p<n-1;p++)for(let q=p+1;q<n;q++)off+=a[p][q]*a[p][q];
      if(off<1e-11)break;
      for(let p=0;p<n-1;p++)for(let q=p+1;q<n;q++){
        const apq=a[p][q];if(Math.abs(apq)<1e-13)continue;
        const theta=(a[q][q]-a[p][p])/(2*apq);
        const t=(theta>=0?1:-1)/(Math.abs(theta)+Math.sqrt(theta*theta+1));
        const c=1/Math.sqrt(t*t+1),s=t*c;
        for(let k=0;k<n;k++){const akp=a[k][p],akq=a[k][q];a[k][p]=c*akp-s*akq;a[k][q]=s*akp+c*akq;}
        for(let k=0;k<n;k++){const apk=a[p][k],aqk=a[q][k];a[p][k]=c*apk-s*aqk;a[q][k]=s*apk+c*aqk;}
        for(let k=0;k<n;k++){const vkp=V[k][p],vkq=V[k][q];V[k][p]=c*vkp-s*vkq;V[k][q]=s*vkp+c*vkq;}
      }
    }
    const values=[],vectors=[];
    for(let i=0;i<n;i++)values.push(a[i][i]);
    for(let j=0;j<n;j++){const v=[];for(let k=0;k<n;k++)v.push(V[k][j]);vectors.push(v);}
    return {values,vectors};
  }
  // ── the Born rule, properly ──────────────────────────────────────────────────
  // The article's claims about the entity form a density operator ρ = Σ wₖ|vₖ⟩⟨vₖ|
  // (vₖ = a claim's tf·idf direction, wₖ its salience). The entity's LENSES are ρ's
  // eigenvectors; their Born weights are the eigenvalues — and being eigenvectors they
  // are orthogonal, i.e. maximally meaningfully different by construction (Gleason:
  // Tr(ρP) is the only consistent weight on such a basis). A stance SIGN per claim lets
  // a reading the article both asserts and denies interfere DESTRUCTIVELY — loud but
  // self-cancelling frames lose weight, which variance/PCA cannot represent. The von
  // Neumann entropy S=−Σλlogλ is the NPOV readout: low → one frame dominates (POV),
  // high → a balanced mixture (NPOV). We work in the N×N claim Gram (same spectrum as ρ).
  _spectralLenses(id){
    if(!this._specCache||this._specCache.rev!==this.state.rev)this._specCache={rev:this.state.rev,m:new Map()};
    if(this._specCache.m.has(id))return this._specCache.m.get(id);
    const empty={lenses:[],PR:0,entropy:0,npov:0,n:0};
    let C=this._readingCandidates(id);
    if(C.length<2){this._specCache.m.set(id,empty);return empty;}
    C=C.sort((a,b)=>b.a-a.a).slice(0,64);
    const ll=this.labelOf(id).toLowerCase();
    const stem=w=>w.replace(/ies$/,'y').replace(/s$/,'');
    const tokOf=s=>{const set=new Set();s.toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{if(w.length>=4&&!this.STOP.has(w)&&!ll.includes(w))set.add(stem(w));});return set;};
    const toks=C.map(c=>tokOf(c.s)),N=C.length,df=new Map();
    toks.forEach(set=>set.forEach(w=>df.set(w,(df.get(w)||0)+1)));
    const vecs=C.map((c,k)=>{const m=new Map();let nm=0;toks[k].forEach(w=>{const idf=Math.log((N+1)/((df.get(w)||0)+0.5));m.set(w,idf);nm+=idf*idf;});nm=Math.sqrt(nm)||1;m.forEach((v,w)=>m.set(w,v/nm));return m;});
    const sgn=C.map(c=>/\b(not|never|no longer|isn't|wasn't|aren't|weren't|denie[ds]?|disputed|contrary|rather than|myth|incorrectly|false|fails? to|refut|debunk|unlike)\b/i.test(c.s)?-1:1);
    const w=C.map(c=>Math.max(0.15,c.a));
    const dot=(p,q)=>{const a=vecs[p],b=vecs[q],sm=a.size<b.size?a:b,lg=a.size<b.size?b:a;let d=0;sm.forEach((v,k)=>{if(lg.has(k))d+=v*lg.get(k);});return d;};
    const M=Array.from({length:N},()=>new Array(N).fill(0));
    for(let p=0;p<N;p++)for(let q=p;q<N;q++){const val=p===q?w[p]:sgn[p]*sgn[q]*Math.sqrt(w[p]*w[q])*dot(p,q);M[p][q]=val;M[q][p]=val;}
    const {values,vectors}=this._jacobiEig(M);
    let pairs=values.map((v,i)=>({v,vec:vectors[i]})).filter(o=>o.v>1e-6).sort((a,b)=>b.v-a.v);
    if(!pairs.length){this._specCache.m.set(id,empty);return empty;}
    const trace=pairs.reduce((s,o)=>s+o.v,0)||1;
    pairs.forEach(o=>o.p=o.v/trace);
    const PR=1/(pairs.reduce((s,o)=>s+o.p*o.p,0)||1);
    const S=-pairs.reduce((s,o)=>s+(o.p>0?o.p*Math.log(o.p):0),0);
    const npov=pairs.length>1?S/Math.log(pairs.length):0;
    // How many takes to surface is NOT a knob — it's the participation ratio of the Born
    // weights: the effective number of distinct frames this entity's claims actually spread
    // across. Consensus content collapses to ~1 frame; genuinely contested content opens up.
    const maxL=Math.max(2,Math.min(8,Math.round(PR)));
    const floor=Math.max(0.008,(pairs[0].p||0)*0.05);
    const top=pairs.filter(o=>o.p>=floor).slice(0,maxL+4);
    const lenses=[],seenLab=new Set();
    for(const o of top){
      const load=o.vec.map((coef,k)=>({k,coef,abs:Math.abs(coef)*Math.sqrt(w[k])})).sort((a,b)=>b.abs-a.abs);
      const lead=load[0],leadSign=(o.vec[lead.k]>=0?1:-1);
      const lab2=this._readingLabel(id,C[lead.k].i).toLowerCase();
      if(seenLab.has(lab2))continue; seenLab.add(lab2);
      const members=load.filter(x=>x.abs>=lead.abs*0.45);
      const contested=members.some(x=>(o.vec[x.k]>=0?1:-1)!==leadSign&&x.abs>=lead.abs*0.55);
      const srcs=new Set(members.map(x=>C[x.k].src));
      lenses.push({rank:lenses.length,p:o.p,repIdx:C[lead.k].i,text:C[lead.k].s,band:C[lead.k].band,contested,srcs,memberIdx:members.map(x=>C[x.k].i)});
      if(lenses.length>=maxL)break;
    }
    const res={lenses,PR,entropy:S,npov,n:pairs.length};
    this._specCache.m.set(id,res);return res;
  }
  // ── Lenses — distinct readings the record lays over the thing ────────────────
  // A lens is a Site (Significance × Particular): a specific reading laid over the whole
  // entity, individuated by WHAT IT READS IN — "largest reef system" and "threatened by
  // bleaching" are two lenses on one reef. They are offered only when the readings form
  // a meaningful partition under the Born test; otherwise the thing has one settled
  // reading and there are no competing lenses. Connections live elsewhere (the web =
  // Structure); a lens never segments — it lays a take over the whole.
  lensBlock(id,vu,ctxDef,ctxCites){
    // ── "How it's read" is HIDDEN ────────────────────────────────────────────────
    // The multi-take panel (spectral lenses, the NPOV gauge, and the combined stitch)
    // sits on top of the entity/coreference extraction, and when that mis-attributes —
    // grabbing sentences that merely sit NEAR an entity's name — the elaborate Born-rule
    // layer turns the noise into confident nonsense ("Eryximachus is the love of
    // Alcestis"). The trustworthy reading already lives one section up in the profile:
    // the cited "In context · what we've learned together" summary (panelProfile.ctxDef).
    // So the take machinery is gated off, not deleted: flip LENSES_ENABLED back on once
    // the subject-role/coref attribution it feeds on is reliable enough to trust.
    const LENSES_ENABLED=false;
    if(!LENSES_ENABLED)return {hasLenses:false,empty:false,chips:[],
      gaugeFill:0,gaugeMarkerStyle:'',npovLabel:'',npovDom:'',hasDom:false,nLenses:0,
      framing:'',kindLabel:'',contested:false,hasContested:false,takeLabel:'',hasTake:false,
      rankLabel:'',hasRank:false,hasWeightBar:false,weightBarStyle:'',
      terrainName:'',terrainGloss:'',terrainIntro:'',hasReading:false,reading:'',attrib:'',hasAttrib:false,
      showCombinedHeader:false,voiceName:'',voicePre:'',voicePost:'',voiceInit:'',voiceAvStyle:'',
      voiceCited:false,hasVoicePre:false,hasVoicePost:false,voiceMore:'',hasVoiceMore:false,hasVoice:false,
      voiceRole:'',cites:[],hasCites:false,emptyNote:''};
    const lab=this.labelOf(id),lens=this.state.panelLens||{t:'whole'};
    // The distinct recurring takes your sources lay over this entity, surfaced by
    // _spectralLenses below. Plain language — no interpretation-grain naming.
    const terrain={name:'How it’s read',gloss:'the distinct takes your sources have on '+lab,unit:'take',
      intro:'Your sources don’t all read '+lab+' the same way. Each chip below is one recurring take — tap it to read the exact lines behind it; tap “Overview” for the combined picture.'};
    const dot=(c)=>'width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:'+c+';';
    const chipStyle=(active,fillPct)=>{const bg=active?'var(--accbg)':(fillPct!=null?('linear-gradient(90deg,var(--accbg) '+fillPct+'%,var(--card) '+fillPct+'%)'):'var(--card)');
      return 'display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;border-radius:999px;padding:4px 10px;cursor:pointer;white-space:nowrap;border:1px solid '+(active?'var(--acc)':'var(--line2)')+';background:'+bg+';color:'+(active?'var(--acc)':'var(--ink2)')+';';};
    const BANDC={eva:'#1d4ed8',def:'#b45309',held:'#6b7280'};
    const sp=this._spectralLenses(id);
    const hasLenses=sp.lenses.length>=2 && sp.PR>=1.6;
    const wholeActive=lens.t==='whole';
    const chips=[{key:'whole',label:'Overview',title:'The combined picture, before picking one take',active:wholeActive,style:chipStyle(wholeActive),dotStyle:dot(this.curAccent()),onPick:()=>this.setLens(null)}];
    if(hasLenses)sp.lenses.forEach(o=>{const i=o.repIdx,a=lens.t==='take'&&lens.i===i,c=BANDC[o.band]||BANDC.held,fill=Math.round(o.p*100);
      chips.push({key:'t'+i,label:this._readingLabel(id,i),
        title:o.srcs.size+' source'+(o.srcs.size!==1?'s':'')+(o.contested?' · contested':'')+' — \u201C'+o.text.slice(0,90)+'\u2026\u201D',
        active:a,style:chipStyle(a,fill),dotStyle:dot(c),onPick:()=>this.setLens({t:'take',i})});});
    // NPOV gauge — von Neumann entropy of ρ, the interpretive spread
    const np=Math.round(sp.npov*100);
    const npovLabel=sp.npov>=0.8?'Your sources spread evenly across these takes':(sp.npov>=0.55?'A few takes, with one leading':'Mostly one take');
    const dom=sp.lenses[0]?this._readingLabel(id,sp.lenses[0].repIdx):'';
    let framing='the combined picture',kindLabel='combined',reading='',cites=[],takeLabel='',attrib='',rankLabel='',contested=false,weightFill=0;
    // The voice making the take — ALWAYS resolved. A take demonstrates subjectivity, so
    // it must be FROM somebody: the person/org cited inside the text if there is one,
    // otherwise the publisher itself (the editorial voice that asserted it).
    let voiceName='',voicePre='',voicePost='',voiceInit='',voiceAvStyle='',voiceCited=false,voiceMore='',hasVoice=false;
    if(lens.t==='take'&&hasLenses){const o=sp.lenses.find(x=>x.repIdx===lens.i);
      if(o){framing='read as';takeLabel=this._readingLabel(id,o.repIdx);reading=this.endOnBoundary(o.text,320);
        kindLabel=(o.band==='def'?'stated as fact':(o.band==='eva'?'an assessment':'a passing mention'));
        contested=o.contested;weightFill=Math.round(o.p*100);
        rankLabel=o.rank===0?('most common '+terrain.unit):(o.rank===1?'second most common':('less common '+terrain.unit));
        const _sh=[...o.srcs].map(u=>this.short(u));
        const repHost=this.short(this.master.sentenceSource[o.repIdx])||_sh[0]||'';
        const sayer=this._sayer(o.text,lab);
        if(sayer){voiceName=sayer;voicePre='according to';voicePost='';voiceCited=true;}
        else{voiceName=this.voicePretty(repHost);voicePre='';voicePost=(o.band==='def'?'states':(o.band==='eva'?'judges':'notes'));voiceCited=false;}
        const vc=this.hashColor(voiceCited?voiceName:repHost);
        voiceInit=(this.initials?this.initials(voiceName):voiceName.replace(/^the\s+/i,'').slice(0,2).toUpperCase());
        voiceAvStyle='width:26px;height:26px;flex:0 0 auto;border-radius:50%;background:'+vc+'1f;color:'+vc+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:.01em;';
        hasVoice=!!voiceName;
        // a cited voice still rode in on a publisher; many sources → say so
        if(voiceCited){voiceMore='in '+this.voicePretty(repHost);}
        else if(_sh.length>1){voiceMore='\u00B7 also in '+(_sh.length-1)+' other source'+(_sh.length-1!==1?'s':'');}
        attrib='';
        cites=this.citeChips(o.memberIdx.slice(0,6),{right:true});}
    } else { reading=ctxDef||'';cites=ctxCites||[];attrib='folded from every source'; }
    return {hasLenses,chips,
      gaugeFill:np,gaugeMarkerStyle:'position:absolute;top:-3.5px;left:'+np+'%;transform:translateX(-50%);width:11px;height:11px;border-radius:50%;border:2px solid var(--ink2);background:#fff;',
      npovLabel,npovDom:dom,hasDom:sp.npov<0.55&&!!dom,nLenses:sp.lenses.length,
      framing,kindLabel,contested,hasContested:contested,takeLabel,hasTake:!!takeLabel,rankLabel,hasRank:!!rankLabel,
      hasWeightBar:weightFill>0,weightBarStyle:'height:4px;border-radius:2px;background:var(--acc);width:'+Math.max(4,weightFill)+'%;',
      terrainName:terrain.name,terrainGloss:terrain.gloss,terrainIntro:terrain.intro,
      hasReading:!!reading,reading:reading||'',attrib,hasAttrib:!!attrib,
      showCombinedHeader:!!reading&&!hasVoice,
      voiceName,voicePre,voicePost,voiceInit,voiceAvStyle,voiceCited,hasVoicePre:!!voicePre,hasVoicePost:!!voicePost,voiceMore,hasVoiceMore:!!voiceMore,hasVoice,
      voiceRole:voiceCited?'voice quoted in the source':'the source speaking',
      cites,hasCites:!!(cites&&cites.length),empty:!reading,
      emptyNote:'No reading laid over '+lab+' yet \u2014 it has been named, not read.'};
  }
  // Page overview — when a page is loaded the panel orients to the WHOLE page: its
  // gist, the spine graph of its main subject, and the entities it introduces.
  pageOverview(url){
    const p=this.pageOf(url);if(!p)return null;
    const idxs=[];for(let i=0;i<this.master.sentences.length;i++)if(this.master.sentenceSource[i]===url)idxs.push(i);
    const boiler=s=>this._refLike(s)||/^this article\b|please help|needs? (additional|more) citation|citation needed|may be in need of|unreferenced|unsourced|multiple issues|improve this article|add citations|learn how and when/i.test(s);
    const lead=[];for(const i of idxs){const s=this.clean(this.master.sentences[i]);if(this._proseOk(s)&&s.length>=44&&!boiler(s))lead.push({i,s});if(lead.length>=2)break;}
    let gist='',gistIdx=[];if(lead.length){gist=this.endOnBoundary(lead.map(o=>o.s).join(' '),360);gistIdx=lead.map(o=>o.i);}
    const sets=new Map();
    for(const ev of this.master.events){if(ev.sentIdx==null||this.master.sentenceSource[ev.sentIdx]!==url)continue;
      [ev.id,ev.src,ev.tgt,ev.from,ev.to].filter(Boolean).forEach(x=>{const r=this.graph.representative(x);
        if(this.graph.entities.has(r)&&this.showable(r)&&!this.isURLish(this.labelOf(r))){let st=sets.get(r);if(!st){st=new Set();sets.set(r,st);}st.add(ev.sentIdx);}});}
    const ranked=[...sets].map(([eid,st])=>({eid,n:st.size})).sort((a,b)=>b.n-a.n);
    const maxN=ranked.length?ranked[0].n:1;
    const protagonists=ranked.slice(0,8).map(({eid,n})=>{const nl=this.labelOf(eid);
      return {id:eid,name:this.truncLabel(nl,30),av:this.initials(nl),avStyle:this.avatar(nl,28),
        sub:n+' mention'+(n!==1?'s':'')+' here',
        barStyle:'height:3px;border-radius:2px;margin-top:4px;background:'+this.hashColor(nl)+';width:'+Math.max(8,Math.round(n/maxN*100))+'%;',
        onSelect:()=>this.clickEntity(eid),onEnter:ev=>this.entHover(eid,ev),onLeave:()=>this.entLeave()};});
    const topId=ranked.length?ranked[0].eid:null;
    const webViz=topId?this.egoGraphMini(topId,this.neighbors(topId),{}):null;
    const c=this.hashColor(this.short(url)),fmtDate=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    return {title:p.title,host:this.short(url),url,when:fmtDate(p.ts),
      av:this.short(url).slice(0,2).toUpperCase(),
      avStyle:'width:34px;height:34px;flex:0 0 auto;border-radius:9px;background:'+c+'1a;color:'+c+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;',
      stat:sets.size+' entit'+(sets.size!==1?'ies':'y')+' · '+idxs.length+' proposition'+(idxs.length!==1?'s':''),
      hasGist:!!gist,gist,gistCites:gistIdx.length?this.citeChips(gistIdx,{right:true}):[],hasGistCites:gistIdx.length>0,
      hasWeb:!!webViz,webViz,topLab:topId?this.truncLabel(this.labelOf(topId),26):'',onOpenTop:topId?(()=>this.clickEntity(topId)):(()=>{}),
      protagonists,hasProtagonists:protagonists.length>0,allLabel:'Browse all '+sets.size+' entities',onShowAll:()=>this.showAllEntities()};
  }
  showAllEntities(){this.setState({panelMode:'entities'});}
  showOverview(){this.setState({panelMode:'overview'});}
  sourcesOf(id){return [...new Set(this.mentionsOf(id).map(i=>this.master.sentenceSource[i]).filter(Boolean))];}
  neighbors(id){const agg=new Map();for(const e of this.edgesOf(id)){const o=e.from===id?e.to:e.from;if(this.isURLish(this.labelOf(o))||!this.showable(o))continue;const c=agg.get(o)||{w:0,vias:new Set(),sent:null,grain:null,llm:false};c.w+=((e.weight!=null?e.weight:1)||0)+1e-4;const via=e.relType||e.via||e.kind;if(!this.junkRel(via))c.vias.add(via);if(c.sent==null)c.sent=e.sentIdx;if(!c.grain)c.grain=this.edgeGrain(e);if(this.edgeReader(e)==='svo-llm')c.llm=true;agg.set(o,c);}return [...agg].map(([o,v])=>({id:o,w:v.w,vias:[...v.vias],sent:v.sent,grain:v.grain,llm:v.llm})).sort((a,b)=>b.w-a.w);}
  pageOf(url){return (this.master&&this.master.pages)?this.master.pages.find(p=>p.url===url):undefined;}
  // ── subject-not-mention selection ──────────────────────────────────
  // A profile stitches propositions the entity is the SUBJECT of — what the record
  // says ABOUT it — not every sentence its name turns up in. The graph already records
  // the slot (edge.from = subject), so this reads a role; it does not guess.
  subjectSentences(id){const s=new Set();for(const e of this.graph.edges){if(e.from===id&&e.to!==e.from&&e.sentIdx!=null&&!this.isURLish(this.labelOf(e.to)))s.add(e.sentIdx);}return [...s].sort((a,b)=>a-b);}
  // ── the one written sentence ─────────────────────────────────────
  summaryFallback(texts){ if(!texts||!texts.length)return null; return texts.slice(0,2).map(t=>this.norm(t)).join(' ').slice(0,320); }
  // ── temporal cursor over an entity's attested record ───────────────
  // The summary is stitched from the propositions the entity is the SUBJECT of,
  // in reading order. Those propositions are spread across the time of the text —
  // each one a moment the record had something to say. The cursor walks that
  // sequence: at position k we know only the first k attested propositions, so the
  // summary reads as it would have "as of" that point. k = N (the right edge, the
  // default) is the whole record and reproduces the untimed summary exactly.
  entTimeline(id){
    const att=this.subjectSentences(id).filter(i=>this.bandOf(i)==='eva').sort((a,b)=>a-b);
    return {att, N:att.length};
  }
  // Resolve the stored fraction into an integer count k ∈ [1..N] (at least one
  // proposition once the cursor is shown — k=0 has nothing to say). Undefined → N.
  entCursorK(id,N){
    if(N<=0)return 0;
    const f=this.state.entCursor&&this.state.entCursor[id];
    if(f==null)return N;
    return Math.max(1,Math.min(N,Math.round(f*N)));
  }
  setEntCursor(id,k){
    const {N}=this.entTimeline(id); if(N<=0)return;
    const f=Math.max(0,Math.min(1,(+k||0)/N));
    this.setState(s=>({entCursor:{...(s.entCursor||{}),[id]:f}}));
  }
  // Strip inline reference markers ([13], [74], [1][2], [citation needed], [a]) from
  // text we DISPLAY — never from the sentence we match/scroll against in the live page.
  stripRefs(s){return this.norm(String(s||'').replace(/\s*\[(?:\d+(?:[\u2013-]\d+)?|citation needed|note \d+|[a-z])\]/gi,'')).replace(/\s+([,.;:!?])/g,'$1');}
  clean(s){return this.stripRefs(this.norm(s));}
  // Reconstruct a definition sentence from the label + an attested predicate.
  glossSentence(lab,pred){pred=this.clean(pred).replace(/[\s.;,]+$/,'');if(!pred)return null;
    if(/^(is|are|was|were|has|have|had|can|could|seen|located|known|composed|made|built|consists?|defined|considered|named|protected|found|home)\b/i.test(pred))return lab+' '+pred+'.';
    if(/^(a|an|the|one|part|home|type|kind|form)\b/i.test(pred))return lab+' is '+pred+'.';
    return lab+' \u2014 '+pred+'.';}
  // First sentence of `s`, but NEVER split on an abbreviation period — a title
  // ("Mr."/"Mrs."/"Dr."), a lone initial, "Inc.", "U.S." The naive split chopped
  // "a source of irritation to Mr. Samsa" to "…to Mr.", surfacing a stray bare "Mr"
  // in the profile gloss. Mirrors the re-merge in _clipExtract.
  _firstSentence(s){
    const raw=String(s||'').split(/(?<=[.!?])\s+/);
    const ABBR=/(?:^|[\s(])(?:[A-Za-z]|Mr|Mrs|Ms|Dr|Prof|Gen|Sen|Rep|Gov|Lt|Sgt|Sr|Jr|St|vs|v|etc|Inc|Ltd|Co|Corp|No|pp|al|Ave|Rd|Rev|Hon|Capt|U\.S|U\.K|U\.N|D\.C)\.$/i;
    let out=raw[0]||'';for(let i=1;i<raw.length&&ABBR.test(out);i++)out+=' '+raw[i];
    return out;
  }
  // Trim to <= max chars but never mid-sentence: keep whole sentences, else cut on a
  // word boundary with an ellipsis. No more "...decreasing their abilit".
  endOnBoundary(s,max){s=this.norm(String(s||'').replace(/<[^>]*>/g,' ').replace(/\[(?:\d+|citation needed|edit)\]/gi,''));max=max||320;if(s.length<=max)return s;const cut=s.slice(0,max);const m=cut.match(/^[\s\S]*[.!?](?=\s|$)/);if(m&&m[0].length>=Math.min(70,max*0.45))return m[0].trim();return cut.replace(/\s+\S*$/,'').replace(/[\s,;:]+$/,'').trim()+'\u2026';}
  // The strongest attested definition the engine isolated for this entity: a DEF
  // (assert/define) event's predicate. Earliest/cleanest wins — the intro defines.
  bestDef(id,onlyUrl){
    let cands=(this.master.events||[]).filter(ev=>ev.op==='DEF'&&ev.key==='predicate'&&ev.value&&ev.sentIdx!=null&&this.graph.representative(ev.id)===id);
    if(onlyUrl)cands=cands.filter(ev=>this.master.sentenceSource[ev.sentIdx]===onlyUrl);
    cands=cands.filter(ev=>{const v=this.clean(ev.value);return v&&v.length>=8&&v.split(/\s+/).length>=2&&!/[a-z][A-Z].*[a-z][A-Z]/.test(v);});
    if(!cands.length)return null;
    const score=ev=>{const v=this.clean(ev.value).toLowerCase();let s=0;
      if(/^(a|an|the)\b/.test(v))s+=2.2;
      if(/\b(state|system|site|region|city|country|area|park|species|organi[sz]ation|company|river|island|reef|sea|nation|territory|town|lake|mountain|range)\b/.test(v))s+=1;
      if(v.length>150)s-=2.5;if(v.length<14)s-=1;s-=ev.sentIdx*0.02;return s;};
    cands.sort((a,b)=>score(b)-score(a));
    const ev=cands[0];const pred=this._firstSentence(this.clean(ev.value));
    if(!pred||pred.length<8||pred.length>200)return null;
    return {pred,sentIdx:ev.sentIdx};
  }
  // Rank sentences by how well they CHARACTERIZE the entity (definitional shape,
  // subject-early), not merely mention it. Used to pick supporting prose.
  rankCtx(id,idxList){
    const lab=(this.labelOf(id)||'').toLowerCase(),esc=lab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const score=i=>{const s=this.clean(this.master.sentences[i]),low=s.toLowerCase();let v=0;
      if(esc&&new RegExp('\\b'+esc+'\\b\\s+(is|are|was|were)\\b').test(low))v+=3;
      if(/\b(is|are|was|were)\s+(a|an|the)\b/.test(low))v+=0.6;
      if(/\b(known as|located in|composed of|consists? of|part of|defined as|home to|named|protected by|comprises|refers to)\b/.test(low))v+=1;
      const at=low.indexOf(lab);if(at>=0&&at<26)v+=1;
      v+=Math.min(1.2,s.length/150);if(s.length>230)v-=1.2;return v;};
    return (idxList||[]).filter(i=>this._proseOk(this.clean(this.master.sentences[i]))).map(i=>({i,v:score(i)})).filter(o=>o.v>0).sort((a,b)=>b.v-a.v).map(o=>o.i);
  }
  // Compose the "in context · on this page" reading from STRUCTURED signal:
  // the page's DEF predicate (what it asserts the thing IS), plus the best
  // subject-role sentence — not two random mention sentences near the name.
  composeOnPage(id,vu){
    const lab=this.labelOf(id);
    const def=this.bestDef(id,vu);
    if(def){const g=this.glossSentence(lab,def.pred);
      if(g){let text=g,idx=[def.sentIdx];
        const role=this.rankCtx(id,this.subjectSentences(id).filter(i=>this.master.sentenceSource[i]===vu&&i!==def.sentIdx));
        if(role.length){const sup=this.clean(this.master.sentences[role[0]]);if(sup&&text.length+sup.length<=300){text=text+' '+sup;idx.push(role[0]);}}
        return {text:this.endOnBoundary(text,340),idx,kind:'page'};}}
    const occ2=this.mentionsOf(id).filter(i=>this.master.sentenceSource[i]===vu);
    const r=this.rankCtx(id,occ2);
    if(r.length){let text=this.clean(this.master.sentences[r[0]]),idx=[r[0]];
      if(r[1]!=null){const sup=this.clean(this.master.sentences[r[1]]);if(sup&&text.length+sup.length<=300){text=text+' '+sup;idx.push(r[1]);}}
      return {text:this.endOnBoundary(text,340),idx,kind:'page'};}
    const cand=occ2.map(i=>({i,s:this.clean(this.master.sentences[i])})).filter(o=>o.s&&this._proseOk(o.s)).sort((a,b)=>a.s.length-b.s.length)[0];
    if(cand)return {text:cand.s,idx:[cand.i],kind:'pageMention'};
    return null;
  }
  summarySig(sel){ return sel+'|'+this.subjectSentences(sel).length+'|'+this.sourcesOf(sel).length+'|'+this.state.rev; }
  ensureSummary(sel,attestedTexts){
    return; // Disabled by request: no model-composed prose. The verbatim stitch of attested propositions stands on its own, traced below.
    const sig=this.summarySig(sel),cur=this.state.summaries&&this.state.summaries[sel];
    if(cur&&cur.sig===sig)return; if(this._sumPending===sig)return; if(!attestedTexts||!attestedTexts.length)return;
    if(!(typeof window!=='undefined'&&window.claude&&typeof window.claude.complete==='function'))return; // no model → the stitched fallback stands
    this._sumPending=sig; const name=this.labelOf(sel);
    const prompt='Write a neutral, encyclopedia-style summary of "'+name+'" in ONE sentence, two at most. Use ONLY the facts in the attested statements below — each is drawn verbatim from a source. Do not add, infer, or embellish anything not explicitly present. Name plainly what it is. Output only the summary.\n\nAttested statements:\n- '+attestedTexts.slice(0,8).map(t=>this.norm(t)).join('\n- ');
    Promise.resolve().then(()=>window.claude.complete(prompt)).then(out=>{ this._sumPending=null; const txt=this.norm(String(out||'')).replace(/^["\u201c\u201d]+|["\u201c\u201d]+$/g,''); if(txt)this.setState(s=>({summaries:{...s.summaries,[sel]:{text:txt,sig:sig,model:true}}})); }).catch(()=>{this._sumPending=null;});
  }
  // ── Wikipedia-backed definition, coref-checked against the graph ──────
  // For most entities there is no "attested" sentence to stitch. Rather than
  // fail, pull the encyclopedia summary — but only TRUST it when the article
  // corefers to what the graph already knows about this node (its neighbours
  // and the pages it appeared on). No model required.
  // Only proper-noun-like labels deserve an encyclopedia lookup. A lowercase
  // or sentence-case common phrase ("immigrant neighborhoods", "team lead")
  // is a discourse concept, not a named entity — define it from the source.
  looksProperNoun(label){
    const toks=String(label||'').trim().split(/\s+/).filter(Boolean);if(!toks.length)return false;
    const small=new Set('of the and for in on at to a an or de la van von &'.split(' '));
    let content=0,capped=0;
    for(const t of toks){const w=t.replace(/[^A-Za-z0-9]/g,'');if(!w)continue;if(small.has(w.toLowerCase()))continue;content++;if(/^[A-Z0-9]/.test(w))capped++;}
    if(!content)return false;
    return capped===content&&/[A-Za-z]/.test(label);
  }
  // The bare name a label refers to, with any leading honorific/role title stripped:
  // "Vice President JD Vance" → "JD Vance", "Dr. Jane Goodall" → "Jane Goodall". The
  // title tells you the person's office; the NAME is what an encyclopedia article is
  // keyed on. We only strip leading role tokens, never the trailing name, and stop at
  // the first non-role token so "President of the United States" keeps its office words.
  _nameCore(label){
    if(!this._ROLE)this._ROLE=new Set(('president vice senator sen senate representative rep congressman congresswoman governor gov mayor secretary justice judge general gen colonel col captain capt lieutenant lt sergeant sgt admiral major chancellor chairman chairwoman chair chief ceo cfo cto coo founder director minister ambassador pope king queen prince princess emperor empress sir lord lady dame dr doctor prof professor mr mrs ms mx rev reverend father rabbi imam sheikh saint commissioner sheriff attorney detective officer agent coach deputy former acting interim elect speaker premier dictator pres vp').split(' '));
    const toks=String(label||'').trim().split(/\s+/).filter(Boolean);
    let i=0;
    while(i<toks.length-1){const w=toks[i].replace(/[^A-Za-z]/g,'').toLowerCase();if(w&&this._ROLE.has(w))i++;else break;}
    return toks.slice(i).join(' ');
  }
  wikiDef(id){return this.state.wikiDefs&&this.state.wikiDefs[id];}
  corefContext(id){
    // Context that proves a referent, graded by specificity. STRONG terms are the
    // entities this one actually shares propositions with — its subjects/objects —
    // plus what the record predicates about it. WEAK terms are the pages it merely
    // turned up on. A confirmed article must sit among the STRONG (subject) context,
    // not just share generic topic vocabulary.
    const strong=new Set(),weak=new Set();
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    const addTo=(set,t)=>String(t||'').toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{if(w.length>=4&&!this.STOP.has(w))set.add(stem(w));});
    this.neighbors(id).slice(0,16).forEach(n=>addTo(strong,this.labelOf(n.id)));
    this.subjectSentences(id).slice(0,10).forEach(i=>addTo(strong,this.master.sentences[i]));
    this.sourcesOf(id).forEach(u=>{const p=this.pageOf(u);if(p)addTo(weak,p.title);});
    // Identifying referents — the SPECIFIC entities the ENGINE already admitted and
    // linked to this node (its neighbours: Nashville, Tennessee, DMC…), minus the node's
    // own name tokens. We don't re-detect names ourselves; we trust the engine's graph.
    // This is what an external text must actually share to be the SAME referent, not
    // just the same topic. Generic words ("council", "corporation") never enter here.
    const proper=new Set(),self=new Set();
    String(this.labelOf(id)||'').toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{if(w)self.add(stem(w));});
    this.neighbors(id).slice(0,24).forEach(n=>{const l=this.labelOf(n.id);if(l&&/[A-Z]/.test(l)&&!this.isURLish(l))l.toLowerCase().split(/[^a-z0-9]+/).forEach(w=>{const st=stem(w);if(w.length>=3&&!this.STOP.has(w)&&!this.isGenericName(st))proper.add(st);});});
    self.forEach(w=>proper.delete(w));
    return {strong,weak,proper,generic:this.isGenericConcept(id)};
  }
  // Proper-noun referents named INSIDE an external text (a Wikipedia extract). Same
  // shape as proper-context, so the two can be intersected to coref-resolve.
  articleNames(text){
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    const set=new Set();(String(text||'').match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*\b/g)||[]).forEach(ph=>ph.toLowerCase().split(/\s+/).forEach(w=>{const s=stem(w);if(s.length>=3&&!this.STOP.has(s)&&!this.isGenericName(s))set.add(s);}));
    return set;
  }
  // Org-type / geographic / calendar filler that is NOT an identifying referent. These
  // collide across unrelated topics (a solar "corporation" vs a security "corporation"),
  // so they must never count as coref corroboration — only true proper names do.
  isGenericName(w){
    if(!this._GEN)this._GEN=new Set('state city cities county counties court courts board council councils department departments division office agency authority commission committee bureau national federal american inc llc ltd co company companies corporation corp management partnership group holdings services service systems system solutions association foundation institute university college school center centre downtown district new north south east west northern southern eastern western street road avenue region area january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(' '));
    return this._GEN.has(w);
  }
  async _wikiJSON(url){
    // Try the source directly first (fast when the frame allows it). Wikipedia's REST +
    // api.php (origin=*) are CORS-open, but THIS preview frame blocks cross-origin fetch,
    // so on failure we fall back to the very same proxy the reader uses for page fetches.
    try{ const r=await fetch(url,{headers:{accept:'application/json'}}); if(r.ok) return await r.json(); }catch(e){}
    const r2=await fetch(this.PROXY+'/feed?url='+encodeURIComponent(url));
    if(!r2.ok) throw new Error('HTTP '+r2.status);
    const txt=await r2.text();
    try{ return JSON.parse(txt); }catch(e){ throw new Error('non-JSON from proxy'); }
  }
  async _wikiSummary(title){const u='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(title).replace(/ /g,'_'))+'?redirect=true';return this._wikiJSON(u);}
  // First 1–3 sentences of an extract, ABBREVIATION-SAFE. A naive split on ". " shatters
  // "Roe v. Wade, 410 U.S. 113 (1973)…" into "Roe v." / "Wade, 410 U.S." — a meaningless
  // stub ("too minimal"). Split only before a capital/quote, re-merge any piece that ended
  // on an abbreviation (v., U.S., Inc., a lone initial), then fill to a readable length.
  _clipExtract(text,maxChars){
    maxChars=maxChars||300;const t=this.norm(text||'');if(!t)return '';
    const raw=t.split(/(?<=[.!?])\s+(?=["\u201c'A-Z])/);
    const ABBR=/(?:^|[\s(])(?:[A-Za-z]|Mr|Mrs|Ms|Dr|Prof|Gen|Sen|Rep|Gov|Lt|Sgt|Sr|Jr|St|vs|v|etc|Inc|Ltd|Co|Corp|No|pp|al|Ave|Rd|Rev|Hon|Capt|U\.S|U\.K|U\.N|D\.C)\.$/i;
    const parts=[];for(const p of raw){if(parts.length&&ABBR.test(parts[parts.length-1]))parts[parts.length-1]+=' '+p;else parts.push(p);}
    let out='',n=0;for(const p of parts){const next=out?out+' '+p:p;if(out.length>=80&&next.length>maxChars)break;out=next;n++;if(out.length>=maxChars||n>=3)break;}
    return out||parts[0]||t.slice(0,maxChars);
  }
  async wikiBest(label,ctx){
    const cands=[];
    try{const d=await this._wikiSummary(label);if(d&&d.type!=='disambiguation'&&d.extract)cands.push(d);}catch(e){}
    let titles=[];
    try{const s=await this._wikiJSON('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(label)+'&srlimit=4&format=json&origin=*');titles=(s.query&&s.query.search||[]).map(x=>x.title);}catch(e){}
    // Context-augmented retrieval: the entity's attested context words (what it DOES /
    // what's said about it) bias the candidate set toward the right referent — so
    // "Outside" + "published obituary" surfaces the magazine, not the jazz technique.
    const ctxTerms=ctx&&ctx.strong?[...ctx.strong].filter(t=>t&&t.length>=4).slice(0,4).join(' '):'';
    if(ctxTerms){try{const s2=await this._wikiJSON('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(label+' '+ctxTerms)+'&srlimit=3&format=json&origin=*');(s2.query&&s2.query.search||[]).forEach(x=>{if(!titles.includes(x.title))titles.push(x.title);});}catch(e){}}
    for(const t of titles){if(cands.find(c=>c.title===t))continue;try{const j=await this._wikiSummary(t);if(j&&j.type!=='disambiguation'&&j.extract)cands.push(j);}catch(e){}if(cands.length>=6)break;}
    if(!cands.length)return null;
    const ctxg=(ctx&&ctx.strong)?ctx:{strong:(ctx||new Set()),weak:new Set()};
    const hayOf=c=>((c.extract||'')+' '+(c.description||'')+' '+(c.title||'')).toLowerCase();
    const hits=(set,hay)=>{let n=0;set.forEach(t=>{if(t&&hay.indexOf(t)>=0)n++;});return n;};
    const strongHits=c=>hits(ctxg.strong,hayOf(c)),weakHits=c=>hits(ctxg.weak,hayOf(c));
    // REAL COREF: intersect the SPECIFIC referents the article names with the graph's.
    // A shared proper noun beyond the entity's own name (Nashville, Tennessee, DMC…) is
    // real corroboration. Zero shared names against a rich graph — while the article
    // names its OWN specific referents — is DISCONFIRMATION: a different thing that
    // merely shares the label (Louisville Metro Council; Solaren the solar startup;
    // Kevin Walters the rugby player).
    const properG=(ctxg.proper&&ctxg.proper.size)?ctxg.proper:new Set();
    const corefHits=c=>{const a=this.articleNames((c.extract||'')+' '+(c.description||''));let n=0;properG.forEach(t=>{if(a.has(t))n++;});return n;};
    const ctxScore=c=>1.3*strongHits(c)+0.5*weakHits(c)+2.4*Math.min(3,corefHits(c));
    // Ranking blends specific-referent coref with lexical AFFINITY of the title to the
    // label — coverage of the label's content tokens AND agreement on the head noun.
    const score=c=>{const af=this._titleAffinity(label,c.title);
      return ctxScore(c) + 3.0*af.covL*(af.headMatch?1:0.25) + (af.exact?2:0) + ((af.headMatch&&af.headBack)?0.6:0) + (String(c.title||'').toLowerCase()===String(label).toLowerCase()?0.5:0);};
    cands.sort((a,b)=>score(b)-score(a));
    const top=cands[0];
    const extract=this._clipExtract(top.extract,300);
    const af=this._titleAffinity(label,top.title),sh=strongHits(top),wk=weakHits(top),ch=corefHits(top);
    const artN=this.articleNames((top.extract||'')+' '+(top.description||''));
    const isGen=!!ctxg.generic;                           // a generic concept ("reef"): the general article IS the meaning
    const canJudge=properG.size>=3;                       // graph rich enough to coref-check
    const disconfirmed=!isGen&&canJudge&&ch===0&&artN.size>=3; // proper-noun anchors elsewhere
    const lexOK=af.exact||(af.headMatch&&af.covL>=0.6&&af.covT>=0.5)||(af.headMatch&&af.covL>=0.85&&af.covT>=0.55);
    // STRONG NAME IDENTITY — a fully sufficient confidence on its own. Strip the leading
    // honorific/role from the label ("Vice President JD Vance" → "JD Vance") and test the
    // bare name against the title. When the WHOLE article title sits inside that name
    // (covT≥1), the head nouns agree both ways, and the name is a specific multi-token
    // PROPER noun, the article simply IS this referent — a full personal/proper name like
    // "JD Vance" rarely collides — so we may confirm on lexical identity even when the
    // graph is too sparse to coref-check. (The disconfirmation guard above still wins
    // whenever the graph CAN judge and the article anchors somewhere else entirely.)
    const core=this._nameCore(label),afc=this._titleAffinity(core,top.title);
    const coreToks=String(core).trim().split(/\s+/).filter(w=>w.replace(/[^A-Za-z0-9]/g,'').length>1).length;
    const specificName = this.looksProperNoun(core) && coreToks>=2 && afc.headMatch && afc.headBack && afc.covT>=1 && afc.covL>=0.5;
    // Confirmation needs CORROBORATION from the entity's attested context — a shared
    // specific referent (proper-noun coref, ch) OR a shared predicate/topic term (sh) —
    // never a bare name match. A generic concept is the exception: its general article
    // IS the meaning. ("Outside" the magazine vs "Outside (jazz)": jazz corroborates
    // neither the referents nor the predicates, so it is refused.)
    const corroborated = ch>=1 || sh>=1;
    // SANITY GUARD against a perfect-spelling collision: an article that names ≥3 of its OWN
    // specific referents while sharing NEITHER a coref nor a topic term with what we've read
    // is a different thing wearing the same letters — "trigger laws" (legal) vs "Trigger Law"
    // (a 1944 Western film). Refuse it even when the title matches exactly, generic or not.
    const articleConflict = artN.size>=3 && ch===0 && sh===0;
    const confirmed = !disconfirmed && (specificName || (!articleConflict && lexOK && (isGen ? (af.exact||af.covL>=0.85) : corroborated)));
    return {text:extract,title:top.title,desc:top.description||'',
      url:(top.content_urls&&top.content_urls.desktop&&top.content_urls.desktop.page)||('https://en.wikipedia.org/wiki/'+encodeURIComponent(String(top.title).replace(/ /g,'_'))),
      thumb:(top.thumbnail&&top.thumbnail.source)||null,confirmed:confirmed,score:Math.round(score(top)*100)/100,ctxStrong:sh,coref:ch,disconfirmed:disconfirmed,specificName:specificName};
  }
  // Token affinity between an entity label and a candidate article title:
  // light-stemmed content-token coverage in both directions + head-noun match.
  // This is what replaces the old substring test — "shouldn't just be a span check."
  _titleAffinity(label,title){
    const stop=new Set('the of and for a an on in to at de la von van el le with by as from'.split(' '));
    const stem=w=>w.replace(/ies$/,'y').replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/s$/,'');
    const toks=s=>String(s||'').toLowerCase().replace(/\([^)]*\)/g,' ').split(/[^a-z0-9]+/).filter(w=>w.length>1&&!stop.has(w)).map(stem);
    const L=toks(label),T=toks(title);
    if(!L.length||!T.length)return {covL:0,covT:0,headMatch:false,headBack:false,jaccard:0,exact:false};
    const Ls=new Set(L),Ts=new Set(T);let inter=0;Ls.forEach(w=>{if(Ts.has(w))inter++;});
    const uni=new Set([...Ls,...Ts]).size,headL=L[L.length-1],headT=T[T.length-1];
    return {covL:inter/Ls.size,covT:inter/Ts.size,headMatch:Ts.has(headL),headBack:Ls.has(headT),jaccard:inter/uni,exact:Ls.size===Ts.size&&inter===Ls.size};
  }
  // When there is no attested statement AND no confirmed encyclopedia match,
  // compose a definition from the source sentences we DO have — preferring
  // appositive/defining mentions ("NDP's David Corman — a former commander …").
  // Reject scraped boilerplate so composed definitions read like prose, not
  // navigation cruft ("View 30 PhotosBelongs on List?YesNo…", "#16 in World's…").
  _proseOk(s){
    if(!s)return false; const t=String(s);
    // A MEASUREMENT line — a value with a unit ("72°F", "winds 10 mph", "humidity 40%") — is
    // DATA, not junk. The prose heuristics below exist to drop navigation debris, and they were
    // silently vetoing exactly the content a live-fact answer stands on: "10mph" trips the
    // digit-letter smash, and "Sunny, 72°F" dies on the six-word floor. A short line that
    // carries a real unit rides through; the junk-phrase reject still applies to everything.
    const measure=/\d\s*(?:°\s*[cf]?|degrees?\b|%|mph|km\/h|kph|knots?|hpa|millibars?|celsius|fahrenheit)/i.test(t)
      ||/\b(?:humidity|wind|gusts?|precipitation|dew\s*point|uv\s*index|high|low)\b[^a-z]{0,4}\d/i.test(t);
    if(/\b(view\s+\d+\s+photos?|yes\s*no|add to list|belongs on list|sign in|log in|subscribe|cookies?)\b/i.test(t))return false;
    if(measure)return t.length>=8;
    if(t.length<24)return false;
    if((t.match(/[a-z][A-Z]/g)||[]).length>=2)return false;      // camelCase smash
    if(/[A-Za-z]#\d|\d[A-Za-z]{3,}|[a-z]\?[A-Z]/.test(t))return false; // letter/digit smash
    const words=t.trim().split(/\s+/); if(words.length<6)return false;
    if(Math.max.apply(null,words.map(w=>w.length))>28)return false; // long spaceless run
    if(!/[a-z]\s+[a-z]/i.test(t))return false;
    return true;
  }
  sourceGist(id,onlyUrl){
    const lab=this.labelOf(id);if(!lab)return null;const ll=lab.toLowerCase();
    let idx=this.mentionsOf(id);if(onlyUrl)idx=idx.filter(i=>this.master.sentenceSource[i]===onlyUrl);if(!idx.length)return null;
    const score=s=>{const low=s.toLowerCase();const at=low.indexOf(ll);if(at<0)return -1;let v=0;
      const after=s.slice(at+lab.length,at+lab.length+44);
      if(/^\s*[—–-]\s*(an?\s+|the\s+)?(former\s+|the\s+)?[a-z]/i.test(after))v+=3.2;
      if(/^\s*,\s*(an?\s+|the\s+)?(former\s+)?[a-z]/i.test(after))v+=2.4;
      if(new RegExp('\\b'+ll.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b\\s+(is|was|are|were|serves?\\s+as|served\\s+as|leads?|directs?|owns?|founded|heads?|runs?|chairs?)\\b','i').test(s))v+=2.6;
      if(/\b(known as|known professionally as|also called|formerly)\b/i.test(s))v+=1.4;
      if(at<28)v+=1;v+=Math.min(1.6,s.length/150);return v;};
    const ranked=idx.map(i=>({i,s:this.norm(this.master.sentences[i])})).filter(o=>o.s&&o.s.length>20&&this._proseOk(o.s)).map(o=>(o.v=score(o.s),o)).filter(o=>o.v>0).sort((a,b)=>b.v-a.v);
    if(!ranked.length)return null;
    const out=[],seen=new Set();
    for(const o of ranked){const k=o.s.slice(0,46);if(seen.has(k))continue;seen.add(k);out.push(o.s);if(out.length>=2)break;}
    return out.join(' ').slice(0,360);
  }
  // ── one representative sentence (verbatim) for an entity we can't yet
  // define — the closest thing in the record, kept as a quote with its source
  // rather than dressed up as a definition. ────────────────────────────
  repQuote(id){
    const lab=this.labelOf(id);if(!lab)return null;const ll=lab.toLowerCase();
    const idx=this.mentionsOf(id);if(!idx.length)return null;
    const score=s=>{const low=s.toLowerCase();const at=low.indexOf(ll);let v=0;
      if(at>=0){if(at<28)v+=1.4;
        if(new RegExp('\\b'+ll.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b\\s+(is|was|are|were|refers?|means?|serves?|forms?|becomes?|consists?)\\b','i').test(s))v+=2.4;
        if(/\b(known as|also called|defined as|type of|kind of|form of)\b/i.test(s))v+=1.6;}
      v+=Math.min(1.4,s.length/160);if(s.length>200)v-=0.8;return v;};
    const ranked=idx.map(i=>({i,s:this.norm(this.master.sentences[i])})).filter(o=>o.s&&o.s.length>24&&o.s.length<300&&this._proseOk(o.s)).map(o=>(o.v=score(o.s),o)).sort((a,b)=>b.v-a.v);
    if(!ranked.length)return null;
    const i=ranked[0].i,u=this.master.sentenceSource[i],p=this.pageOf(u);
    const fmtDate=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    return {text:ranked[0].s,srcId:this.srcId(u),host:this.short(u),when:p?fmtDate(p.ts):'',hasWhen:!!(p&&p.ts),
      jumpUrl:this.tfURL(u,this.master.sentences[i]),onOpen:()=>this.openSource(u),onGo:()=>this._scrollToText(ranked[0].s)};
  }
  // ── citation chips: small numbered markers that sit by a summary and, on
  // hover, reveal the exact source sentence + who + when the fold drew on. ─
  citeChips(idxList,opts){
    opts=opts||{};const hc=this.state.hoverCite,active=this.state.pinSrc||this.state.hoverSrc;
    const fmtDate=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    // The tip lived as position:absolute inside the scrolling panel, so the panel's
    // overflow clipped it. Anchor it to the viewport (fixed) at the hovered chip's
    // rect, clamped on-screen, so it can never be cut off by an ancestor.
    const xy=this.state.hoverCiteXY,vw=(typeof window!=='undefined'&&window.innerWidth)||1200,vh=(typeof window!=='undefined'&&window.innerHeight)||800;
    const pos=xy?('position:fixed;left:'+Math.max(8,Math.min(Math.round(xy.x-118),vw-256))+'px;top:'+Math.round(Math.min(xy.y+6,vh-170))+'px;'):('position:absolute;top:23px;'+(opts.right?'right:0;':'left:0;'));
    const tip=pos+'z-index:60;width:248px;background:#1b1f24;color:#e8eaed;border-radius:9px;padding:9px 11px;font-size:11.5px;line-height:1.45;font-weight:400;letter-spacing:0;text-transform:none;box-shadow:0 12px 32px rgba(0,0,0,.34);text-align:left;white-space:normal;';
    return (idxList||[]).slice(0,16).map((i,n)=>{const u=this.master.sentenceSource[i],p=this.pageOf(u),txt=this.stripRefs(this.norm(this.master.sentences[i])),key=i+':'+n,cc=this.hashColor(this.short(u)),who=this._sayer(this.master.sentences[i]);
      return {key,n:n+1,label:this.srcId(u),srcId:this.srcId(u),host:this.short(u),who:who||'',hasWho:!!who,when:p?fmtDate(p.ts):'',hasWhen:!!(p&&p.ts),quote:txt,
        jumpUrl:this.tfURL(u,this.master.sentences[i]),showTip:hc===key,tipStyle:tip,
        onOpen:()=>this.openSource(u),
        onEnter:(ev)=>{const r=ev&&ev.currentTarget&&ev.currentTarget.getBoundingClientRect&&ev.currentTarget.getBoundingClientRect();this.setHover(u);this.setState({hoverCite:key,hoverCiteXY:r?{x:r.left,y:r.bottom}:null});},
        onLeave:()=>{this.setHover(null);this.setState({hoverCite:null});},
        title:'“'+txt.slice(0,200)+(txt.length>200?'…':'')+'” — '+this.srcId(u)+' · '+this.short(u),
        chipStyle:'position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:21px;height:18px;padding:0 5px;border-radius:5px;font-size:9.5px;font-weight:800;letter-spacing:.02em;cursor:pointer;transition:all .12s;border:1px solid '+cc+(active===u?';color:#fff;background:'+cc+';':';color:'+cc+';background:'+cc+'14;')};});
  }
  ensureWiki(id){
    const sig=id+'|'+this.state.rev;const cur=this.wikiDef(id);
    if(cur&&cur.sig===sig)return;
    this._wikiPending=this._wikiPending||new Set();if(this._wikiPending.has(sig))return;this._wikiPending.add(sig);
    const label=this.labelOf(id),ctx=this.corefContext(id);
    // GROUND TRUTH FIRST: if the page hyperlinked this entity to a Wikipedia article,
    // bind to THAT article — no searching, no coref guessing (CNN → /wiki/CNN, never CNN+).
    const directHref=this.linkedWiki(id);
    Promise.resolve().then(()=>directHref?this.wikiFromHref(directHref,label):this.wikiBest(label,ctx)).then(best=>{
      this._wikiPending.delete(sig);
      this.setState(s=>({wikiDefs:{...s.wikiDefs,[id]:best?{...best,sig,id}:{sig,id,none:true}}}));
    }).catch(()=>{this._wikiPending.delete(sig);this.setState(s=>({wikiDefs:{...s.wikiDefs,[id]:{sig,id,none:true}}}));});
  }
  // The page's own hyperlink for this entity (by label or any alias) → the canonical
  // Wikipedia article it points to. The page already resolved the ambiguity for us.
  linkedWiki(id){
    const labels=new Set([this.labelOf(id),...this.aliasesOf(id)].filter(Boolean).map(l=>this.norm(l).toLowerCase()));
    for(const p of (this.master&&this.master.pages||[])){if(!p.wikiLinks)continue;for(const l of labels){if(p.wikiLinks[l])return p.wikiLinks[l];}}
    return null;
  }
  async wikiFromHref(href,label){
    const m=String(href||'').match(/\/wiki\/([^#?]+)/);if(!m)return null;
    const title=decodeURIComponent(m[1]).replace(/_/g,' ');
    try{const d=await this._wikiSummary(title);
      if(d&&d.extract){const extract=this._clipExtract(d.extract,300);
        return {text:extract,title:d.title||title,desc:d.description||'',
          url:(d.content_urls&&d.content_urls.desktop&&d.content_urls.desktop.page)||href,
          thumb:(d.thumbnail&&d.thumbnail.source)||null,confirmed:true,linked:true,score:99,coref:99};}
    }catch(e){}
    return null;
  }
  // ── self-enrichment: don't wait to be asked ───────────────────────────
  scheduleAutoEnrich(id){ clearTimeout(this._autoTimer); this._autoTimer=setTimeout(()=>this.tryAutoEnrich(id),1300); }
  tryAutoEnrich(id){
    if(this.props&&this.props.autoEnrich===false)return; if(!this.E||this._busy)return; if(this.state.selId!==id)return;
    if(!this._autoEnriched)this._autoEnriched=new Set(); if(this._autoEnriched.has(id))return;
    if(this.sourcesOf(id).length>=2)return; // already corroborated
    // ── hard session budget: auto-enrich only runs a set number of times, then stops ──
    const budget=(this.props&&this.props.autoEnrichBudget!=null)?this.props.autoEnrichBudget:3;
    if(this._autoEnrichCount==null)this._autoEnrichCount=0;
    if(this._autoEnrichCount>=budget){
      if(!this._autoBudgetNoted){this._autoBudgetNoted=true;
        this.feedSep('auto-enrich budget reached');
        this.feedLine('done','Stopped enriching on its own after '+budget+' page'+(budget!==1?'s':'')+'. Hit Research to keep going.');}
      this._autoEnriched.add(id); return;
    }
    this._autoEnriched.add(id);this._autoEnrichCount++;
    this.feedSep('self-enrich · '+this.labelOf(id)+' · '+this._autoEnrichCount+'/'+budget);
    this.feedLine('search','Thinly sourced — enriching '+this.labelOf(id)+' without being asked ('+this._autoEnrichCount+' of '+budget+').');
    this.research();
  }
  pageTitle(url){const p=this.pageOf(url);return p?p.title:this.short(url);}
  topEntity(){const es=[...this.graph.entities.values()].filter(e=>this.showable(e.id));es.sort((a,b)=>this.weightOf(b)-this.weightOf(a));return es.length?es[0].id:null;}
  tfURL(url,sentence){const base=(url||'').split('#')[0];const w=this.norm(sentence).split(/\s+/);const enc=s=>encodeURIComponent(s).replace(/-/g,'%2D');const frag=w.length>9?(enc(w.slice(0,5).join(' '))+','+enc(w.slice(-5).join(' '))):enc(this.norm(sentence));return base+'#:~:text='+frag;}
  bandOf(i){const s=this.master.sentences[i]||'';if(/\b(reported|found|shows?|showed|according to|documented|recorded|stated|said|confirmed|revealed|disclosed|testified|filing|records? show|measured|observed)\b/i.test(s))return 'eva';if(/\b(will|shall|must|plan|propose|intend|create|establish|develop|aim|seek|commit|adopt|launch|require|recommend|expand|implement)\b/i.test(s))return 'def';return 'held';}
  frontier(id){const items=[];const e=this.graph.entities.get(id);if(!e)return items;const srcs=this.sourcesOf(id);
    for(const v of this.graph.voids.filter(v=>v.node===id))items.push({kind:'void',score:3.0,label:'Confirm or deny — '+(v.rel?('no '+v.rel):'asserted absence'),query:(this.labelOf(id)+' '+(v.rel||'')).trim()});
    const byRel=new Map();for(const ed of this.edgesOf(id)){const via=ed.relType||ed.via||ed.kind;if(this.junkRel(via))continue;const o=ed.from===id?ed.to:ed.from;if(this.isURLish(this.labelOf(o)))continue;if(!byRel.has(via))byRel.set(via,new Set());byRel.get(via).add(o);}
    for(const [via,tg] of byRel){if(tg.size>1&&/own|chair|lead|address|head|director|operate|manage|approv|fund/i.test(via))items.push({kind:'conflict',score:2.6,label:'Adjudicate — '+via+' → '+[...tg].map(x=>this.labelOf(x)).slice(0,2).join(' vs '),query:this.labelOf(id)+' '+via});}
    const dep=2.4-0.5*Math.max(0,srcs.length-1);if(dep>=1.0)items.push({kind:'deepen',score:dep,label:'Thinly sourced — only '+srcs.length+' source'+(srcs.length!==1?'s':''),query:this.labelOf(id)});
    return items.sort((a,b)=>b.score-a.score).slice(0,6);}

  feedLine(k,t){const e=this._feedEnt!=null?this._feedEnt:null;this.setState(s=>({feed:[...s.feed,{k,t,ent:e}]}));}
  feedSep(t){const e=this._feedEnt!=null?this._feedEnt:null;this.setState(s=>({feed:[...s.feed,{sep:t,ent:e}]}));}
  sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  // ---- location/history: each entry is {t:'web',url} or {t:'ent',id} ----
  _locEq(a,b){return a&&b&&a.t===b.t&&(a.t==='web'?a.url===b.url:a.id===b.id);}
  _pushLoc(loc){this._ensureTabs();let h=(this._hist||[]);let p=(this._hpos==null?-1:this._hpos);if(this._locEq(h[p],loc)){this._syncActiveBrowse();return;}h=h.slice(0,p+1);h.push(loc);this._hist=h;this._hpos=h.length-1;this._syncActiveBrowse();}
  _applyLoc(loc){if(!loc)return;if(loc.t==='web'){this.setState(s=>({selId:null,viewUrl:loc.url,panelSel:null,hoverSrc:null,pinSrc:null,hoverEnt:null,newTabOpen:false,histRev:(s.histRev||0)+1}));this.loadCenter(loc.url);}else{this.setState(s=>({selId:loc.id,viewUrl:null,panelSel:null,hoverSrc:null,pinSrc:null,hoverEnt:null,newTabOpen:false,histRev:(s.histRev||0)+1}));}this._syncPos();}
  // ---- Independent, browser-like tabs. Every open tab is one of three kinds:
  //   'browse' — a website / entity, with its OWN back-forward history (hist/hpos) and its
  //              own reader-vs-native viewMode.
  //   'chat'   — a chat thread (chatId).
  //   'new'    — a blank tab showing the new-tab landing (pick chat / website / reader).
  // The ACTIVE tab's browse history is mirrored into this._hist/_hpos and its render mode into
  // state.viewMode, so all existing navigation keeps working untouched; switching tabs saves
  // those into the outgoing tab and restores them from the incoming one. Tabs live only in
  // memory (like the old history), so a reload starts fresh.
  _tabId(){this._tabN=(this._tabN||0)+1;return 't'+this._tabN;}
  _ensureTabs(){
    if(this._tabs&&this._tabs.length)return;
    const hist=this._hist||[];const hpos=(this._hpos==null?hist.length-1:this._hpos);
    let kind='new',chatId=null;
    if(this.state.activeChat){kind='chat';chatId=this.state.activeChat;}
    else if(hist.length){kind='browse';}
    const id=this._tabId();
    this._tabs=[{id,kind,hist,hpos,viewMode:this.state.viewMode||'native',chatId}];
    this._activeTab=id;
  }
  _liveTab(){this._ensureTabs();return this._tabs.find(t=>t.id===this._activeTab)||null;}
  _activeTabKind(){const t=this._tabs&&this._tabs.find(x=>x.id===this._activeTab);return t?t.kind:'new';}
  // Write the live navigation state back into the active tab (called before leaving it).
  _saveLive(){const t=this._tabs&&this._tabs.find(x=>x.id===this._activeTab);if(!t)return;t.hist=this._hist||[];t.hpos=(this._hpos==null?-1:this._hpos);t.viewMode=this.state.viewMode||'native';}
  // A browse navigation just happened on the active tab — make it a browse tab and capture it.
  _syncActiveBrowse(){const t=this._liveTab();if(!t)return;t.kind='browse';t.chatId=null;t.hist=this._hist||[];t.hpos=(this._hpos==null?-1:this._hpos);t.viewMode=this.state.viewMode||'native';}
  // Keep the active tab's history position current (after back / forward) so its chip label is right.
  _syncPos(){const t=this._tabs&&this._tabs.find(x=>x.id===this._activeTab);if(t){t.hpos=(this._hpos==null?-1:this._hpos);t.hist=this._hist||[];}}
  // Switch to a tab: save the outgoing one, then project the incoming tab into live state.
  _activateTab(id){
    if(id!==this._activeTab)this._saveLive();
    const t=this._tabs.find(x=>x.id===id);if(!t)return;
    this._activeTab=id;this._pageUrl=null;
    this._hist=t.hist||[];this._hpos=(t.hpos==null?this._hist.length-1:t.hpos);
    const patch={viewMode:t.viewMode||'native',panelSel:null,panelLens:null,hoverSrc:null,pinSrc:null,hoverEnt:null,previewWiki:null,histRev:(this.state.histRev||0)+1};
    if(t.kind==='chat'){this.setState({...patch,activeChat:t.chatId,viewUrl:null,selId:null,newTabOpen:false});return;}
    if(t.kind==='new'){this.setState({...patch,activeChat:null,viewUrl:null,selId:null,newTabOpen:true});return;}
    const loc=(this._hpos>=0&&this._hist)?this._hist[this._hpos]:null;
    if(loc&&loc.t==='web'){this.setState({...patch,activeChat:null,viewUrl:loc.url,selId:null,newTabOpen:false},()=>this.loadCenter(loc.url));}
    else if(loc&&loc.t==='ent'){this.setState({...patch,activeChat:null,viewUrl:null,selId:loc.id,newTabOpen:false});}
    else{this.setState({...patch,activeChat:null,viewUrl:null,selId:null,newTabOpen:true});}
  }
  // Route a chat into a tab: reuse the tab already hosting it, else convert a blank new tab,
  // else open a fresh chat tab. Live nav state (browse hist) is parked on the outgoing tab.
  _chatTab(chatId){
    this._ensureTabs();this._saveLive();
    const existing=this._tabs.find(t=>t.kind==='chat'&&t.chatId===chatId);
    if(existing){this._activeTab=existing.id;}
    else{const t=this._tabs.find(x=>x.id===this._activeTab);
      if(t&&t.kind==='new'){t.kind='chat';t.chatId=chatId;t.hist=[];t.hpos=-1;}
      else{const id=this._tabId();this._tabs.push({id,kind:'chat',hist:[],hpos:-1,viewMode:this.state.viewMode||'native',chatId});this._activeTab=id;}}
    this._hist=[];this._hpos=-1;this._pageUrl=null;
  }
  // Opening an entity full takes over the centre column, so it closes any active chat the
  // same way navigating to a page does (see goWeb / doReadUrl). Otherwise the chat would keep
  // filling <main> and the centre-fill guard in the view-model would suppress the explorer.
  selectEntity(id){if(this.state.viewUrl)this._srcUrl=this.state.viewUrl;this._panelStack=[];this._pushLoc({t:'ent',id});this.setState(s=>({selId:id,viewUrl:null,panelSel:null,hoverSrc:null,pinSrc:null,hoverEnt:null,activeChat:null,newTabOpen:false,gz:{k:1,x:0,y:0},histRev:(s.histRev||0)+1}));}
  _scrollPanelTop(){requestAnimationFrame(()=>{const a=document.getElementById('eo-panel-scroll');if(a)a.scrollTop=0;});}
  clickEntity(id){if(this._gzMoved)return;const cur=this.state.panelSel;if(cur&&cur!==id)this._panelStack.push(cur);
    const patch={panelSel:id,rightOpen:true,panelLens:null,gz:{k:1,x:0,y:0}};
    // Show the entity without losing the chat or the source. On a phone that means jumping
    // to the entity pane (otherwise nothing would appear). On desktop, when a chat is open,
    // free up width by collapsing the sources rail so source · chat · entity all fit — the
    // "double panel" beside the document.
    if(this.phone())patch.pane='spine';
    else if(this.activeChatObj())patch.leftOpen=false;
    this.setState(patch);this._highlightFirst(id);this._scrollPanelTop();}
  closePanelSel(){this._panelStack=[];this.setState({panelSel:null});}
  panelBack(){if(this._panelStack&&this._panelStack.length){const prev=this._panelStack.pop();this.setState({panelSel:prev,panelLens:null,gz:{k:1,x:0,y:0}});if(this._highlightFirst)this._highlightFirst(prev);this._scrollPanelTop();}else this.closePanelSel();}
  // ── source toggles: mute a source so it stops feeding the record, re-project live ──
  muteSrc(url){if(this._muted.has(url))this._muted.delete(url);else this._muted.add(url);try{localStorage.setItem('eo_muted',JSON.stringify([...this._muted]));}catch(e){}this.rebuild(this.state.pages);this.setState(s=>({rev:s.rev+1}));}
  // The sources a given entity's profile is actually drawing on, plus any muted globally
  // (so they can be brought back). Each carries the count of lines it contributes here.
  sourcePanel(id){
    const mentions=this.mentionsOf(id);
    const active=this.sourcesOf(id).map(u=>{const p=this.pageOf(u),c=this.hashColor(this.short(u));
      const lines=mentions.filter(i=>this.master.sentenceSource[i]===u).length;
      return {url:u,host:this.short(u),title:p?this.truncLabel(p.title,44):this.short(u),srcId:this.srcId(u),
        lineLabel:lines+' line'+(lines!==1?'s':''),learned:!!(p&&p.via==='REAFFERENCE'),
        dotStyle:'width:24px;height:24px;flex:0 0 auto;border-radius:7px;background:'+c+'1a;color:'+c+';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;cursor:pointer;',
        toggleStyle:'flex:0 0 auto;width:30px;height:17px;border-radius:9px;padding:2px;cursor:pointer;background:var(--acc);display:flex;justify-content:flex-end;align-items:center;',
        knobStyle:'width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);',
        onMute:()=>this.muteSrc(u),onOpen:()=>this.goWeb(u)};});
    const hidden=this.state.pages.filter(p=>this._muted.has(p.url)).map(p=>({url:p.url,host:this.short(p.url),title:this.truncLabel(p.title,44),onRestore:()=>this.muteSrc(p.url)}));
    return {active,hasActive:active.length>0,count:active.length,hidden,hasHidden:hidden.length>0,hiddenCount:hidden.length};
  }
  // ── graph pan/zoom (the "web") ──────────────────────────────────────────────
  gzReset(){this.setState({gz:{k:1,x:0,y:0}});}
  gzZoom(factor,px,py){this.setState(s=>{const g=s.gz||{k:1,x:0,y:0};const vb=this._gvb||{x:0,y:0,w:300,h:232};const k=Math.max(0.6,Math.min(4,g.k*factor));const cx=(px==null?vb.x+vb.w/2:px),cy=(py==null?vb.y+vb.h/2:py);const r=k/g.k;return {gz:{k,x:cx-(cx-g.x)*r,y:cy-(cy-g.y)*r}};});}
  _gzWheel=(e)=>{
    // Don't hijack the page's scroll — zoom only when the user deliberately holds ⌘/Ctrl.
    // A plain scroll over the graph just scrolls the panel like everything else.
    if(!(e.ctrlKey||e.metaKey))return;
    e.preventDefault();const svg=e.currentTarget;const r=svg.getBoundingClientRect();if(!r.width)return;
    const vb=this._gvb||{x:0,y:0,w:300,h:232};
    const vx=vb.x+(e.clientX-r.left)/r.width*vb.w,vy=vb.y+(e.clientY-r.top)/r.height*vb.h;
    this.gzZoom(e.deltaY<0?1.1:1/1.1,vx,vy);};
  // Pan via window listeners — NOT pointer capture. Capturing the pointer on the <svg>
  // stole the gesture from the node <g>, so clicking a node never fired its onClick.
  gzDown(e){if(e.button&&e.button!==0)return;const sx=e.clientX,sy=e.clientY,ox=(this.state.gz||{}).x||0,oy=(this.state.gz||{}).y||0,w=(e.currentTarget.getBoundingClientRect().width)||300;this._gzMoved=false;
    const move=(ev)=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;
      // Ignore tiny movement so a click on a node isn't swallowed as a pan, and the
      // graph never nudges from hand-jitter. Only start panning past a real drag.
      if(!this._gzMoved&&Math.abs(dx)+Math.abs(dy)<=7)return;this._gzMoved=true;
      const sc=((this._gvb&&this._gvb.w)||300)/w;this.setState(s=>({gz:{...(s.gz||{k:1,x:0,y:0}),x:ox+dx*sc,y:oy+dy*sc}}));};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);this._gzDrag=false;this.forceUpdate();setTimeout(()=>{this._gzMoved=false;},30);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);this._gzDrag=true;}
  // ── side-panel drag-to-resize ───────────────────────────────────────────────
  // Both handles setState on every move (the layout engine rebuilds the whole grid
  // string from state) rather than poking grid.style directly — the old shortcut only
  // knew the 3-column layout and would clobber the chat column once it exists.
  onResizeDown(e){e.preventDefault();const startX=e.clientX,startW=this.state.panelW||380;let cur=startW;
    const move=(ev)=>{let w=startW+(startX-ev.clientX);w=Math.max(300,Math.min(820,Math.round(w)));if(w!==cur){cur=w;this.setState({panelW:w});}};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);document.body.style.cursor='';document.body.style.userSelect='';if(cur!==startW){try{localStorage.setItem('eo_panelw',String(cur));}catch(e){}this.setState({panelW:cur});}};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);document.body.style.cursor='col-resize';document.body.style.userSelect='none';}
  onResizeReset(){try{localStorage.setItem('eo_panelw','380');}catch(e){}this.setState({panelW:380});}
  onChatResizeDown(e){e.preventDefault();const startX=e.clientX,startW=this.state.chatW||420;let cur=startW;
    const move=(ev)=>{let w=startW+(startX-ev.clientX);w=Math.max(320,Math.min(640,Math.round(w)));if(w!==cur){cur=w;this.setState({chatW:w});}};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);document.body.style.cursor='';document.body.style.userSelect='';if(cur!==startW){try{localStorage.setItem('eo_chatw',String(cur));}catch(e){}this.setState({chatW:cur});}};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);document.body.style.cursor='col-resize';document.body.style.userSelect='none';}
  onChatResizeReset(){try{localStorage.setItem('eo_chatw','420');}catch(e){}this.setState({chatW:420});}
  toggleSwap(){const v=!this.state.swapped;try{localStorage.setItem('eo_swap',v?'1':'0');}catch(e){}this.setState({swapped:v});}
  // ── layout presets ────────────────────────────────────────────────────────
  // Presets are one-click setters of the open flags + chat. The active preset is DERIVED
  // by comparing flags (activePreset), never stored — so a manual toggle can't desync it.
  applyPreset(name){
    // The top-bar preset is also the MODE switch: entering Research arms the chat to chase
    // topics through fresh sources; leaving it (Focus / Read) disarms it back to grounded chat.
    if(name==='focus'){    this.setState({leftOpen:false,rightOpen:false,researchMode:false}); this.closeChat(); return; }
    if(name==='read'){     this.setState({leftOpen:false,rightOpen:true,researchMode:false});  this.closeChat(); return; }
    if(name==='research'){ this.setState({leftOpen:false,rightOpen:true,researchMode:true}); if(!this.activeChatObj()) this.newChat(this.state.viewUrl||null); return; }
  }
  activePreset(){const L=this.state.leftOpen,R=this.state.rightOpen,C=!!this.activeChatObj();
    if(!L&&!R&&!C)return 'focus'; if(!C&&R&&!L)return 'read'; if(C&&R&&!L)return 'research'; return null;}
  // Toolbar chat toggle: open a chat (scoped to the page if one is open) or close it.
  // The header Chat button opens a NET-NEW space — not silently scoped to whatever page is
  // open. Tag "everything" or pick sources from there. ("Ask about this page" (the FAB) and
  // the per-source Chat buttons still open a chat pre-scoped to that source, by intent.)
  onToggleChat(){ if(this.activeChatObj()) this.closeChat(); else this.newChat(null); }
  // ── memory log: every source read into memory, with totals ────────────────────
  memoryLog(){
    if(!this.master)return {rows:[],hasRows:false,statLine:'',empty:true};
    const fmt=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    const rows=this.state.pages.map(p=>{const muted=this._muted.has(p.url),c=this.hashColor(this.short(p.url));
      const lines=muted?0:this.master.sentenceSource.filter(u=>u===p.url).length;
      return {url:p.url,srcId:muted?'—':this.srcId(p.url),title:this.truncLabel(p.title||this.short(p.url),58),host:this.short(p.url),
        lineLabel:(muted?'muted':lines+' line'+(lines!==1?'s':'')),via:(p.via==='REAFFERENCE'?'researched':'opened'),when:fmt(p.ts),muted,
        dot:'width:28px;height:28px;flex:0 0 auto;border-radius:8px;background:'+c+(muted?'12':'1a')+';color:'+c+';display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;'+(muted?'opacity:.55;':''),
        toggleStyle:'flex:0 0 auto;width:32px;height:18px;border-radius:10px;padding:2px;cursor:pointer;display:flex;align-items:center;background:'+(muted?'#cfd3da':'var(--acc)')+';justify-content:'+(muted?'flex-start':'flex-end')+';',
        knobStyle:'width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);',
        onOpen:()=>{this.setState({memOpen:false});this.goWeb(p.url);},onToggle:()=>this.muteSrc(p.url)};});
    const ns=this.master.pages.length,nl=this.master.sentences.length,ne=this.graph?this.graph.entities.size:0;
    return {rows,hasRows:rows.length>0,empty:rows.length===0,
      statLine:ns+' source'+(ns!==1?'s':'')+' · '+nl+' lines · '+ne+' entities'};
  }
  // The actual EO notation logged into memory — the SVO propositions on every bond.
  _safeJson(o){try{return JSON.stringify(o,(k,v)=>v===undefined?null:v,2);}catch(e){return String((e&&e.message)||e);}}
  memoryNotation(){
    if(!this.master||!this.graph)return {rows:[],count:0,shown:0};
    const GRAINC={Ground:'#2f6f9e',Figure:'#b06f2a',Pattern:'#2f7d54'};
    const seen=new Set(),rows=[];
    for(const e of this.graph.edges){
      if(e.from===e.to)continue;
      if(this.isURLish(this.labelOf(e.from))||this.isURLish(this.labelOf(e.to)))continue;
      const t=this.edgeTriple(e),k=t.s+'|'+t.v+'|'+t.o+'|'+(t.sent==null?'':t.sent);
      if(seen.has(k))continue;seen.add(k);
      const i=rows.length,gc=GRAINC[t.grain]||'#6b7280',exp=(this.state.memExpand===i);
      const ev=(e.seq!=null&&this.master.events[e.seq])||null;
      const u=t.sent!=null?this.master.sentenceSource[t.sent]:null;
      rows.push({idx:i,s:t.s,o:t.o,rel:t.rel,eot:t.eot,src:t.src||'',grain:t.grain,conf:t.conf.toFixed(2),
        expanded:exp,caret:(exp?'▾':'▸'),
        json:exp?this._safeJson({edge:{from:e.from,to:e.to,via:e.via,relType:e.relType,kind:e.kind,op:e.op,seq:e.seq,sentIdx:e.sentIdx,weight:e.weight,grain:e.grain,confidence:e.confidence,polarity:e.polarity,modality:e.modality,reader:e.reader},event:ev,source:u,sentence:t.sent!=null?this.master.sentences[t.sent]:null}):'',
        hasSrc:!!u,onOpenSrc:u?(()=>{this.setState({memOpen:false});this.openSource(u);}):(()=>{}),
        grainStyle:'font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:'+gc+';background:'+gc+'18;border-radius:4px;padding:1px 5px;flex:0 0 auto;',
        srcStyle:'font-size:9px;font-weight:800;color:var(--ink3);flex:0 0 auto;min-width:24px;',
        onToggle:()=>this.setState(s=>({memExpand:s.memExpand===i?null:i}))});
    }
    return {rows:rows.slice(0,600),count:rows.length,shown:Math.min(600,rows.length)};
  }
  // ── Full audit export ────────────────────────────────────────────────────
  // Everything in memory, uncapped, in one self-describing JSON file. The modal
  // tabs only ever *show* a window (sources collapse muted lines; EO notation
  // caps at 600 rows) — for auditing we dump the whole thing: every source
  // (muted included), every proposition with its raw logged edge/event/source,
  // and every entity. No truncation, no slicing.
  _auditProps(){
    if(!this.master||!this.graph)return [];
    const seen=new Set(),out=[];
    for(const e of this.graph.edges){
      if(e.from===e.to)continue;
      if(this.isURLish(this.labelOf(e.from))||this.isURLish(this.labelOf(e.to)))continue;
      const t=this.edgeTriple(e),k=t.s+'|'+t.v+'|'+t.o+'|'+(t.sent==null?'':t.sent);
      if(seen.has(k))continue;seen.add(k);
      const ev=(e.seq!=null&&this.master.events[e.seq])||null;
      const u=t.sent!=null?this.master.sentenceSource[t.sent]:null;
      out.push({eot:t.eot,subject:t.s,relation:t.rel,object:t.o,grain:t.grain,
        confidence:t.conf,negated:!!t.neg,irrealis:!!t.irr,speech:!!t.speech,reader:t.reader,
        srcId:t.src||null,sourceUrl:u||null,sentenceIdx:(t.sent!=null?t.sent:null),
        sentence:(t.sent!=null?this.master.sentences[t.sent]:null),
        edge:{from:e.from,to:e.to,via:e.via,relType:e.relType,kind:e.kind,op:e.op,seq:e.seq,sentIdx:e.sentIdx,weight:e.weight,grain:e.grain,confidence:e.confidence,polarity:e.polarity,modality:e.modality,reader:e.reader},
        event:ev});
    }
    return out;
  }
  exportMemory(){
    try{
      const fmt=ts=>{try{return new Date(ts).toISOString();}catch(e){return null;}};
      const sources=this.state.pages.map(p=>{const muted=this._muted.has(p.url);
        const lines=this.master?this.master.sentenceSource.filter(u=>u===p.url).length:0;
        return {srcId:muted?null:this.srcId(p.url),url:p.url,title:p.title||this.short(p.url),host:this.short(p.url),
          lines,via:(p.via==='REAFFERENCE'?'researched':'opened'),readAt:fmt(p.ts),muted};});
      const entities=[];
      if(this.graph)for(const e of this.graph.entities.values()){
        const l=this.labelOf(e.id);if(this.isURLish(l))continue;
        entities.push({id:e.id,label:l,mentions:(this.mentionsOf?this.mentionsOf(e.id).length:undefined)});
      }
      const props=this._auditProps();
      const payload={
        kind:'eoreader-memory-audit',version:1,
        exportedAt:fmt(Date.now()),
        stats:{sources:this.master?this.master.pages.length:0,lines:this.master?this.master.sentences.length:0,
          entities:this.graph?this.graph.entities.size:0,propositions:props.length},
        sources,propositions:props,entities,
        events:(this.master&&this.master.events)?this.master.events:[],
        sentences:(this.master&&this.master.sentences)?this.master.sentences.map((t,i)=>({idx:i,source:this.master.sentenceSource[i]||null,text:t})):[]
      };
      const json=this._safeJson(payload);
      const stamp=(payload.exportedAt||'').replace(/[:.]/g,'-').replace('T','_').slice(0,19);
      const name='eo-memory-audit'+(stamp?'_'+stamp:'')+'.json';
      try{
        const blob=new Blob([json],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=name;
        document.body.appendChild(a);a.click();
        setTimeout(()=>{try{document.body.removeChild(a);URL.revokeObjectURL(url);}catch(e){}},0);
      }catch(e){
        // No DOM download path (older/embedded host) — fall back to a data URI.
        const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(json);a.download=name;a.click();
      }
    }catch(e){try{console.error('exportMemory failed',e);}catch(_){}}
  }
  previewVals(){const p=this.state.previewWiki;if(!p)return null;
    return {title:p.title,loading:!!p.loading&&!p.extract,err:!!p.err,
      extract:p.extract||'',hasExtract:!!(p.extract&&p.extract.length>0),
      desc:p.desc||'',hasDesc:!!p.desc,url:p.url||p.href,
      av:this.initials(p.title),avStyle:this.avatar(p.title,34),
      onClose:()=>this.closePreview(),
      onOpen:()=>{const u=p.url||p.href;this.closePreview();this.goWeb(u);},
      onRead:()=>{const u=p.url||p.href;this.closePreview();this.goWeb(u);}};}
  toggleRight(){this.setState(s=>({rightOpen:!s.rightOpen}));}
  _highlightFirst(id){this._scrollToText(this.labelOf(id));}
  _scrollToText(text){try{const ifr=document.querySelector('iframe[data-eo-center]');const d=ifr&&ifr.contentDocument;if(!d||!d.body||!text)return;
    // Match against whole-block text, not individual text nodes: entity decoration wraps
    // mentions in <span>, splitting a sentence across several text nodes — so a needle that
    // straddles a highlighted name never lives in one node. canon() folds smart quotes,
    // dashes and whitespace so engine-normalized sentences line up with the rendered text.
    const canon=s=>String(s||'').replace(/[\u2018\u2019\u201a\u201b]/g,"'").replace(/[\u201c\u201d\u201e]/g,'"').replace(/[\u2013\u2014\u2012]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
    const full=canon(text);if(!full)return;
    const leaves=[...d.body.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,figcaption,div')].filter(el=>!el.querySelector('p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption'));
    const find=len=>{const needle=full.slice(0,len);if(needle.length<8)return null;for(const el of leaves){if(canon(el.textContent).indexOf(needle)>=0)return el;}return null;};
    const el=find(80)||find(48)||find(28)||find(16);if(!el)return;
    const de=d.scrollingElement||d.documentElement;de.scrollTop=Math.max(0,el.getBoundingClientRect().top+de.scrollTop-80);
    const prev=el.style.backgroundColor;el.style.transition='background-color .4s';el.style.backgroundColor='rgba(91,52,214,.18)';setTimeout(()=>{el.style.backgroundColor=prev||'';},1400);
  }catch(e){}}
  // ── shared attributive record: every subject proposition as a quote, worn
  // in register grammar (reports / asserts / names), carrying its source and
  // the date read. Used by both the full-page profile and the side panel so
  // the two surfaces say the same thing the same way. ──────────────────
  provData(id){
    const subjIdx=this.subjectSentences(id);
    const REGV={eva:{verb:'reports',fg:'#1d4ed8',bg:'#e8eefc',gl:'\u25A0'},def:{verb:'asserts',fg:'#b45309',bg:'#fbf0db',gl:'\u25C6'},held:{verb:'names',fg:'#6b7280',bg:'#eef0f3',gl:'\u25CB'}};
    const active=this.state.pinSrc||this.state.hoverSrc;
    const fmtDate=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    const rows=subjIdx.map(i=>{const b=this.bandOf(i),u=this.master.sentenceSource[i],p=this.pageOf(u),R=REGV[b]||REGV.held,ch=this.chip(u,active===u);const who=this._sayer(this.master.sentences[i],this.labelOf(id));
      return {sortw:b==='eva'?0:(b==='def'?1:2),verb:R.verb,glyph:R.gl,who:who||'',hasWho:!!who,
        whoStyle:'display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--ink);background:#fff;border:1px solid var(--line2);border-radius:5px;padding:2px 7px;flex:0 0 auto;',
        regStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+R.fg+';background:'+R.bg+';border-radius:5px;padding:2px 8px;flex:0 0 auto;',
        srcId:this.srcId(u),host:this.short(u),when:p?fmtDate(p.ts):'',hasWhen:!!(p&&p.ts),
        txt:this.stripRefs(this.norm(this.master.sentences[i])),jumpUrl:this.tfURL(u,this.master.sentences[i]),
        onOpen:()=>this.openSource(u),onEnter:()=>this.setHover(u),onLeave:()=>this.setHover(null),chip:ch,
        rowStyle:'padding:10px 13px;border-top:1px solid var(--line);'+((active&&active!==u)?'opacity:.24;transition:opacity .14s;':'opacity:1;transition:opacity .14s;')};});
    rows.sort((a,b)=>a.sortw-b.sortw);
    const seenB={};subjIdx.forEach(i=>{seenB[this.bandOf(i)]=true;});
    const legend=['eva','def','held'].filter(b=>seenB[b]).map(b=>{const R=REGV[b];return {label:R.verb,glyph:R.gl,
      style:'display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:'+R.fg+';'};});
    return {rows,legend,hasLegend:legend.length>0,count:rows.length};
  }
  panelProfile(id,vu){
    const g=this.graph,lab=this.labelOf(id),e=g.entities.get(id),mentions=this.mentionsOf(id),nbrs=this.neighbors(id);
    const _genAnchor=this.isGenericConcept(id)?this.contextAnchor(id,vu):null;
    const occ=mentions.filter(i=>this.master.sentenceSource[i]===vu);
    const subjIdx=this.subjectSentences(id),evaIdx=subjIdx.filter(i=>this.bandOf(i)==='eva'),attested=evaIdx.map(i=>this.master.sentences[i]);
    const occList=occ.slice(0,6).map(i=>{const full=this.norm(this.master.sentences[i]);return {text:this.truncLabel(this.stripRefs(full),150),onGo:()=>this._scrollToText(full)};});
    const occMore=Math.max(0,occ.length-6);
    const wiki=this.wikiDef(id);
    // Three honest modes. DEFINITION: we have attested propositions or a
    // context-confirmed encyclopedia referent — render it as a definition, with
    // citations. QUOTE: no real definition, but a representative passage exists —
    // show it as a quote, attributed, not dressed up. VOID: nothing — name the edge.
    const cachedSum=this.state.summaries&&this.state.summaries[id],sumSig=this.summarySig(id);
    // Two readings, kept distinct. CONTEXT — what the term comes to mean from
    // everything we've read together: stitched from attested propositions, or,
    // failing that, composed from the most defining source sentences (sourceGist).
    // No model required. WIKIPEDIA — the general meaning, confirmed against the graph.
    // In context = grounded in the page you're reading. Compose from on-page
    // sentences first; only fall back to the cross-source reading when the term
    // does not appear on this page at all.
    let ctxDef=null,ctxKind='',ctxIdx=[];
    if(occ.length){const comp=this.composeOnPage(id,vu);if(comp){ctxDef=comp.text;ctxIdx=comp.idx||[];ctxKind=comp.kind;}}
    if(!ctxDef){
      if(attested.length){
        if(cachedSum&&cachedSum.sig===sumSig&&cachedSum.text){ctxDef=cachedSum.text;ctxKind=cachedSum.model?'synth':'stitch';}
        else{ctxDef=this.summaryFallback(attested);ctxKind='stitch';setTimeout(()=>this.ensureSummary(id,attested),0);}
      } else { const gist=this.sourceGist(id); if(gist){ctxDef=gist;ctxKind='gist';} }
    }
    // Cross-source reading: subject-role / defined sentences from sources OTHER than
    // the page in view. This is the channel research actually feeds, so it earns its
    // own block — visible only once you've read beyond the page in front of you.
    let crossDef=null,crossIdx=[],crossSrcN=0;
    {
      const otherSubj=this.subjectSentences(id).filter(i=>this.master.sentenceSource[i]&&this.master.sentenceSource[i]!==vu);
      const otherDef=(this.master.events||[]).filter(ev=>ev.op==='DEF'&&ev.key==='predicate'&&ev.value&&ev.sentIdx!=null&&this.graph.representative(ev.id)===id&&this.master.sentenceSource[ev.sentIdx]&&this.master.sentenceSource[ev.sentIdx]!==vu).map(ev=>ev.sentIdx);
      const pool=[...new Set([...otherDef,...otherSubj])];
      crossSrcN=new Set(pool.map(i=>this.master.sentenceSource[i]).filter(Boolean)).size;
      if(pool.length){
        const cd=this.bestDef(id,null);let lead=null;
        if(cd&&this.master.sentenceSource[cd.sentIdx]!==vu){lead=this.glossSentence(this.labelOf(id),cd.pred);if(lead)crossIdx.push(cd.sentIdx);}
        const r=this.rankCtx(id,otherSubj.filter(i=>!crossIdx.includes(i)));
        if(!lead&&r.length){lead=this.clean(this.master.sentences[r[0]]);crossIdx.push(r[0]);}
        else if(lead&&r.length){const sup=this.clean(this.master.sentences[r[0]]);if(sup&&lead.length+sup.length<=300){lead=lead+' '+sup;crossIdx.push(r[0]);}}
        if(lead)crossDef=this.endOnBoundary(lead,340);
      }
    }
    const hasCross=!!crossDef&&crossSrcN>0;
    const crossCites=hasCross?this.citeChips(crossIdx,{right:true}):[];
    const cites=(ctxKind==='stitch'||ctxKind==='synth')?this.citeChips(evaIdx,{right:true}):((ctxKind==='page'&&ctxIdx.length)?this.citeChips(ctxIdx,{right:true}):[]);
    const wikiText=(wiki&&wiki.confirmed&&wiki.text)?wiki.text:null;
    const wikiUrl=wikiText?wiki.url:null,wikiTitle=wikiText?wiki.title:null;
    if(!wiki&&(this.looksProperNoun(lab)||this.isGenericConcept(id)))this.ensureWiki(id);
    let rep=null; if(!ctxDef&&!wikiText){rep=this.repQuote(id);}
    const ctxLabel=ctxKind==='page'?'From this page':(ctxKind==='pageMention'?'As used on this page — not yet defined':(ctxKind==='synth'?'Synthesized from your sources':(ctxKind==='stitch'?'Stitched from your sources':(ctxKind==='gist'?'Composed from your sources — not yet attested':''))));
    const ctxHeading=(ctxKind==='page'||ctxKind==='pageMention')?"In context · on this page":"In context · what we've learned together";
    // PROMOTE after research. Once this entity has been researched, the new sources are
    // what the reader asked for — so lead the IN CONTEXT block with the cross-source
    // reading (what those sources add) and demote the on-page line to the block below.
    // Only swaps when there IS cross-source content and the lead is currently page-pinned;
    // when the entity isn't on this page, ctxDef already carries the cross-source stitch.
    const _researched=!!(this.state.researched&&this.state.researched[id]);
    const promote=_researched&&hasCross&&(ctxKind==='page'||ctxKind==='pageMention');
    const crossHeading=promote?"In context · what we've learned together":'In context · across your sources';
    const crossLabel=promote?('Across '+crossSrcN+' source'+(crossSrcN!==1?'s':'')+' beyond this page'):(crossSrcN+' other source'+(crossSrcN!==1?'s':''));
    let leadDef=ctxDef,leadHeading=ctxHeading,leadLabel=ctxLabel,leadCites=cites,
        subDef=crossDef,subHas=hasCross,subHeading=crossHeading,subLabel=crossLabel,subCites=crossCites;
    if(promote){
      leadDef=crossDef;leadHeading=crossHeading;leadLabel=crossLabel;leadCites=crossCites;
      subDef=ctxDef;subHas=!!ctxDef;subHeading=ctxHeading;subLabel=ctxLabel;subCites=cites;
    }
    const pd=this.provData(id),pOpen=!!this.state.panelProvOpen;
    // Connected entities — the graph already ranks neighbors by bond weight and carries
    // the relation(s) on each edge. Surface the top ones as a pivotable list so the
    // "N links" stat isn't a dead number: every neighbor is one click to its own profile.
    const nbrShown=nbrs.filter(n=>!this.isURLish(this.labelOf(n.id))).slice(0,7);
    const links=nbrShown.map(n=>{const nl=this.labelOf(n.id),rel=(n.vias&&n.vias[0])?this.norm(n.vias[0]):'';
      return {id:n.id,label:this.truncLabel(nl,30),av:this.initials(nl),avStyle:this.avatar(nl,22),
        rel:rel?('— '+this.truncLabel(rel,24)+' →'):'linked',llm:!!n.llm,
        onClick:()=>this.clickEntity(n.id),onEnter:ev=>this.entHover(n.id,ev),onLeave:()=>this.entLeave()};});
    const linksMore=Math.max(0,nbrs.filter(n=>!this.isURLish(this.labelOf(n.id))).length-nbrShown.length);
    const lr=this.state.liveResearch||{},researching=!!(lr.on&&lr.focal===id),justDone=(!lr.on&&lr.focal===id&&lr.phase==='done');
    const researchMsg=researching?(lr.phase==='read'?('Reading '+(lr.host||'a new source')+'…'):('Searching the web for more on '+lab+'…')):(justDone?((lr.addedFocal>0)?('Added '+lr.addedFocal+' new line'+(lr.addedFocal!==1?'s':'')+' about '+lab+(lr.srcFocal>0?(' · +'+lr.srcFocal+' source'+(lr.srcFocal!==1?'s':'')):'')+'.'):('Read '+(lr.added||0)+' lines into memory — but nothing new about '+lab+' yet. The new sources were about something else.')):'');
    const webViz=this.egoGraphMini(id,nbrs);
    const lens=this.lensBlock(id,vu,leadDef,leadCites);
    return {name:lab,av:this.initials(lab),avStyle:this.avatar(lab,40),avStyleSm:this.avatar(lab,30),
      webViz:webViz, hasWeb:!!webViz, webMeta:nbrs.filter(n=>!this.isURLish(this.labelOf(n.id))).length+' connected', lens:lens,
      srcList:this.sourcePanel(id),
      gzLabel:Math.round(((this.state.gz&&this.state.gz.k)||1)*100)+'%',
      onGzIn:()=>this.gzZoom(1.25),onGzOut:()=>this.gzZoom(1/1.25),onGzReset:()=>this.gzReset(),
      contextual:!!_genAnchor, contextAnchorLabel:_genAnchor?this.labelOf(_genAnchor):'', onContextAnchor:_genAnchor?(()=>this.clickEntity(_genAnchor)):(()=>{}),
      hasCtx:!!leadDef, ctxDef:leadDef||'', ctxHeading:leadHeading,
      hasCtxLabel:!!leadLabel, ctxLabel:leadLabel,
      ctxBadgeStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--ink3);background:var(--app);border:1px solid var(--line2);border-radius:6px;padding:2px 7px;',
      cites:leadCites,hasCites:leadCites.length>0,
      hasCross:subHas,crossDef:subDef||'',crossHeading:subHeading,
      crossLabel:subLabel,
      crossCites:subCites,hasCrossCites:subCites.length>0,
      hasWikiDef:!!wikiText, wikiText:wikiText||'', wikiUrl:wikiUrl, wikiTitle:wikiTitle,
      isQuote:!!rep, isVoid:!ctxDef&&!wikiText&&!rep,
      rep:rep||{text:'',srcId:'',host:'',when:'',hasWhen:false,jumpUrl:'',onOpen:()=>{},onGo:()=>{}},
      researching:researching,researchMsg:researchMsg,showResearch:researching||justDone,
      prov:pd, provHas:pd.count>0, provEmpty:pd.count===0, provOpenHas:pd.count>0&&pOpen,
      provCaret:pOpen?'\u25BE':'\u25B8', provToggleLabel:pOpen?'hide provenance':'trace provenance',
      onToggleProv:()=>this.setState(s=>({panelProvOpen:!s.panelProvOpen})),
      provIntro:'Each line is a quote — who said it, and when. The meaning above is my fold of these; if it goes past them, they win.',
      provVoid:'I have not read anything that defines \u201C'+lab+'\u201D. It has been named, not described.',
      stat:(e&&e.sightings||mentions.length)+' mentions · '+nbrs.length+' links',
      occCount:occ.length,occ:occList,hasOcc:occList.length>0,occMore:occMore,hasOccMore:occMore>0,
      links:links,hasLinks:links.length>0,linksCount:nbrs.filter(n=>!this.isURLish(this.labelOf(n.id))).length,linksMore:linksMore,hasLinksMore:linksMore>0,
      onOpenFull:()=>this.selectEntity(id),onExpand:()=>this.selectEntity(id),onBack:()=>this.panelBack(),
      backLabel:(this._panelStack&&this._panelStack.length)?'\u2039 Back':'\u2039 Entities',
      backTitle:(this._panelStack&&this._panelStack.length)?('Back to '+this.truncLabel(this.labelOf(this._panelStack[this._panelStack.length-1])||'previous',24)):'Back to the entity list',
      askIdle:!researching&&!this._busy,
      askSub:'I won\u2019t add sources on my own \u2014 choose how to look.',
      onAskBreadth:()=>{this.setState({mode:'breadth'});this.research(id,'breadth');},
      onAskDepth:()=>{this.setState({mode:'depth'});this.research(id,'depth');},
      onAskResearch:()=>{this.research(id,this.state.mode||'breadth');}};
  }
  goWeb(url){url=this.norm(url);if(!/^[a-z]+:/i.test(url))url='https://'+url;this._srcUrl=null;this._pushLoc({t:'web',url});this.setState(s=>({viewUrl:url,selId:null,panelSel:null,panelLens:null,panelMode:'overview',hoverSrc:null,pinSrc:null,hoverEnt:null,activeChat:null,newTabOpen:false,histRev:(s.histRev||0)+1}));this.loadCenter(url);if(this.state.detect)this.processPage(url);}
  processPage(url){if(this._busy)return;if(this.state.pages.find(p=>p.url===url||p.url==='https://'+url))return;this._busy=true;this._feedEnt=null;this.setState({busy:true});this.feedSep('reading a URL');this.readURL(url,'read').then(res=>{if(res)this.feedLine('read','Read “'+res.title+'” · '+(res.propCount!=null?res.propCount:res.sentenceCount)+' propositions');this._busy=false;this.setState({busy:false});
    // Now that the page is read it has propositions — re-render the open view in the
    // chosen mode (reader book, or the native page with its contents + flagged passages),
    // swapping out the raw live page it was first shown as while reading.
    if(res&&res.url&&this.state.viewUrl===res.url)this.loadCenter(res.url);});}
  toggleDetect(){this.setState(s=>({detect:!s.detect}));}
  canBack(){return !!(this._hist&&this._hpos>0);}
  canForward(){return !!(this._hist&&this._hpos<this._hist.length-1);}
  goBack(){if(this.canBack()){this._hpos--;this._applyLoc(this._hist[this._hpos]);}}
  goForward(){if(this.canForward()){this._hpos++;this._applyLoc(this._hist[this._hpos]);}}
  // Close a tab by id. Closing the active one activates its left neighbour; closing the last
  // tab leaves a fresh blank tab so the strip is never empty.
  closeTab(id){this._ensureTabs();const i=this._tabs.findIndex(t=>t.id===id);if(i<0)return;const wasActive=(id===this._activeTab);
    if(wasActive)this._activeTab=null;
    this._tabs.splice(i,1);
    if(!this._tabs.length){const nid=this._tabId();this._tabs.push({id:nid,kind:'new',hist:[],hpos:-1,viewMode:this.state.viewMode||'native',chatId:null});this._activateTab(nid);return;}
    if(wasActive){const ni=Math.max(0,i-1);this._activateTab(this._tabs[ni].id);}else{this.setState(s=>({histRev:(s.histRev||0)+1}));}}
  // Open a fresh, blank tab and switch to it — "+" always adds a visible new tab chip and
  // lands on the new-tab surface (chat / live website / reader view), whatever was showing.
  newTab(){this._ensureTabs();this._saveLive();const id=this._tabId();this._tabs.push({id,kind:'new',hist:[],hpos:-1,viewMode:this.state.viewMode||'native',chatId:null});this._activateTab(id);}
  tabLabel(loc,g){if(loc.t==='web')return /^search:/i.test(loc.url)?(this.truncLabel(this.norm(loc.url.slice(7)),20)):(/^text:/i.test(loc.url)?((this.pageOf(loc.url)||{}).title||'Text'):this.short(loc.url));return (g&&g.entities&&g.entities.has(loc.id))?this.labelOf(loc.id):'…';}
  // Build the tab strip from the tab list \u2014 one chip per open tab, its glyph marking the kind:
  // chat (accent star) \u00b7 reader-view page \u00b7 search glyph \u00b7 a coloured dot for a live page /
  // entity \u00b7 + for a blank new tab.
  buildTabs(g){this._ensureTabs();return this._tabs.map(t=>{
    const active=t.id===this._activeTab;const id=t.id;let label,dotGlyph='',dotStyle;
    if(t.kind==='chat'){const c=(this.state.chats||[]).find(x=>x.id===t.chatId);label=this.truncLabel((c&&c.title)||'Chat',22);dotGlyph='\u2726';dotStyle='font-size:12px;line-height:1;color:var(--acc);flex:0 0 auto;';}
    else{const loc=(t.kind==='browse'&&t.hpos>=0&&t.hist)?t.hist[t.hpos]:null;
      if(!loc){label='New tab';dotGlyph='+';dotStyle='font-size:14px;line-height:1;color:var(--ink3);flex:0 0 auto;';}
      else{label=this.tabLabel(loc,g);const isWeb=loc.t==='web';const isSearch=isWeb&&/^search:/i.test(loc.url);const reader=(t.viewMode==='reader')&&isWeb&&!isSearch;
        if(isSearch){dotGlyph='\ue30c';dotStyle='font-family:\'Phosphor\';font-size:13px;line-height:1;color:#9aa1ab;flex:0 0 auto;';}
        else if(reader){dotGlyph='\ud83d\udcd6';dotStyle='font-size:12px;line-height:1;flex:0 0 auto;';}
        else if(isWeb){dotStyle='width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:#9aa1ab;';}
        else{const c=this.hashColor(label);dotStyle='width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:'+c+';';}}}
    return {label,active,dotGlyph,dotStyle,
      onClick:()=>this._activateTab(id),
      onClose:ev=>{if(ev&&ev.stopPropagation)ev.stopPropagation();this.closeTab(id);},
      tabStyle:'display:flex;align-items:center;gap:7px;max-width:190px;min-width:96px;padding:7px 9px 7px 11px;border-radius:9px 9px 0 0;cursor:pointer;font-size:12px;'+(active?'background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 -1px 3px rgba(0,0,0,.04);':'background:rgba(255,255,255,.4);color:var(--ink2);')};
  }).slice(-8);}
  // ---- live embed of the page shown in the CENTER viewport ----
  // A readable "book" rendering of an imported text source. The author's own
  // paragraphs (blank-line separated) are kept; if the text has no such structure
  // we group sentences into readable paragraphs. Rendered into the SAME sandboxed
  // iframe the web view uses, so decorateFrame() makes every known entity clickable.
  // The reading paragraphs of a page: the author's own blank-line blocks, or — for a
  // body with no such structure — sentences grouped into readable runs. Shared by the
  // book renderer and the native overlay so both flag the SAME passages.
  _pageParas(p){
    let paras=String(p.text||'').split(/\n\s*\n+/).map(s=>this.norm(s)).filter(s=>s.length);
    if(paras.length<=1){
      const sents=(p.sentences||[]).map(s=>this.norm(s)).filter(Boolean);
      paras=[];for(let i=0;i<sents.length;i+=4)paras.push(sents.slice(i,i+4).join(' '));
    }
    return paras;
  }
  // The page's flagged passages as {text,why} — the same surprise read the book view
  // marks, returned as strings so they can be located in a live DOM for the native view.
  _pageFlags(p){const paras=this._pageParas(p);
    return this.detectBookmarks(p,paras).map(m=>({text:paras[m.paraIndex]||'',why:m.why||''})).filter(f=>f.text.length>=24);}
  _bookHtml(p){
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let paras=this._pageParas(p);
    // Best-guess structure (engine-driven). Each section's anchor paragraph becomes a
    // navigable target; an explicit-heading or title-ish anchor renders as a heading,
    // a prose anchor just gets an invisible id. The first body paragraph keeps the drop cap.
    const sections=this.detectStructure(p,paras);
    const secAt=new Map();sections.forEach((s,n)=>secAt.set(s.paraIndex,{s,n}));
    // Surprise-flagged spots. A paragraph that's both a section anchor and a bookmark keeps
    // its section id and just gains the eo-bm class (its section id is the jump target).
    const marks=this.detectBookmarks(p,paras),bmAt=new Map();
    marks.forEach((m,n)=>bmAt.set(m.paraIndex,{why:m.why,n}));
    // Drop caps open every chapter, not just the document: chapStart is true at the very
    // start and is re-armed after each heading, so the first paragraph of each chapter
    // gets the ::first-letter drop cap. A prose section anchor IS its chapter's opening
    // paragraph, so it always drop-caps.
    const bookmarks=[],toc=[],parts=[];let chapStart=true;
    paras.forEach((t,i)=>{
      const hit=secAt.get(i),bm=bmAt.get(i);
      const bmAttr=bm?' data-eo-why="'+esc(bm.why||'')+'"':'';
      if(hit){const id='eo-ch-'+hit.n,lv=hit.s.level||1;toc.push({id,label:this.norm(hit.s.label),level:lv});
        if(bm)bookmarks.push({id,why:bm.why,paraIndex:i});
        // Markdown headings carry their #'s in the source line — show the clean title.
        const disp=/^#{1,6}\s/.test(t)?t.replace(/^#{1,6}\s+/,'').replace(/\s*#+$/,''):t;
        const ind=lv>1?' style="margin-left:'+((lv-1)*1.15)+'em"':'';
        const cls='eo-chap'+(hit.s.kind==='emergent'?' eo-emergent':'')+(bm?' eo-bm':'');
        // A heading opens a chapter — arm the drop cap for the paragraph that follows it.
        if(hit.s.kind==='heading'||this._titleish(t)){parts.push('<h2 class="'+cls+'" id="'+id+'"'+ind+bmAttr+'>'+esc(disp)+'</h2>');chapStart=true;return;}
        parts.push('<p id="'+id+'" class="eo-first'+(bm?' eo-bm':'')+'"'+bmAttr+'>'+esc(t)+'</p>');chapStart=false;return;}
      if(bm){const id='eo-bm-'+bm.n;bookmarks.push({id,why:bm.why,paraIndex:i});
        parts.push('<p id="'+id+'" class="'+(chapStart?'eo-first ':'')+'eo-bm"'+bmAttr+'>'+esc(t)+'</p>');chapStart=false;return;}
      parts.push('<p'+(chapStart?' class="eo-first"':'')+'>'+esc(t)+'</p>');chapStart=false;
    });
    const rp=this.state.readPrefs||this._defaultRead,tm=this.READ_THEMES[rp.theme]||this.READ_THEMES.light,a=this.curAccent();
    const v=(n,d)=>'--eo-'+n+':'+d+';';
    const htmlCls=this.state.bookmarkMode?' class="eo-bm-on"':'';
    // Title / author / date head: title alone as the heading, the author in natural
    // order on its own line, with the publication (or the author's era) beside it.
    const dateStr=p.published||p.authorDates||'';
    const authorHtml=p.author?'<div class="eo-author">'+esc(p.author)+(dateStr?'<span class="eo-life"> · '+esc(dateStr)+'</span>':'')+'</div>':'';
    // Media playback: a source heard/watched from a file keeps a playable handle, so it plays
    // back inline with the transcript below it. A blob URL from the parent shares this origin.
    const mmss=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
    let mediaHtml='';
    if(p.media){const tag=(p.mediaKind==='video')?'video':'audio';
      mediaHtml='<div class="eo-media"><'+tag+' id="eo-player" src="'+esc(p.media)+'" controls preload="metadata" style="width:100%;'+(tag==='video'?'max-height:60vh;background:#000;border-radius:10px;display:block;':'')+'"></'+tag+'></div>';}
    // The readings audit: a transcript is one hearing, not the objective truth of the waveform.
    // This surfaces the witnesses and the contested spans (from the audio organ's DEF·EVA·REC
    // record) so they can be inspected — and clicking a moment seeks the player to it.
    let auditHtml='';const au=p.audit;
    if(au&&(au.witnessCount>1||au.contestedCount||au.lowConfidence)){
      const rows=(au.contested||[]).slice(0,60).map(c=>{const t=(c.span&&c.span[0])||0;
        const alts=(c.alts||[]).map(a=>esc(a.surface)+' <span class="eo-cx-w">'+esc(a.witness)+'</span>').join(', ');
        return '<div class="eo-cx"><span class="eo-cx-t">'+mmss(t)+'</span><span class="eo-cx-c">'+esc((c.chosen&&c.chosen.surface)||'')+'</span><span class="eo-cx-vs">vs</span><span class="eo-cx-a">'+alts+'</span></div>';}).join('');
      auditHtml='<details class="eo-audit"'+(au.contestedCount?' open':'')+'><summary>Readings · '+au.witnessCount+' witness'+(au.witnessCount!==1?'es':'')+' · '+au.contestedCount+' contested · '+au.lowConfidence+' low-confidence</summary>'+
        '<div class="eo-audit-note">A transcript is a hearing, not objective truth. Where the witnesses disagreed:</div>'+
        (rows||'<div class="eo-audit-note">A single witness — no divergences to audit. Turn on “Audit readings” before importing to take a second hearing.</div>')+'</details>';}
    const html='<!doctype html><html'+htmlCls+'><head><meta charset="utf-8"><base target="_blank">'+
      '<style>:root{'+v('fs',(rp.fs||19)+'px')+v('lh',String(rp.lh||1.7))+v('maxw',(rp.w||720)+'px')+v('ff',this.READ_FONTS[rp.font]||this.READ_FONTS.serif)+v('bg',tm.bg)+v('fg',tm.fg)+v('fg2',tm.fg2)+v('rule',tm.rule)+v('acc',a)+v('bmbg',this.hexA(a,.10))+'}'+
      'html,body{margin:0;background:var(--eo-bg);}'+
      'body{font:var(--eo-fs)/var(--eo-lh) var(--eo-ff);color:var(--eo-fg);transition:background .2s,color .2s;}'+
      '.eo-book{max-width:var(--eo-maxw);margin:0 auto;padding:54px 30px 180px;}'+
      'h1.eo-title{font:700 1.95em/1.18 var(--eo-ff);letter-spacing:-.018em;color:var(--eo-fg);margin:0 0 4px;}'+
      '.eo-author{font:italic 600 1.08em/1.4 var(--eo-ff);color:var(--eo-fg);margin:0 0 12px;}'+
      '.eo-author .eo-life{font-style:normal;font-weight:400;color:var(--eo-fg2);}'+
      '.eo-byline{font:.72em/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--eo-fg2);margin:0 0 34px;border-bottom:1px solid var(--eo-rule);padding-bottom:18px;}'+
      'h2.eo-chap{font:700 2.15em/1.12 var(--eo-ff);letter-spacing:-.02em;color:var(--eo-fg);margin:2.6em 0 .7em;scroll-margin-top:16px;}'+
      'h2.eo-emergent{font-size:1.4em;font-weight:600;font-style:italic;letter-spacing:0;color:var(--eo-fg2);padding-left:.7em;border-left:2px solid var(--eo-acc);}'+
      'p{margin:0 0 1.15em;}p.eo-first::first-letter{font-size:3.1em;line-height:.86;float:left;padding:6px 10px 0 0;font-weight:700;color:var(--eo-acc);font-family:Georgia,serif;}'+
      // Bookmarks: inert until the reader turns the mode on (html.eo-bm-on), then the
      // flagged passage lifts off the page with an accent wash + rule, and shows its "why".
      '.eo-bm{scroll-margin-top:18px;border-radius:0 7px 7px 0;transition:background .2s,box-shadow .2s;}'+
      'html.eo-bm-on .eo-bm{background:var(--eo-bmbg);box-shadow:inset 3px 0 0 var(--eo-acc);padding:.5em .8em;margin-left:-.8em;position:relative;}'+
      'html.eo-bm-on .eo-bm[data-eo-why]:not([data-eo-why=""])::before{content:"❖ " attr(data-eo-why);display:block;font:700 .58em/1.3 -apple-system,BlinkMacSystemFont,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--eo-acc);margin-bottom:.4em;}'+
      // Media player + readings-audit styling — a calm card above the transcript.
      '.eo-media{margin:0 0 20px;}'+
      '.eo-audit{margin:0 0 30px;border:1px solid var(--eo-rule);border-radius:11px;padding:10px 14px;background:var(--eo-bmbg);font-family:-apple-system,BlinkMacSystemFont,sans-serif;}'+
      '.eo-audit>summary{font:700 .74em/1.4 -apple-system,BlinkMacSystemFont,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:var(--eo-acc);cursor:pointer;}'+
      '.eo-audit-note{font-size:.78em;color:var(--eo-fg2);margin:9px 0 8px;line-height:1.5;}'+
      '.eo-cx{display:flex;align-items:baseline;gap:9px;width:100%;text-align:left;border-top:1px solid var(--eo-rule);padding:7px 2px;color:var(--eo-fg);}'+
      '.eo-cx-t{flex:0 0 auto;font:600 .72em/1.4 ui-monospace,monospace;color:var(--eo-acc);min-width:44px;}'+
      '.eo-cx-c{flex:0 0 auto;font-size:.86em;font-weight:700;}'+
      '.eo-cx-vs{flex:0 0 auto;font-size:.68em;color:var(--eo-fg2);text-transform:uppercase;letter-spacing:.05em;}'+
      '.eo-cx-a{font-size:.86em;color:var(--eo-fg2);}'+
      '.eo-cx-w{font-size:.82em;font-style:italic;opacity:.7;}'+
      '</style></head><body><div class="eo-book"><h1 class="eo-title">'+esc(p.title||'Untitled')+'</h1>'+
      authorHtml+
      '<div class="eo-byline">'+(p.propCount!=null?p.propCount:this.countPropositions(p.sentences))+' propositions'+(toc.length>1?' · '+toc.length+' sections':'')+(marks.length?' · '+marks.length+' marks':'')+(p.media?' · '+(p.mediaKind==='video'?'video':'audio')+', transcribed':' · read as a book')+'</div>'+
      mediaHtml+auditHtml+
      parts.join('\n')+'</div></body></html>';
    return {html,toc,bookmarks};
  }
  // Render a source as a readable BOOK — drop-cap prose, an engine-found table of
  // contents, and the passages the reading flagged as important. This is the same
  // treatment Project Gutenberg books get, now given to EVERY document we've actually
  // read: an imported text, a book, OR a web page. The only thing that still loads as a
  // raw live page is a URL we haven't read yet (browsing ahead of the reading), which
  // has no parsed propositions to draw a contents or find its surprises from.
  _renderBook(url,p){const b=this._bookHtml(p);this._pageUrl=url;
    this.setState({bookView:true,pageDoc:b.html,bookToc:b.toc,bookmarks:b.bookmarks||[],bmRail:[],tocOpen:false,bookProgress:this.loadReadPos(url),pageLoading:false,pageErr:null});}
  _bookReady(p){return !!(p&&(this.norm(p.text||'').length>=60||(p.sentences&&p.sentences.length)));}
  // Is a fetched body plain text rather than HTML? Trusts an explicit content-type,
  // else sniffs the head for any block-level tag — the same test extract() uses on the
  // memory side (mirrors ingest/plaintext.js).
  _isPlainText(ctype,body){const ct=String(ctype||'');if(/text\/plain/i.test(ct))return true;if(/text\/html|application\/xhtml|application\/xml|\+xml/i.test(ct))return false;const head=String(body||'').slice(0,3000);return !/<\s*(!doctype|html|body|article|main|div|p|h[1-6]|table|section|span)\b/i.test(head);}
  // Render a plain-text (.txt / Project Gutenberg / pasted) body as readable, themed
  // HTML — blank-line paragraphs become <p>, a no-blank-line body is kept verbatim in a
  // pre-wrap block. Without this a .txt dropped into the iframe as HTML collapses every
  // newline to a space and the whole document reflows into one run-on blob.
  _plainTextDoc(raw,url){
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const t=String(raw||'').replace(/\r\n?/g,'\n');
    const blocks=t.split(/\n[ \t]*\n+/).map(b=>b.replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);
    const parts=blocks.length>1?blocks.map(p=>'<p>'+esc(p)+'</p>'):['<pre class="eo-raw">'+esc(t.replace(/[ \t]+$/gm,'').trim())+'</pre>'];
    const rp=this.state.readPrefs||this._defaultRead,tm=this.READ_THEMES[rp.theme]||this.READ_THEMES.light,a=this.curAccent();
    const v=(n,d)=>'--eo-'+n+':'+d+';';
    const baseTag=url?'<base href="'+esc(url)+'" target="_blank"><meta name="referrer" content="no-referrer">':'';
    return '<!doctype html><html><head><meta charset="utf-8">'+baseTag+
      '<style>:root{'+v('fs',(rp.fs||19)+'px')+v('lh',String(rp.lh||1.7))+v('maxw',(rp.w||720)+'px')+v('ff',this.READ_FONTS[rp.font]||this.READ_FONTS.serif)+v('bg',tm.bg)+v('fg',tm.fg)+v('acc',a)+'}'+
      'html,body{margin:0;background:var(--eo-bg);}'+
      'body{font:var(--eo-fs)/var(--eo-lh) var(--eo-ff);color:var(--eo-fg);}'+
      '.eo-book{max-width:var(--eo-maxw);margin:0 auto;padding:54px 30px 180px;}'+
      'p{margin:0 0 1.15em;}'+
      '.eo-raw{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0;}'+
      '</style></head><body><div class="eo-book">'+parts.join('\n')+'</div></body></html>';
  }
  loadCenter(url){
    if(/^search:/i.test(url)){this._renderSearch(url.slice(7));return;}
    if(/^text:/i.test(url)){const p=this.pageOf(url);if(p){this._renderBook(url,p);}else{this.setState({bookView:false,pageDoc:null,bookToc:[],bookmarks:[],bmRail:[],tocOpen:false,pageLoading:false,pageErr:'Text not found'});}return;}
    if(!url){this.setState({bookView:false,pageDoc:null,bookToc:[],bookmarks:[],bmRail:[],tocOpen:false,pageLoading:false,pageErr:null});return;}
    // A web page we've read can render two ways (the toolbar toggle picks). READER —
    // the stripped book view, TOC + flagged passages over the cleaned prose. NATIVE —
    // the real page below, with the same contents nav + highlighted passages laid on it
    // (built in decorateFrame once the live DOM is in). An unread URL has no prose yet,
    // so it always loads native until the read finishes (processPage re-renders it).
    const read=this.pageOf(url);if(this._bookReady(read)&&this.state.viewMode!=='native'){this._renderBook(url,read);return;}
    if(this._pageUrl===url&&this.state.pageDoc&&!this.state.bookView)return;
    this._pageUrl=url;this.setState({bookView:false,pageLoading:true,pageDoc:null,pageErr:null,bookToc:[],bookmarks:[],bmRail:[],tocOpen:false});
    fetch(this.PROXY+'/feed?url='+encodeURIComponent(url)).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);const ctype=r.headers.get('content-type')||'';return r.text().then(text=>({text,ctype}));}).then(({text,ctype})=>{
      if(this.state.viewUrl!==url||this.state.bookView)return;
      // A plain-text body has no markup — render its paragraphs explicitly, else the
      // iframe collapses every newline and the page reads as one run-on blob.
      if(this._isPlainText(ctype,text)){this.setState({bookView:false,pageDoc:this._plainTextDoc(text,url),bookToc:[],bookmarks:[],bmRail:[],tocOpen:false,pageLoading:false,pageErr:null});return;}
      let doc=text;
      // Neutralize anything that would navigate the frame away (which turns it
      // cross-origin and breaks entity decoration): scripts, no-JS refreshes,
      // meta refreshes. Stray links open in a new tab via <base target>.
      doc=doc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
             .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,'')
             .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,'');
      const baseTag='<base href="'+url+'" target="_blank"><meta name="referrer" content="no-referrer">';
      if(/<head[^>]*>/i.test(doc)) doc=doc.replace(/<head([^>]*)>/i,'<head$1>'+baseTag);
      else if(/<html[^>]*>/i.test(doc)) doc=doc.replace(/<html([^>]*)>/i,'<html$1><head>'+baseTag+'</head>');
      else doc=baseTag+doc;
      this.setState({pageDoc:doc,pageLoading:false});
    }).catch(e=>{ if(this.state.viewUrl===url)this.setState({pageLoading:false,pageErr:String(e&&e.message||e)}); });
  }
  navBtnStyle(on){return 'width:27px;height:27px;flex:0 0 auto;border:1px solid var(--line2);background:var(--app);border-radius:7px;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;'+(on?'color:var(--ink2);cursor:pointer;':'color:#cbced4;cursor:default;');}
  entRow(e,sel){
    const fc=this.frontier(e.id).length,isSel=e.id===sel,lab=this.labelOf(e.id);
    return {name:lab,sub:(e.sightings||1)+' mentions · '+this.neighbors(e.id).length+' links',av:this.initials(lab),avStyle:this.avatar(lab,30),
      hasFrontier:fc>0,frontierCount:fc,frontierStyle:'font-size:10.5px;font-weight:700;color:#9a6b12;background:#fbf3df;border:1px solid #ecd9a3;border-radius:11px;min-width:19px;height:19px;display:flex;align-items:center;justify-content:center;padding:0 5px;',
      onSelect:()=>this.clickEntity(e.id),onEnter:ev=>this.entHover(e.id,ev),onLeave:()=>this.entLeave(),rowStyle:'display:flex;align-items:center;gap:11px;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer;'+(isSel?'background:var(--accbg);box-shadow:inset 3px 0 0 var(--acc);':'')};
  }
  onSearch(ev){this.setState({query:ev&&ev.target?ev.target.value:''});}
  onDirInput(ev){this.setState({direction:ev&&ev.target?ev.target.value:''});}
  onUrlInput(ev){this.setState({url:ev&&ev.target?ev.target.value:''});}
  onUrlKey(ev){if(ev&&ev.key==='Enter')this.doReadUrl();}
  // The bar is a general search engine. A URL (or bare domain) is opened directly;
  // anything else is a WEB SEARCH — the query goes to a general search engine and the
  // results render as an HTML page in the center, every hit a link that opens (as HTML)
  // when clicked. (Project Gutenberg book search still runs via searchBooks for callers
  // that want it, e.g. the home-screen suggestions.)
  doReadUrl(){const u=this.state.url.trim();if(!u)return;this.setState({url:''});
    if(/^https?:\/\//i.test(u)||/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$|\?)/i.test(u)){this.goWeb(u);}
    else{this.doSearch(u);}}
  // Run a general web search — render the results as an HTML page in the center viewport.
  // The pseudo-URL `search:<query>` becomes a normal history location (back/forward and the
  // tab strip treat it like any web page); loadCenter routes it to _renderSearch.
  doSearch(query){query=this.norm(query);if(!query)return;
    const vu='search:'+query;this._srcUrl=null;this._pushLoc({t:'web',url:vu});
    this.setState(s=>({viewUrl:vu,selId:null,panelSel:null,panelLens:null,panelMode:'overview',hoverSrc:null,pinSrc:null,hoverEnt:null,activeChat:null,newTabOpen:false,gutenResults:null,gutenQuery:'',histRev:(s.histRev||0)+1}));
    this.loadCenter(vu);}
  // Fetch the results page (cached per query so back/forward re-renders without re-fetching)
  // and paint it into the center iframe as themed HTML.
  _renderSearch(query){
    query=this.norm(query);const vu='search:'+query;this._pageUrl=vu;
    const cache=this._searchCache||(this._searchCache=new Map());
    if(cache.has(query)){this.setState({bookView:false,pageDoc:this._searchResultsDoc(query,cache.get(query)),bookToc:[],bookmarks:[],bmRail:[],tocOpen:false,pageLoading:false,pageErr:null});return;}
    this.setState({bookView:false,pageLoading:true,pageDoc:null,pageErr:null,bookToc:[],bookmarks:[],bmRail:[],tocOpen:false});
    this.webSearchResults(query).then(results=>{
      cache.set(query,results);
      if(this.state.viewUrl!==vu)return;
      this.setState({pageDoc:this._searchResultsDoc(query,results),pageLoading:false,pageErr:null});
    }).catch(e=>{ if(this.state.viewUrl===vu)this.setState({pageLoading:false,pageErr:String(e&&e.message||e)}); });
  }
  // Search-engine results with title + snippet. PRIMARY: DuckDuckGo's HTML endpoint
  // (parsed for title/snippet/url) through the proxy. FALLBACK: Wikipedia's search API
  // (CORS-direct) so a DDG hiccup or bot-wall never leaves the bar empty.
  async webSearchResults(query,n){
    n=n||12;
    try{const r=await this._searchDDGRich(query,n);if(r.length)return r;}catch(e){}
    try{return await this._searchWikiRich(query,n);}catch(e){return [];}
  }
  async _searchDDGRich(query,n){
    const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query)));
    if(!r.ok)throw new Error('HTTP '+r.status);
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');const out=[];const seen=new Set();
    doc.querySelectorAll('.result, .web-result').forEach(res=>{
      const a=res.querySelector('a.result__a, .result__title a');if(!a)return;
      let h=a.getAttribute('href')||'';const m=h.match(/[?&]uddg=([^&]+)/);if(m)h=decodeURIComponent(m[1]);
      if(!/^https?:\/\//i.test(h)||/duckduckgo\.com/i.test(h))return;if(seen.has(h))return;seen.add(h);
      const sn=res.querySelector('.result__snippet');
      out.push({url:h,title:this.norm(a.textContent)||this.short(h),snippet:this.norm(sn?sn.textContent:''),host:this.short(h)});
    });
    return out.slice(0,n);
  }
  async _searchWikiRich(query,n){
    const u='https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(query)+'&srlimit='+(n||10)+'&format=json&origin=*';
    const data=await this._wikiJSON(u);const hits=(data&&data.query&&data.query.search)||[];
    return hits.map(h=>{const url='https://en.wikipedia.org/wiki/'+encodeURIComponent(String(h.title).replace(/ /g,'_'));
      return {url,title:h.title,snippet:this.norm(String(h.snippet||'').replace(/<[^>]+>/g,'')),host:'en.wikipedia.org'};}).slice(0,n);
  }
  // The results page itself — themed to match the reader, every hit a plain <a href> the
  // center iframe's click handler routes through goWeb (so a result opens as HTML in-app).
  _searchResultsDoc(query,results){
    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const rp=this.state.readPrefs||this._defaultRead,tm=this.READ_THEMES[rp.theme]||this.READ_THEMES.light,a=this.curAccent();
    const rows=(results||[]).map(r=>
      '<li class="eo-r"><a class="eo-r-t" href="'+esc(r.url)+'">'+esc(r.title||r.url)+'</a>'+
      '<div class="eo-r-h">'+esc(r.host||'')+'</div>'+
      (r.snippet?'<div class="eo-r-s">'+esc(r.snippet)+'</div>':'')+'</li>').join('');
    const body=results&&results.length
      ? '<ol class="eo-rs">'+rows+'</ol>'
      : '<p class="eo-empty">No results for “'+esc(query)+'”.</p>';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">'+
      '<style>'+
      ':root{--bg:'+tm.bg+';--fg:'+tm.fg+';--acc:'+a+';}'+
      'html,body{margin:0;background:var(--bg);}'+
      'body{font:15px/1.55 '+(this.READ_FONTS.sans||'-apple-system,system-ui,sans-serif')+';color:var(--fg);}'+
      '.eo-wrap{max-width:680px;margin:0 auto;padding:30px 28px 120px;}'+
      '.eo-q{font-size:13px;color:var(--fg);opacity:.6;margin:0 0 22px;}'+
      '.eo-q b{opacity:1;}'+
      '.eo-rs{list-style:none;margin:0;padding:0;}'+
      '.eo-r{margin:0 0 22px;}'+
      '.eo-r-t{display:inline;font-size:18px;font-weight:600;color:var(--acc);text-decoration:none;cursor:pointer;}'+
      '.eo-r-t:hover{text-decoration:underline;}'+
      '.eo-r-h{font-size:12px;opacity:.55;margin:2px 0 4px;}'+
      '.eo-r-s{font-size:13.5px;opacity:.85;}'+
      '.eo-empty{opacity:.6;}'+
      '</style></head><body><div class="eo-wrap">'+
      '<p class="eo-q">Web results for <b>'+esc(query)+'</b></p>'+body+
      '</div></body></html>';
  }
  setHover(s){this.setState({hoverSrc:s});}
  openSource(url,wide,tab){const isText=/^text:/i.test(url);this.setState({openSrc:url,srcTab:tab||(isText?'props':'page'),srcWide:!!wide});this.loadEmbed(url);}
  closeSource(){this._embedUrl=null;this.setState({openSrc:null,srcDoc:null,srcLoading:false,srcErr:null});}
  toggleWide(){this.setState(s=>({srcWide:!s.srcWide}));}
  setSrcTab(t){this.setState({srcTab:t});if(t==='page')this.loadEmbed(this.state.openSrc);}
  // Live embed of the actual page — fetched through the same proxy, rendered in a
  // sandboxed iframe via srcdoc with an injected <base> so its CSS/images resolve.
  // No allow-scripts: frame-busting and trackers can't run; layout/styles still paint.
  loadEmbed(url){
    if(!url||/^text:/i.test(url)){this.setState({srcDoc:null,srcLoading:false,srcErr:null});return;}
    if(this._embedUrl===url&&this.state.srcDoc)return;
    this._embedUrl=url; this.setState({srcLoading:true,srcDoc:null,srcErr:null});
    fetch(this.PROXY+'/feed?url='+encodeURIComponent(url)).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);const ctype=r.headers.get('content-type')||'';return r.text().then(text=>({text,ctype}));}).then(({text,ctype})=>{
      if(this.state.openSrc!==url)return;
      // A plain-text source renders as paragraphs, not raw-as-HTML (which collapses it).
      if(this._isPlainText(ctype,text)){this.setState({srcDoc:this._plainTextDoc(text,url),srcLoading:false,srcErr:null});return;}
      let origin=url; try{origin=new URL(url).origin+'/';}catch(e){}
      const baseTag='<base href="'+origin+'"><meta name="referrer" content="no-referrer">';
      let doc=String(text||'');
      if(/<head[^>]*>/i.test(doc)) doc=doc.replace(/<head([^>]*)>/i,'<head$1>'+baseTag);
      else if(/<html[^>]*>/i.test(doc)) doc=doc.replace(/<html([^>]*)>/i,'<html$1><head>'+baseTag+'</head>');
      else doc=baseTag+doc;
      this.setState({srcDoc:doc,srcLoading:false});
    }).catch(e=>{ if(this.state.openSrc===url)this.setState({srcLoading:false,srcErr:String(e&&e.message||e)}); });
  }
  // ── interconnect: link every known entity inside the source text, wiki-style ──
  toggleLinkMode(){try{localStorage.setItem('eo_linkmode',this.state.linkMode?'0':'1');}catch(e){}this.setState(s=>({linkMode:!s.linkMode}));}
  // The referents salient to ONE source: every entity the parse folded out of that
  // source's own sentences. The text is raw noumena; the reading — parse and fold —
  // is what turns it into phenomena, so an entity is offered as clickable only where
  // it was actually folded. A name that lights up does so in reference to THIS text,
  // never because the same surface form names a heavier referent folded from some
  // other source (the global link index collapses "Washington" the city onto
  // "Washington" the person when one outweighs the other; that cross-source pull is
  // what this gates).
  //
  // Returns null ONLY when there is no source to speak of (no url, no reading) —
  // genuinely no scope, leave the global index alone. When a url IS given but nothing
  // was folded from it, returns the EMPTY set: that source is unabsorbed noumena, so
  // it offers nothing rather than borrowing the rest of the corpus's phenomena.
  // Cached by rev.
  sourceEntities(url){
    if(!url||!this.graph||!this.master||!this.master.events)return null;
    if(this._srcEntsRev!==this.state.rev){
      this._srcEnts=new Map();this._srcEntsRev=this.state.rev;
      const rep=x=>{try{return this.graph.representative(x);}catch(e){return x;}};
      for(const e of this.master.events){
        if(e.sentIdx==null)continue;const u=this.master.sentenceSource[e.sentIdx];if(!u)continue;
        let set=this._srcEnts.get(u);if(!set){set=new Set();this._srcEnts.set(u,set);}
        for(const x of [e.id,e.src,e.tgt,e.from,e.to])if(x)set.add(rep(x));
      }
    }
    return this._srcEnts.get(url)||(this._noEnts||(this._noEnts=new Set()));
  }
  buildLinkIndex(){
    if(this._linkRe!==undefined&&this._linkRev===this.state.rev)return this._linkMap;
    const map=new Map(),labels=[];
    const HON=new Set(['mr','mrs','ms','dr','sir','lady','lord','prof','professor','miss','madam','madame','herr','frau','st','saint']);
    if(this.graph){
      for(const e of this.graph.entities.values()){
        if(!this.showable(e.id))continue;const l=this.labelOf(e.id);if(!l||l.length<3)continue;
        const lc=l.toLowerCase();if(this.STOP.has(lc))continue;if(!map.has(lc)){map.set(lc,e.id);labels.push(l);}}
      // Books name people by a single name ("Gregor"), but the graph keeps the full
      // name ("Gregor Samsa"), so a bare first/last name would never light up. Register
      // the distinctive proper-noun word of each multi-word name as an alias to the same
      // entity. Skip honorifics, stop-words, short/lowercase tokens, anything already a
      // label, and any token that is ambiguous across entities (drop it rather than
      // mislink). This is what makes "Gregor", "Grete" &c. clickable in the reading.
      const cand=new Map();   // token -> {id,w,disp} ; null marks an ambiguous token
      for(const e of this.graph.entities.values()){
        if(!this.showable(e.id))continue;const l=this.labelOf(e.id);if(!l)continue;
        const parts=l.split(/\s+/);if(parts.length<2)continue;const w=this.weightOf(e);
        for(const part of parts){
          if(!/^[A-Z]/.test(part))continue;                         // proper-noun words only
          const tok=part.toLowerCase().replace(/[^a-z0-9'-]/g,'');
          if(tok.length<3||HON.has(tok)||this.STOP.has(tok))continue;
          if(map.has(tok))continue;                                  // a real label wins
          const prev=cand.get(tok);
          if(prev===null)continue;
          if(prev===undefined)cand.set(tok,{id:e.id,w,disp:part});
          else if(prev.id!==e.id)cand.set(tok,null);                 // collides → forget it
        }
      }
      for(const [tok,v] of cand){if(v&&!map.has(tok)){map.set(tok,v.id);labels.push(v.disp);}}
    }
    labels.sort((a,b)=>b.length-a.length);
    const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pat=labels.slice(0,600).map(esc).join('|');
    this._linkRe=pat?new RegExp('\\b('+pat+')\\b','gi'):null;
    this._linkMap=map;this._linkRev=this.state.rev;return map;
  }
  linkifyNode(text,srcUrl){
    if(!this.state.linkMode)return text;
    if(!this._lnCache||this._lnRev!==this.state.rev||this._lnMode!==this.state.linkMode){this._lnCache=new Map();this._lnRev=this.state.rev;this._lnMode=this.state.linkMode;}
    const key=(srcUrl||'')+'\u0001'+text;
    if(this._lnCache.has(key))return this._lnCache.get(key);
    const node=this._linkify(text,srcUrl);this._lnCache.set(key,node);return node;
  }
  _linkify(text,srcUrl){
    const map=this.buildLinkIndex(),re=this._linkRe;if(!re)return text;
    const local=this.sourceEntities(srcUrl);   // entities folded from THIS text; empty if unabsorbed; null only with no source
    const cur=this.state.selId;re.lastIndex=0;
    const out=[];let last=0,m,k=0,n=0,seen=new Set();
    while((m=re.exec(text))&&n<80){n++;
      const id=map.get(m[0].toLowerCase());
      if(id==null||id===cur||seen.has(id))continue;
      if(local&&!local.has(id))continue;          // a name folded only from other sources stays plain
      seen.add(id);
      if(m.index>last)out.push(text.slice(last,m.index));
      out.push(React.createElement('span',{key:'lk'+(k++),
        style:{color:'var(--acc)',cursor:'pointer',borderBottom:'1px dotted var(--accline)'},
        onMouseEnter:ev=>this.entHover(id,ev),onMouseMove:ev=>this.entHover(id,ev),onMouseLeave:()=>this.entLeave(),
        onClick:ev=>{if(ev){ev.stopPropagation();ev.preventDefault();}this.openLinkChoice(id,srcUrl,ev);}},m[0]));
      last=m.index+m[0].length;
    }
    if(!out.length)return text;
    if(last<text.length)out.push(text.slice(last));
    return React.createElement('span',null,out);
  }
  openLinkChoice(id,srcUrl,ev){const x=(ev&&ev.clientX)||0,y=(ev&&ev.clientY)||0;this.entLeave();this.setState({linkChoice:{id,srcUrl,x,y}});}
  closeLinkChoice(){this.setState({linkChoice:null});}
  linkChoiceVals(base){const g=this.graph;if(!(this.state.linkChoice&&g&&g.entities.has(this.state.linkChoice.id)))return;
    const lc=this.state.linkChoice,lid=lc.id,llab=this.labelOf(lid);
    const vw=(typeof window!=='undefined'&&window.innerWidth)||960,lx=Math.min(Math.max(8,lc.x),vw-252),ly=lc.y+12;
    base.linkChoiceOn=true;base.linkChoice={label:llab,host:this.short(lc.srcUrl||''),av:this.initials(llab),avStyle:this.avatar(llab,30),hasSource:!!lc.srcUrl,
      wrap:'position:fixed;left:'+lx+'px;top:'+ly+'px;width:244px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 38px rgba(20,24,30,.22);padding:7px;z-index:42;animation:eopop .12s ease-out;',
      onProfile:()=>{this.closeLinkChoice();this.closeSource();this.clickEntity(lid);},
      onSource:()=>{this.closeLinkChoice();const u=lc.srcUrl;if(u){try{this.goWeb(u);}catch(e){}}}};}
  // ---- content-script: decorate the live page in the center iframe ----
  componentDidUpdate(prevProps,prevState){
    // Navigating to a different entity resets the panel to the top — you land on the
    // new entity's identity, not wherever you'd scrolled the previous one. (The runtime
    // doesn't pass prevState reliably, so track the last selection on the instance.)
    if(this.state.panelSel!==this._lastPanelSel){this._lastPanelSel=this.state.panelSel;if(this.state.panelSel){const a=document.getElementById('eo-panel-scroll');if(a)a.scrollTop=0;const b=document.getElementById('eo-panel-body');if(b){b.style.animation='none';void b.offsetWidth;b.style.animation='eoswap .26s ease-out';}}}
    if(this.state.viewUrl&&this.state.pageDoc){
      const token=this.state.viewUrl+'|'+this.state.rev+'|'+(this.state.linkMode?1:0)+'|'+this.curAccent()+'|'+this.state.highlightStyle;
      if(token!==this._decoToken){this._decoToken=token;this._scheduleDecorate();}
    } else {this._decoToken=null;}
  }
  _scheduleDecorate(){clearTimeout(this._decoT);let tries=0;const tick=()=>{const ifr=document.querySelector('iframe[data-eo-center]');const d=ifr&&ifr.contentDocument;if(d&&d.body&&d.body.childNodes.length){this.decorateFrame(d,ifr);}else if(tries++<50){this._decoT=setTimeout(tick,80);}};this._decoT=setTimeout(tick,60);}
  _frameOffset(){const ifr=document.querySelector('iframe[data-eo-center]');if(!ifr)return{x:0,y:0};const r=ifr.getBoundingClientRect();return{x:r.left,y:r.top};}
  decorateFrame(d,ifr){
    try{
      // A book in the center is an e-book: apply reading prefs, restore position, track progress.
      // Any read source renders this way now — imported text, a Gutenberg book, or a web page.
      const _bookUrl=(this.state.viewUrl&&this.state.bookView)?this.state.viewUrl:null;
      if(_bookUrl){try{this._setupBook(d,ifr,_bookUrl);}catch(e){}}
      // A NATIVE read page gets the same reading layer laid over its own layout: a contents
      // nav from its headings, the engine's flagged passages highlighted in place, plus
      // progress + the marker rail. Only once the page has been read (it has the prose).
      const _natUrl=(this.state.viewUrl&&!this.state.bookView&&!/^text:/i.test(this.state.viewUrl)&&this._bookReady(this.pageOf(this.state.viewUrl)))?this.state.viewUrl:null;
      if(_natUrl){try{this._setupNative(d,ifr,_natUrl);}catch(e){}}
      // styles — rebuilt each pass so accent + highlight mode apply live
      {let st=d.getElementById('__eo_style');if(!st){st=d.createElement('style');st.id='__eo_style';(d.head||d.body).appendChild(st);}
        const a=this.curAccent(),hl=this.state.highlightStyle;
        const base='cursor:pointer;border-radius:2px;transition:background .12s;';
        let ent,entH,lnk,lnkH;
        if(hl==='marker'){ent=base+'border-bottom:1.5px solid '+this.hexA(a,.45)+';background:'+this.hexA(a,.07)+';';entH='background:'+this.hexA(a,.18)+';';lnk=base+'background:'+this.hexA(a,.07)+';box-shadow:inset 0 -1.5px 0 '+this.hexA(a,.45)+';';lnkH='background:'+this.hexA(a,.18)+';';}
        else if(hl==='underline'){ent=base+'border-bottom:1.5px solid '+this.hexA(a,.5)+';';entH='background:'+this.hexA(a,.12)+';';lnk=base+'border-bottom:1.5px dotted '+this.hexA(a,.6)+';';lnkH='background:'+this.hexA(a,.12)+';';}
        else{ent=base;entH='background:'+this.hexA(a,.16)+';';lnk=base;lnkH='background:'+this.hexA(a,.16)+';';}
        st.textContent='.eo-ent{'+ent+'}.eo-ent:hover{'+entH+'}.eo-ent-link{'+lnk+'}.eo-ent-link:hover{'+lnkH+'}.eo-ent-link::after{content:"\\25C9";font-size:.62em;color:'+a+';vertical-align:super;margin-left:1px;opacity:'+(hl==='off'?'.55':'.8')+';}';}
      // unbind/strip if linkMode off
      if(!this.state.linkMode){d.querySelectorAll('[data-eo-ent]').forEach(s=>{const t=d.createTextNode(s.textContent);s.parentNode.replaceChild(t,s);});d.querySelectorAll('a[data-eo-wiki]').forEach(a=>{a.classList.remove('eo-ent-link');a.removeAttribute('data-eo-wiki');});return;}
      const map=this.buildLinkIndex(),re=this._linkRe;if(!re)return;
      const local=this.sourceEntities(this.state.viewUrl);   // offer only entities salient to the open source
      this._frameIds=this._frameIds||[];
      const walker=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
        if(!n.nodeValue||!n.nodeValue.trim()||n.nodeValue.length<3)return NodeFilter.FILTER_REJECT;
        const p=n.parentElement;if(!p)return NodeFilter.FILTER_REJECT;
        const tag=p.tagName;if(tag==='SCRIPT'||tag==='STYLE'||tag==='NOSCRIPT'||tag==='TEXTAREA'||tag==='CODE'||tag==='PRE')return NodeFilter.FILTER_REJECT;
        if(p.closest('[data-eo-ent]'))return NodeFilter.FILTER_REJECT;
        // Don't sub-wrap entities INSIDE a real hyperlink — the whole anchor is one span.
        // Otherwise "Proceedings of the National Academy of Sciences" fragments into
        // "National Academy" + "Sciences" dots. The whole-anchor pass below handles it.
        if(p.closest('a'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;}});
      const targets=[];let nn,cap=0;while((nn=walker.nextNode())&&cap<4000){targets.push(nn);cap++;}
      let wraps=0;
      for(const node of targets){
        if(wraps>1500)break;const text=node.nodeValue;re.lastIndex=0;let m,last=0,frags=null;
        const aEl=node.parentElement&&node.parentElement.closest?node.parentElement.closest('a'):null;
        const href=(aEl&&aEl.getAttribute&&aEl.getAttribute('href'))?aEl.href:null;
        while((m=re.exec(text))){
          const id=map.get(m[0].toLowerCase());if(id==null)continue;
          if(local&&!local.has(id))continue;          // skip names folded only from other sources
          frags=frags||[];if(m.index>last)frags.push(d.createTextNode(text.slice(last,m.index)));
          const span=d.createElement('span');const idx=this._frameIds.push(id)-1;
          span.setAttribute('data-eo-ent',String(idx));span.className=href?'eo-ent-link':'eo-ent';
          if(href)span.setAttribute('data-eo-href',href);
          // No in-prose link (e.g. the stripped Reader view) — still run ahead on hover to
          // the entity's own page so the card shows pivot text. Kept off data-eo-href so the
          // span stays plain (no link chrome) and a click still opens the profile, not the link.
          else{const aw=this._entWikiUrl(id);if(aw)span.setAttribute('data-eo-ahead',aw);}
          span.textContent=m[0];frags.push(span);last=m.index+m[0].length;wraps++;
          if(wraps>1500)break;
        }
        if(frags){if(last<text.length)frags.push(d.createTextNode(text.slice(last)));const par=node.parentNode;frags.forEach(f=>par.insertBefore(f,node));par.removeChild(node);}
      }
      // Every real in-article link is an explorable thing, not only the ones already
      // folded into the graph. Graph entities inside a link are wrapped above; give
      // the dot + click affordance to the remaining content anchors too.
      try{d.querySelectorAll('a[href]').forEach(a=>{
        if(a.querySelector('[data-eo-ent]'))return;
        if(a.closest('sup,.reference,.mw-editsection,.mw-cite-backlink,.noprint,[role="navigation"]'))return;
        const href=a.getAttribute('href')||'';if(!href||href[0]==='#'||/^javascript:/i.test(href))return;
        if(a.querySelector('img'))return;
        const txt=(a.textContent||'').trim();
        if(txt.length<2||txt.length>90||/^\[?\d+\]?$/.test(txt))return;
        // Bind a profile only when the WHOLE anchor text is itself a graph entity —
        // never a fragment inside it. "Proceedings of the National Academy of Sciences"
        // must not pivot to the "National Academy" fragment (wrong content); it stays a
        // navigate-only wiki link pointing at its own article.
        let id=map.get(txt.toLowerCase());
        if(local&&id!=null&&!local.has(id))id=null;  // a profile is offered only when the entity is salient here
        a.classList.add('eo-ent-link');a.setAttribute('data-eo-wiki','1');a.setAttribute('data-eo-href',a.href);
        if(id!=null)a.setAttribute('data-eo-ent',String(this._frameIds.push(id)-1));
      });}catch(e){}
      // delegated listeners — rebindable so hot-reloads/new instances take effect
      if(d.__eoHandlers){d.removeEventListener('click',d.__eoHandlers.click,true);d.removeEventListener('mouseover',d.__eoHandlers.over,true);d.removeEventListener('mouseout',d.__eoHandlers.out,true);if(d.__eoHandlers.move)d.removeEventListener('mousemove',d.__eoHandlers.move,true);}
      const onClick=ev=>{const s=ev.target.closest&&ev.target.closest('[data-eo-ent]');
        if(s){ev.preventDefault();ev.stopPropagation();const id=this._frameIds[+s.getAttribute('data-eo-ent')];if(id==null)return;this.entLeave();
          // An entity that is ALSO a hyperlink has two actions — open its profile, or follow
          // the link. Don't pick for the user: offer both in a small modal at the click.
          const href=s.getAttribute('data-eo-href');const o=this._frameOffset();const act=this.state.clickAction||'ask';
          if(href&&act==='link'){this.goWeb(href);}
          else if(href&&act==='ask'){this.openLinkChoice(id,href,{clientX:o.x+ev.clientX,clientY:o.y+ev.clientY});}
          else this.clickEntity(id);
          return;}
        // A plain in-page link opens in the CENTER viewport as a new in-app tab — not a real browser tab.
        const a=ev.target.closest&&ev.target.closest('a[href]');
        if(a){const href=a.href||a.getAttribute('href');if(href&&/^https?:/i.test(href)){ev.preventDefault();ev.stopPropagation();this.entLeave();this.goWeb(href);}}};
      const onOver=ev=>{const s=ev.target.closest&&ev.target.closest('[data-eo-ent]');
        if(s){const id=this._frameIds[+s.getAttribute('data-eo-ent')];if(id==null)return;const href=s.getAttribute('data-eo-href')||null;const ahead=s.getAttribute('data-eo-ahead')||null;const o=this._frameOffset();clearTimeout(this._prevT);this.entHover(id,{clientX:o.x+ev.clientX,clientY:o.y+ev.clientY},href,ahead);return;}
        // A wiki link that is NOT a folded entity → dwell pivots to a link preview.
        const a=ev.target.closest&&ev.target.closest('a[data-eo-wiki]');
        if(a&&!a.hasAttribute('data-eo-ent')){clearTimeout(this._pivotT);this.wikiPreviewHover(a.getAttribute('data-eo-href')||a.href);}};
      const onOut=ev=>{const s=ev.target.closest&&ev.target.closest('[data-eo-ent]');if(s)this.entLeave();};
      // Settle-to-pivot: while the cursor is still MOVING over an entity, keep deferring
      // the dwell timer. It fires only once the cursor comes to rest — so sweeping the
      // mouse across the text while reading never yanks the panel from entity to entity.
      const onMove=ev=>{if(this._hovEnt==null)return;const s=ev.target.closest&&ev.target.closest('[data-eo-ent]');if(!s)return;
        // Keep deferring the card while the cursor is still travelling, and track where
        // it rests so the card lands at the settled spot — sweeping never pops anything.
        if(this._pendHover&&this.state.hoverEnt!==this._pendHover.id){const o=this._frameOffset();this._pendHover.x=o.x+ev.clientX;this._pendHover.y=o.y+ev.clientY;this._armHoverCard();}
        if((this.state.hoverPivot||'dwell')==='dwell')this._armPivot(this._hovEnt);};
      d.addEventListener('click',onClick,true);d.addEventListener('mouseover',onOver,true);d.addEventListener('mouseout',onOut,true);d.addEventListener('mousemove',onMove,true);
      d.__eoHandlers={click:onClick,over:onOver,out:onOut,move:onMove};d.__eoBound=true;
    }catch(e){}
  }
  _armPivot(id){
    const mode=this.state.hoverPivot||'dwell';
    if(mode==='off'||id==null)return;
    clearTimeout(this._pivotT);
    const delay=mode==='hover'?60:(this.state.hoverDelay||1100);
    this._pivotT=setTimeout(()=>{if(this._hovEnt===id)this.setState({panelSel:id,previewWiki:null,rightOpen:true});},delay);
  }
  // A Wikipedia page guessed from an entity's label — the run-ahead target for a name that
  // has no in-prose link (the stripped Reader view). Missing/disambiguation pages fail
  // gracefully (no pivot block), so a wrong guess just shows the plain card.
  _entWikiUrl(id){const l=this.labelOf(id);if(!l||l.length<3)return null;return 'https://en.wikipedia.org/wiki/'+encodeURIComponent(l.replace(/\s+/g,'_'));}
  // The URL the hover card is running ahead to: a real in-prose link if there is one, else
  // the entity's own page. Drives the prefetch; only a real link gets the "open link" button.
  _aheadUrl(){return this.state.hoverHref||this.state.hoverAhead||null;}
  entHover(id,ev,href,ahead){clearTimeout(this._hovT);this._stopCardWatch();
    this._hovEnt=id;
    const x=(ev&&ev.clientX)||0,y=(ev&&ev.clientY)||0;
    this._pendHover={id,href:href||null,ahead:ahead||null,x,y};
    // The card appears only once the cursor SETTLES on an entity — a glance while
    // reading, or sweeping the mouse across the text, never pops it up (see onMove,
    // which keeps re-arming the timer until the cursor stops moving).
    this._armHoverCard();
    // Pivot likewise fires only on a settled dwell; leaving cancels both
    // (the _hovEnt===id checks below).
    clearTimeout(this._prevT);
    this._armPivot(id);
  }
  _armHoverCard(){
    const ph=this._pendHover;if(!ph||this._hovEnt!==ph.id)return;
    if(this.state.hoverEnt===ph.id)return; // already showing — keep it steady, don't re-pop
    clearTimeout(this._cardT);
    const delay=(this.state.hoverPivot==='hover')?90:340;
    this._cardT=setTimeout(()=>{const p=this._pendHover;if(!p||this._hovEnt!==p.id)return;
      this.setState({hoverEnt:p.id,hoverHref:p.href,hoverAhead:p.ahead||null,hoverXY:{x:p.x,y:p.y},hoverWiki:null});
      this._startCardWatch(p.x,p.y);
      // Run ahead one layer: prefetch the linked article (or, with no in-prose link, the
      // entity's own page) and show what's relevant right in the hover card — no navigation.
      const pre=p.href||p.ahead;if(pre)this._fetchHoverWiki(pre);},delay);
  }
  // A reasonable label for a link BEFORE its preview resolves: a Wikipedia article's
  // title if the URL is a /wiki/ path, else the bare host. Lets the card/panel name
  // the destination immediately instead of flashing the raw URL.
  _linkLabel(href){
    const m=String(href||'').match(/\/wiki\/([^#?:]+)$/);
    if(m&&/wikipedia\.org/i.test(href))return decodeURIComponent(m[1]).replace(/_/g,' ');
    try{return new URL(href).hostname.replace(/^www\./,'');}catch(e){return String(href||'');}
  }
  // Run-ahead preview for ANY in-article hyperlink, not only Wikipedia. A wiki link uses
  // the REST summary (clean lede + thumbnail); any other link is fetched through the same
  // proxy the reader uses and reader-extracted, so a news article shows its own title +
  // lede right in the card/panel — no navigation. Cached per href. Throws on fetch failure
  // so callers can render an error state. (docs/source-activation.md: run ahead one layer.)
  async _linkPreview(href){
    this._linkPrev=this._linkPrev||{};
    if(this._linkPrev[href])return this._linkPrev[href];
    const wm=String(href||'').match(/\/wiki\/([^#?:]+)$/);
    let rec;
    if(wm&&/wikipedia\.org/i.test(href)){
      const title=decodeURIComponent(wm[1]).replace(/_/g,' ');
      const d=await this._wikiSummary(title);
      rec={title:d.title||title,extract:this.norm(d.extract||''),desc:d.description||'',
        thumb:(d.thumbnail&&d.thumbnail.source)||null,
        url:(d.content_urls&&d.content_urls.desktop&&d.content_urls.desktop.page)||href};
    }else{
      const r=await fetch(this.PROXY+'/feed?url='+encodeURIComponent(href));
      if(!r.ok)throw new Error('HTTP '+r.status);
      const ex=this.extract(await r.text(),r.headers.get('content-type')||'',href);
      // The lede is the first few real blocks of the extracted body, abbreviation-safe.
      const lede=this.norm(String(ex.text||'').split('\n').map(s=>s.trim()).filter(s=>s.length>2).slice(0,3).join(' '));
      const host=this._linkLabel(href);
      rec={title:(ex.title&&ex.title!=='(untitled)')?ex.title:host,
        extract:this._clipExtract(lede,420)||lede,desc:host,thumb:ex.image||null,url:href};
    }
    return (this._linkPrev[href]=rec);
  }
  // Prefetch a link's summary for the hover card (any link; cached per href).
  async _fetchHoverWiki(href){
    if(!href||/^#/.test(href)||/^javascript:/i.test(href))return;
    this._linkPrev=this._linkPrev||{};
    const cached=this._linkPrev[href];
    if(cached){if(this._aheadUrl()===href)this.setState({hoverWiki:{href,title:cached.title,extract:this.endOnBoundary(cached.extract,260),loading:false}});return;}
    this.setState({hoverWiki:{href,title:this._linkLabel(href),extract:'',loading:true}});
    try{const rec=await this._linkPreview(href);
      if(this._aheadUrl()===href)this.setState({hoverWiki:{href,title:rec.title,extract:this.endOnBoundary(rec.extract,260),loading:false}});
    }catch(e){if(this._aheadUrl()===href)this.setState({hoverWiki:{href,title:this._linkLabel(href),extract:'',loading:false,err:true}});}
  }
  // Anti-stick: once the card is up, watch the real pointer. The instant it leaves both
  // the card (with a small bridge) and a radius around the word that opened it, drop it.
  // This is geometric, so it can't get stranded by a missed mouseenter/leave pair.
  _startCardWatch(tx,ty){
    this._stopCardWatch();
    this._cardWatch=(e)=>{
      let inside=false;
      const el=document.getElementById('eo-hovercard');
      if(el){const r=el.getBoundingClientRect();const pad=26;
        if(e.clientX>=r.left-pad&&e.clientX<=r.right+pad&&e.clientY>=r.top-pad&&e.clientY<=r.bottom+pad)inside=true;}
      if(!inside){const dx=e.clientX-tx,dy=e.clientY-ty;if(dx*dx+dy*dy<=44*44)inside=true;}
      if(!inside)this._hideCardNow();
    };
    window.addEventListener('mousemove',this._cardWatch,true);
  }
  _stopCardWatch(){if(this._cardWatch){window.removeEventListener('mousemove',this._cardWatch,true);this._cardWatch=null;}}
  _hideCardNow(){this._stopCardWatch();clearTimeout(this._cardT);clearTimeout(this._hovT);clearTimeout(this._pivotT);this._pendHover=null;this._hovEnt=null;if(this.state.hoverEnt!=null)this.setState({hoverEnt:null,hoverHref:null,hoverAhead:null,hoverWiki:null});}
  // A hyperlink that ISN'T a folded entity (a news article, "Proceedings of the National
  // Academy of Sciences", &c.) still has a referent — the page it points at. Dwelling on
  // it pivots the panel to a lightweight preview of that page (title + lede, or a wiki
  // summary), with a way to read it in. Works for any link, not only Wikipedia.
  wikiPreviewHover(href){
    if((this.state.hoverPivot||'dwell')==='off')return;
    if(!href||/^#/.test(href)||/^javascript:/i.test(href))return;
    const title=this._linkLabel(href);
    clearTimeout(this._prevT);this._prevHref=href;
    const delay=this.state.hoverPivot==='hover'?60:(this.state.hoverDelay||1100);
    this._prevT=setTimeout(()=>{if(this._prevHref!==href)return;
      this.setState({previewWiki:{title,href,loading:true,extract:'',desc:''},panelSel:null,rightOpen:true});
      this._fetchWikiPreview(title,href);},delay);
  }
  async _fetchWikiPreview(title,href){
    this._linkPrev=this._linkPrev||{};
    if(this._linkPrev[href]){if(this.state.previewWiki&&this.state.previewWiki.href===href)this.setState({previewWiki:{...this._linkPrev[href],href,loading:false}});return;}
    try{const rec=await this._linkPreview(href);
      if(this.state.previewWiki&&this.state.previewWiki.href===href)this.setState({previewWiki:{...rec,href,loading:false}});
    }catch(e){if(this.state.previewWiki&&this.state.previewWiki.href===href)this.setState({previewWiki:{title,href,loading:false,extract:'',err:true}});}
  }
  closePreview(){clearTimeout(this._prevT);this._prevHref=null;if(this.state.previewWiki)this.setState({previewWiki:null});}
  entLeave(){clearTimeout(this._cardT);clearTimeout(this._pivotT);this._pendHover=null;this._hovEnt=null;clearTimeout(this._hovT);this._hovT=setTimeout(()=>{this._stopCardWatch();this.setState({hoverEnt:null,hoverHref:null,hoverAhead:null,hoverWiki:null});},220);}
  keepHover(){clearTimeout(this._hovT);}
  hoverProfile(){const id=this.state.hoverEnt;clearTimeout(this._hovT);this.setState({hoverEnt:null,hoverHref:null,hoverAhead:null});if(id==null)return;this.clickEntity(id);}
  hoverLink(){const u=this.state.hoverHref;clearTimeout(this._hovT);this.setState({hoverEnt:null,hoverHref:null});if(u){try{this.goWeb(u);}catch(e){}}}
  hoverVals(base){const g=this.graph,he=this.state.hoverEnt;if(!(he&&g&&g.entities.has(he)))return;
    const hl=this.labelOf(he),hm=this.mentionsOf(he),hs=this.sourcesOf(he),hn=this.neighbors(he);
    const hb={eva:0,def:0,held:0};hm.forEach(i=>hb[this.bandOf(i)]++);const ht=hb.eva+hb.def+hb.held||1;let l2,c2;if(hb.eva/ht>=.45){l2='well attested';c2='#1d4ed8';}else if(hb.def/ht>=.4){l2='mostly asserted';c2='#b45309';}else{l2='mostly mentioned';c2='#6b7280';}
    const vw=(typeof window!=='undefined'&&window.innerWidth)||960,x=Math.min(this.state.hoverXY.x+6,vw-290),y=this.state.hoverXY.y+18;
    const heHref=this.state.hoverHref;
    const preUrl=heHref||this.state.hoverAhead||null;
    const hw=this.state.hoverWiki,hasPre=!!(preUrl&&hw&&hw.href===preUrl&&(hw.loading||hw.extract));
    base.hoverCardOn=true;base.hoverCard={name:hl,
      hasPrefetch:hasPre,prefetchTitle:hasPre?(hw.title||''):'',prefetchLoading:!!(hasPre&&hw.loading&&!hw.extract),prefetchText:hasPre?(hw.extract||''):'',av:this.initials(hl),avStyle:this.avatar(hl,34),onEnter:()=>this.keepHover(),onLeave:()=>this.entLeave(),onProfile:()=>{this._stopCardWatch();clearTimeout(this._hovT);clearTimeout(this._pivotT);this.setState({hoverEnt:null,hoverHref:null});this.clickEntity(he);},hasLink:!!this.state.hoverHref,noLink:!this.state.hoverHref,linkHost:this.short(this.state.hoverHref||''),onLink:()=>{this._stopCardWatch();clearTimeout(this._hovT);this.setState({hoverEnt:null,hoverHref:null});if(heHref){try{this.goWeb(heHref);}catch(e){}}},stat:(g.entities.get(he).sightings||hm.length)+'× · '+hn.length+' links · '+hs.length+' sources',gist:this.norm(this.master.sentences[g.entities.get(he).firstSeen]||this.master.sentences[hm[0]]||'').slice(0,150),est:l2,estStyle:'color:'+c2+';font-weight:600;',segs:[[hb.eva,'#1d4ed8'],[hb.def,'#b45309'],[hb.held,'#6b7280']].filter(([n])=>n>0).map(([n,c])=>({style:'width:'+(n/ht*100)+'%;background:'+c+';display:block;'})),wrap:'position:fixed;left:'+x+'px;top:'+y+'px;width:270px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(20,24,30,.16);padding:13px 14px;z-index:30;animation:eopop .12s ease-out;'};}

  async research(focalId,modeOverride){
    const id=focalId||this.state.selId; if(this._busy||!id)return;const focal=this.labelOf(id);this._feedEnt=id;
    const mode=modeOverride||this.state.mode;
    const dir=this.state.direction.trim();const fr=this.frontier(id);
    const query=dir||(fr[0]&&fr[0].query)||focal;
    this._busy=true;this.setState({busy:true,liveResearch:{on:true,focal:id,phase:'search',host:'',added:0}});
    const preSent=this.master.sentences.length;
    const preMF=this.mentionsOf(id).length,preSF=this.sourcesOf(id).length;
    // Capture the focal entity's specific referents BEFORE reading anything new, and the
    // page this research is launched from — researched sources nest under it.
    const focalProper=this.corefContext(id).proper||new Set();
    const parentUrl=this.state.viewUrl||this.sourcesOf(id)[0]||null;
    this.feedSep('research'+(dir?' · '+dir:'')+' · '+mode);
    this.feedLine('search','Searching the web for “'+query+'”');await this.sleep(300);
    let links;try{links=await this.searchLinks(query,mode==='breadth'?8:6);}catch(e){this.feedLine('warn','Search unavailable ('+e.message+') — paste a URL up top to research directly.');this._busy=false;this.setState({busy:false,liveResearch:{on:false}});return;}
    links=(links||[]).filter(u=>!this.state.pages.find(p=>p.url===u||p.url==='https://'+u));
    if(!links.length){this.feedLine('warn','No new candidates found.');this._busy=false;this.setState({busy:false,liveResearch:{on:false}});return;}
    this.feedLine('found','Found '+links.length+' sources: '+links.map(l=>this.short(l)).join(', '));await this.sleep(300);
    const before={ents:this.graph.entities.size,srcs:this.state.pages.length};
    // Many top hits are anti-bot walls (Cloudflare "Just a moment…") or JS shells that the
    // proxy can't render — those read as empty. So don't stop at a fixed slice: walk DOWN the
    // candidate list and keep reading until `want` sources actually land. Blocked/empty/off-topic
    // pages are skipped, not counted, so one bad top result no longer sinks the whole pass.
    const want=mode==='breadth'?3:1; let got=0,attempts=0;
    for(let i=0;i<links.length&&got<want&&attempts<8;i++){const url=links[i];const preEnts=this.graph.entities.size;attempts++;
      this.setState(s=>({liveResearch:{...(s.liveResearch||{}),on:true,focal:id,phase:'read',host:this.short(url)}}));
      this.feedLine('read','Reading '+this.short(url)+' …');await this.sleep(200);
      const res=await this.readURL(url,'REAFFERENCE',parentUrl);await this.sleep(200);
      if(!res){continue;} // readURL already logged why (blocked, too little text) — try the next candidate
      if(!this.pageRelevant(url,focalProper)){this.tossPage(url);this.feedLine('warn','Set aside '+this.short(url)+' — not about '+focal+' (no shared referents)');await this.sleep(140);continue;}
      got++;
      const grew=this.graph.entities.size-preEnts;this.feedLine('graph','Read “'+res.title+'” · +'+Math.max(0,grew)+' entities, +1 source');
      this.setState(s=>({liveResearch:{...(s.liveResearch||{}),added:this.master.sentences.length-preSent}}));await this.sleep(160);
    }
    if(!got)this.feedLine('warn','Every candidate was blocked or off-topic — paste a specific URL up top to read it directly.');
    const d={ents:this.graph.entities.size-before.ents,srcs:this.state.pages.length-before.srcs};
    this.feedLine('done','Done. Memory gained '+d.ents+' entities across '+d.srcs+' new source'+(d.srcs!==1?'s':'')+'. '+focal+' now has '+this.sourcesOf(id).length+' sources.');
    this._busy=false;this.setState(s=>({busy:false,researched:{...s.researched,[id]:true},liveResearch:{on:false,focal:id,phase:'done',host:'',added:this.master.sentences.length-preSent,addedFocal:this.mentionsOf(id).length-preMF,srcFocal:this.sourcesOf(id).length-preSF}}));
    setTimeout(()=>{ if(this.state.liveResearch&&this.state.liveResearch.phase==='done')this.setState({liveResearch:{on:false}}); },4000);
  }

  chip(url,active){const c=this.hashColor(this.short(url));return {style:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:6px;padding:2px 7px;cursor:pointer;transition:all .12s;'+(active?'color:var(--ink);background:#eef3fc;border:1px solid '+c+';':'color:var(--ink2);background:#f4f5f7;border:1px solid var(--line2);'),dot:'width:7px;height:7px;border-radius:50%;background:'+c+';display:inline-block;flex-shrink:0;'};}
  avatar(label,size){const c=this.hashColor(label);return 'width:'+size+'px;height:'+size+'px;flex:0 0 auto;border-radius:'+(size*0.28)+'px;background:'+c+'1a;color:'+c+';display:flex;align-items:center;justify-content:center;font-size:'+(size*0.34)+'px;font-weight:700;letter-spacing:-.02em;';}
  srcId(url){const p=this.pageOf(url);const i=p?this.master.pages.indexOf(p):-1;return 'S'+(i+1);}

  // The top activity bar — what the reader is doing right now, drawn from the live
  // busy flag and the running feed. Requires no entity selection, so first-read
  // failures (bad URL, too-little-text) surface here instead of vanishing.
  activityVals(){
    const ready=this.state.ready, busy=this.state.busy, n=this.state.pages.length;
    const lines=(this.state.feed||[]).filter(l=>!l.sep);
    const last=lines[lines.length-1];
    const label=!ready?'Loading':(busy?'Working':(n?'Idle':'Ready'));
    const color=!ready?'#6b7280':(busy?'#b45309':(n?'#5a626d':'#15803d'));
    let text;
    if(last)text=last.t;
    else if(!ready)text='Starting the reading engine…';
    else if(!n)text='Paste a URL above or pick a suggestion to begin.';
    else text='Up to date — '+n+' source'+(n!==1?'s':'')+' read. Hit Research when you want more.';
    const dot=busy
      ?'width:12px;height:12px;border-radius:50%;border:2px solid '+color+';border-top-color:transparent;animation:eospin .8s linear infinite;display:inline-block;flex:0 0 auto;box-sizing:border-box;'
      :'width:8px;height:8px;border-radius:50%;background:'+color+';display:inline-block;flex:0 0 auto;'+((ready&&!n)?'animation:eopulse 2s infinite;':'');
    const FEED={search:{i:'',c:'#2563eb'},found:{i:'',c:'#2563eb'},read:{i:'',c:'#b45309'},graph:{i:'',c:'#15803d'},done:{i:'',c:'#15803d'},warn:{i:'',c:'#dc2626'}};
    const trail=lines.slice(-6).map(l=>{const f=FEED[l.k]||{i:'·',c:'#9aa1ab'};return {icon:f.i,full:l.t,style:'width:19px;height:19px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-family:\'Phosphor\';font-size:12px;color:'+f.c+';background:'+f.c+'18;flex:0 0 auto;'};});
    return {busy,label,labelColor:color,text,dotStyle:dot,barBg:busy?'#fdfaf3':'var(--card)',trail,hasTrail:trail.length>0,textStyle:''};
  }

  // The pending Source rows — one per in-flight (or failed) import. A live row spins with its
  // status ("Transcribing…", "Read page 4 / 12…"); a failed row holds its error until dismissed.
  // Rendered ABOVE the read sources so a just-picked file is the first thing you see.
  _importRows(){
    return (this.state.imports||[]).map(im=>{
      const err=!!im.error;
      const c=err?'#dc2626':'var(--acc)';
      return {
        id:im.id, name:this.truncLabel(im.name||'file',40), kind:im.kind||'File',
        status:err?im.error:(im.status||'Working…'),
        isErr:err, ok:!err,
        onDismiss:()=>this.dismissImport(im.id),
        dotStyle:err
          ?'width:24px;height:24px;flex:0 0 auto;border-radius:7px;background:#fdecec;color:#dc2626;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;'
          :'width:24px;height:24px;flex:0 0 auto;border-radius:7px;background:var(--accbg);display:flex;align-items:center;justify-content:center;box-sizing:border-box;',
        spinStyle:'width:13px;height:13px;border-radius:50%;border:2px solid var(--accline);border-top-color:var(--acc);animation:eospin .8s linear infinite;display:inline-block;box-sizing:border-box;',
        rowStyle:'display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;margin-bottom:3px;border:1px solid '+(err?'#f3caca':'var(--accline)')+';background:'+(err?'#fef6f6':'var(--accbg)')+';',
        dismissStyle:'width:22px;height:22px;flex:0 0 auto;border:none;background:transparent;color:'+c+';border-radius:6px;cursor:pointer;font-size:13px;line-height:1;'};
    });
  }
  renderVals(){
    const ready=this.state.ready,g=this.graph,active=this.state.pinSrc||this.state.hoverSrc;
    const _acc=this.curAccent();
    const base={accentVar:_acc,accbgVar:this.mixWhite(_acc,.90),acclineVar:this.mixWhite(_acc,.70),
      settingsOpen:this.state.settingsOpen,onToggleSettings:()=>this.toggleSettings(),onCloseSettings:()=>this.closeSettings(),
      templatesOpen:this.state.templatesOpen,onOpenTemplates:()=>this.setState({templatesOpen:true,settingsOpen:false}),onCloseTemplates:()=>this.setState({templatesOpen:false}),templatesStop:e=>{if(e&&e.stopPropagation)e.stopPropagation();},
      memOpen:this.state.memOpen,onOpenMem:()=>this.setState({memOpen:true,settingsOpen:false}),onCloseMem:()=>this.setState({memOpen:false}),memStop:e=>{if(e&&e.stopPropagation)e.stopPropagation();},onExportMem:()=>this.exportMemory(),mem:(this.state.memOpen?this.memoryLog():{rows:[],hasRows:false,statLine:'',empty:true}),
      memTab:this.state.memTab||'sources',memTabSources:(this.state.memTab||'sources')==='sources',memTabLog:this.state.memTab==='log',
      onMemSources:()=>this.setState({memTab:'sources'}),onMemLog:()=>this.setState({memTab:'log'}),
      memSourcesTabStyle:((this.state.memTab||'sources')==='sources'?'background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);'),
      memLogTabStyle:(this.state.memTab==='log'?'background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);'),
      memNote:((this.state.memOpen&&this.state.memTab==='log')?this.memoryNotation():{rows:[],count:0,shown:0}),
      themeSwatches:this.THEMES.map(t=>({name:t.name,hex:t.hex,active:t.hex.toLowerCase()===_acc.toLowerCase(),onPick:()=>this.setAccent(t.hex),
        style:'width:26px;height:26px;border-radius:7px;cursor:pointer;background:'+t.hex+';box-shadow:0 0 0 '+(t.hex.toLowerCase()===_acc.toLowerCase()?'2px var(--card),0 0 0 4px '+t.hex:'1px rgba(0,0,0,.12) inset')+';'})),
      hlOptions:['marker','underline','off'].map(k=>({k,label:k==='marker'?'Highlight':k==='underline'?'Underline':'Off',active:this.state.highlightStyle===k,onPick:()=>this.setHighlight(k),
        style:'flex:1;font-size:11.5px;font-weight:600;text-align:center;padding:6px 4px;border-radius:6px;cursor:pointer;'+(this.state.highlightStyle===k?'background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);')})),
      hoverOptions:[['dwell','On dwell'],['hover','Instant'],['off','Off']].map(([k,label])=>({k,label,active:this.state.hoverPivot===k,onPick:()=>this.setHoverPivot(k),
        style:'flex:1;font-size:11.5px;font-weight:600;text-align:center;padding:6px 4px;border-radius:6px;cursor:pointer;'+(this.state.hoverPivot===k?'background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);')})),
      hoverDesc:this.state.hoverPivot==='off'?'Hovering never moves the panel — use it only to peek the card. Click to open a profile.':this.state.hoverPivot==='hover'?'The panel follows your cursor immediately. Fastest, but moves a lot while reading.':'The panel pivots only after you rest on an entity for a moment. Glancing past won’t move it.',
      dwellOn:this.state.hoverPivot==='dwell',dwellGap:this.state.hoverPivot==='dwell'?'12px':'16px',
      hoverDelay:this.state.hoverDelay,hoverDelayLabel:(this.state.hoverDelay>=1000?(this.state.hoverDelay/1000).toFixed(this.state.hoverDelay%1000?1:0):this.state.hoverDelay)+(this.state.hoverDelay>=1000?'s':'ms'),
      onHoverDelay:e=>this.setHoverDelay(e.target.value),
      clickOptions:[['ask','Ask'],['profile','Profile'],['link','Go to link']].map(([k,label])=>({k,label,active:this.state.clickAction===k,onPick:()=>this.setClickAction(k),
        style:'flex:1;font-size:11.5px;font-weight:600;text-align:center;padding:6px 4px;border-radius:6px;cursor:pointer;'+(this.state.clickAction===k?'background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08);':'color:var(--ink3);')})),
      clickDesc:this.state.clickAction==='ask'?'When an entity is also a hyperlink, clicking asks whether to open its profile or follow the link.':this.state.clickAction==='profile'?'Clicking always opens the entity’s profile. Follow the link from the hover card instead.':'Clicking always follows the hyperlink. Open the profile from the hover card instead.',
      url:this.state.url,onUrlInput:e=>this.onUrlInput(e),onUrlKey:e=>this.onUrlKey(e),onReadUrl:()=>this.doReadUrl(),
      onBack:()=>this.goBack(),onForward:()=>this.goForward(),onReloadTop:()=>this.forceUpdate(),onNewTab:()=>this.newTab(),
      onImportClick:()=>this.onImportClick(),onImportFile:e=>this.onImportFile(e),
      onToggleDetect:()=>this.toggleDetect(),detect:this.state.detect,showWeb:false,web:null,srcCtxOn:false,
      detectDesc:this.state.detect?'On — every page you open is read into memory.':'Off — pages open without being read. Turn on to build memory.',
      detectSwitch:'flex:0 0 auto;width:34px;height:20px;border-radius:11px;padding:2px;transition:background .15s;background:'+(this.state.detect?'var(--acc)':'#cfd3da')+';',
      detectKnob:'width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s;transform:translateX('+(this.state.detect?'14px':'0')+');',
      onToggleAudit:()=>this.toggleAudit(),
      auditDesc:this.state.auditMode?'On — each entity shows its raw graph contents, the integral fold vs. Wikipedia, and the sources in play.':'Off — turn on to inspect coref, definitions, and the propositions behind each profile.',
      auditSwitch:'flex:0 0 auto;width:34px;height:20px;border-radius:11px;padding:2px;transition:background .15s;background:'+(this.state.auditMode?'var(--acc)':'#cfd3da')+';',
      auditKnob:'width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s;transform:translateX('+(this.state.auditMode?'14px':'0')+');',
      tabs:this.buildTabs(g),hasTabs:(this._tabs&&this._tabs.length>0),
      backStyle:this.navBtnStyle(this.canBack()),fwdStyle:this.navBtnStyle(this.canForward()),
      readBtnLabel:this.state.busy?'…':'Read',readBtnStyle:'font-size:12px;font-weight:600;color:#fff;background:var(--acc);border:none;border-radius:7px;padding:6px 13px;flex:0 0 auto;cursor:pointer;'+(this.state.busy?'opacity:.6;':''),
      onSearch:e=>this.onSearch(e),inboxCount:'',inbox:[],inboxEmpty:true,groups:[],hasEgo:false,
      chats:[],hasChats:false,chatOn:false,chat:null,chatInput:this.state.chatInput||'',askPageOn:false,
      onNewChat:()=>this.newChat(null),onChatInput:e=>this.onChatInput(e),onChatKey:e=>this.onChatKey(e),onSendChat:()=>this.sendChat(),onStopGen:()=>this.stopGeneration(),onCloseChat:()=>this.closeChat(),onAskPage:()=>this.askThisPage(),
      onToggleResearchMode:()=>this.toggleWebBrain(),researchModeOn:this.state.webBrain!==false,
      webBtnLabel:this.state.webBrain!==false?'✦ Web on':'✦ Web off',
      researchModeTitle:this.state.webBrain!==false?'Web is on — when your own reading doesn’t cover a question I go read the internet, fold it into memory, and answer grounded in what I found. Click to turn the web off.':'Web is off — answers come only from what you’ve read, nothing from the internet. Click to let me read the web when your reading doesn’t cover a question.',
      researchModeHint:this.state.webBrain!==false?'I’ll read the web when your own reading doesn’t cover it.':'Off — answering only from what you’ve read.',
      researchModeStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:7px;padding:4px 10px;flex:0 0 auto;cursor:pointer;'+(this.state.webBrain!==false?'color:#fff;background:var(--acc);border:1px solid var(--acc);':'color:var(--ink2);background:var(--app);border:1px solid var(--line2);'),
      // HOW MUCH research — cycles shallow → deep → obsessive (the arc's coverage policy). Disabled
      // visually when the web is off (there's nothing to scale). Only meaningful while web is on.
      // THE REGISTER SWITCH (docs/creative-grounded-modes.md, the reader's face): how the next
      // answers are written \u2014 auto (ground on whatever the turn gathers, honest fallback) \u00b7
      // grounded (strictly from sources; declines rather than inventing) \u00b7 creative (the model
      // writing freely, nothing gathered). Cycles like the depth button; every settled turn is
      // badged with the register it ACTUALLY used. Phosphor icons: circle-half \u00b7 anchor \u00b7 sparkle.
      onCycleAnswerMode:()=>this.cycleAnswerMode(),
      answerModeIcon:(this.state.answerMode==='grounded')?'\ue514':(this.state.answerMode==='creative')?'\ue6a2':'\ue18c',
      answerModeLabel:(this.state.answerMode||'auto'),
      answerModeTitle:'How the next answers are written: auto (ground on whatever this turn gathers; fall back honestly) \u00b7 grounded (strictly from sources \u2014 declines rather than inventing) \u00b7 creative (the model writing freely; nothing gathered). Click to cycle. Every answer is badged with the register it actually used.',
      answerModeStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:7px;padding:4px 10px;flex:0 0 auto;cursor:pointer;'
        +((this.state.answerMode==='grounded')?'color:#15803d;background:#e9f6ee;border:1px solid #bfe3cc;'
        :(this.state.answerMode==='creative')?'color:#6d28d9;background:#f1edfc;border:1px solid #d8ccf7;'
        :'color:var(--ink2);background:var(--app);border:1px solid var(--line2);'),
      onCycleDepth:()=>this.cycleResearchDepth(),
      depthBtnIcon:'\ue79e',depthBtnLabel:(this.state.researchDepth||'deep'),
      depthTitle:'How much research per question: shallow (the strongest answer) · deep (several angles) · obsessive (exhaust the threads). Click to cycle.',
      depthStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:7px;padding:4px 10px;flex:0 0 auto;cursor:pointer;'+(this.state.webBrain!==false?'color:var(--ink2);background:var(--app);border:1px solid var(--line2);':'color:var(--ink3);background:var(--app);border:1px solid var(--line2);opacity:.5;'),
      // THE OUTPUT PICKER on the composer — ONE split control (see view.xdc.html). The accent LEFT
      // half is the WRITE action (pen-nib icon, outputGo); the neutral RIGHT half shows the current
      // format+kind and opens the menu (an accordion of formats → kinds). Neither is a toggle — the
      // accent marks the action, the neutral half marks what will be written. The two halves share
      // one border + radius so they read as a single control. Phosphor codepoints throughout.
      outputGoIcon:'', // pen-nib — WRITE
      outputWriteLabel:(this._outputTypeMeta().ready&&this.state.essayArmed)?'Essay on':'Write',
      onOutputGo:()=>this.outputGo(),
      outputCurrentIcon:this._outputTypeMeta().icon,
      outputCurrentLabel:(this._outputTypeMeta().id==='essay')?('Essay · '+this._essayTypeMeta().label):this._outputTypeMeta().label,
      outputGoTitle:this._outputTypeMeta().ready
        ?(this.state.essayArmed
            ?('Essay mode is ON — every message you send is written as a ≥2,500-word '+this._essayTypeMeta().label.toLowerCase()+' essay on what you typed. Click to turn off.')
            :('Turn on essay mode — then each message you send is written as a ≥2,500-word '+this._essayTypeMeta().label.toLowerCase()+' essay, thinking out loud as it plans and writes.'))
        :(this._outputTypeMeta().label+' output isn’t wired yet — choose Essay to write'),
      onOutputMenu:()=>this.toggleEssayMenu(),
      outputMenuOpen:!!this.state.essayMenuOpen,
      outputMenuTitle:'Choose what to write — the output format and, within it, its kind',
      outputMenuRows:this._outputMenuRows(),
      outputGoStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:7px 0 0 7px;padding:4px 10px;flex:0 0 auto;border-right:none;'+((this._outputTypeMeta().ready&&this.state.essayArmed)?'color:#fff;background:var(--acc);border:1px solid var(--acc);':('color:'+(this._outputTypeMeta().ready?'var(--acc)':'var(--ink3)')+';background:var(--accbg);border:1px solid var(--accline);'))+(this._outputTypeMeta().ready?'cursor:pointer;':'cursor:not-allowed;opacity:.55;'),
      outputChooserStyle:'display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:0 7px 7px 0;padding:4px 9px;flex:0 0 auto;cursor:pointer;color:var(--ink2);background:var(--app);border:1px solid var(--accline);white-space:nowrap;',
      backend:this.state.backend||'webllm',
      backendOptions:[{v:'webllm',label:'Llama-3.2-3B · runs in your browser'},
        {v:'qwen-coder-1.5b',label:'Qwen2.5-Coder 1.5B · code model, WebGPU'},
        {v:'qwen-coder-7b',label:'Qwen2.5-Coder 7B · code model, WebGPU ~6GB'},
        {v:'qwen-coder-0.5b',label:'Qwen2.5-Coder 0.5B · code model, CPU'},
        {v:'echo',label:'Echo · offline, no model'}].map(o=>{const sel=(this.state.backend||'webllm')===o.v;return {v:o.v,label:o.label,sel,onPick:()=>this.setBackend(o.v),
        style:'font-size:12px;font-weight:600;text-align:left;padding:8px 11px;border-radius:8px;cursor:pointer;border:1px solid '+(sel?'var(--accline)':'var(--line2)')+';background:'+(sel?'var(--accbg)':'var(--card)')+';color:'+(sel?'var(--acc)':'var(--ink2)')+';'};}),
      sources:[],srcCount:0,srcEmpty:true,imports:this._importRows(),hasImports:(this.state.imports||[]).length>0,onSrcImport:()=>this.onImportClick(),
      // Transcription option — a second whisper witness so audio/video readings can be audited.
      audioAudit:!!this.state.audioAudit,onToggleAudioAudit:()=>this.setState(s=>({audioAudit:!s.audioAudit})),
      audioAuditStyle:'display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;border-radius:7px;padding:5px 9px;cursor:pointer;border:1px solid '+(this.state.audioAudit?'var(--accline)':'var(--line2)')+';background:'+(this.state.audioAudit?'var(--accbg)':'var(--app)')+';color:'+(this.state.audioAudit?'var(--acc)':'var(--ink3)')+';',
      audioAuditLabel:this.state.audioAudit?'Audit readings · on':'Audit readings · off',
      rightOpen:this.state.rightOpen,rightClosed:!this.state.rightOpen,onToggleRight:()=>this.toggleRight(),panelProfileOn:false,panelListOn:true,panelPageOn:false,pageOverview:null,listFromPage:false,onShowAllEntities:()=>this.showAllEntities(),onShowOverview:()=>this.showOverview(),panelProfile:null,previewOn:false,preview:null,
      pageLinked:this.state.linkMode,onTogglePlain:()=>this.toggleLinkMode(),
      plainLabel:this.state.linkMode?'Names linked':'Plain text',
      plainTitle:this.state.linkMode?'Known names are highlighted and clickable. Click to read plain, unmarked text.':'Page is plain text. Click to highlight and link known names again.',
      plainBtnStyle:'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border-radius:7px;padding:5px 10px;flex:0 0 auto;cursor:pointer;'+(this.state.linkMode?'color:var(--acc);background:var(--accbg);border:1px solid var(--accline);':'color:var(--ink2);background:var(--app);border:1px solid var(--line2);'),
      cursor:{label:ready&&this.master?('line '+this.master.sentences.length):'—',title:ready&&this.master?('Projection at the latest read · '+this.state.pages.length+' pages · '+this.master.sentences.length+' sentences'):'no data yet'},
      liveColor:this.state.busy?'#b45309':'#22a06b',liveLabel:this.state.busy?'Working…':(ready?'Engine ready':'Loading…'),
      hasSel:false,showPrompt:false,promptTitle:'',promptBody:'',suggestions:[],
      newTabLanding:false,simplePrompt:false,landingModeNative:false,landingModeReader:false,landingModePageStyle:'',landingModeReaderStyle:'',onLandingPage:()=>{},onLandingReader:()=>{},
      ledger:[],ledgerCount:0,ledgerEmpty:true,hoverCardOn:false,srcOpen:false,
      direction:this.state.direction,onDirInput:e=>this.onDirInput(e),mode:this.state.mode,
      leftOpen:this.state.leftOpen,toggleLeft:()=>this.setState(s=>({leftOpen:!s.leftOpen})),
      leftIcon:this.state.leftOpen?'‹':'☰',leftTitle:this.state.leftOpen?'Hide entities panel':'Show entities panel',
      onSwap:()=>this.toggleSwap(),swapTitle:this.state.swapped?'Swap panels back (sources left)':'Swap panels (sources right)',
      swapBtnStyle:'width:30px;height:30px;flex:0 0 auto;border:1px solid '+(this.state.swapped?'var(--accline)':'var(--line2)')+';background:'+(this.state.swapped?'var(--accbg)':'var(--app)')+';border-radius:8px;color:'+(this.state.swapped?'var(--acc)':'var(--ink2)')+';display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;line-height:1;',
      panelW:this.state.panelW||380,onResizeDown:e=>this.onResizeDown(e),onResizeReset:()=>this.onResizeReset(),
      onChatResizeDown:e=>this.onChatResizeDown(e),onChatResizeReset:()=>this.onChatResizeReset(),
      closeSource:()=>this.closeSource(), linkChoiceOn:false, closeLinkChoice:()=>this.closeLinkChoice() };
    // ── Layout engine ────────────────────────────────────────────────────────
    // One place builds the grid track string + every column's `order`. Reading order is
    // Sources | Reading | Chat | Entities. The chat column appears only when a chat is
    // active, a page is open, and the viewport is wide enough (else chat overlays/fills).
    // Phone collapses to a single pane chosen by `pane`; mid/wide place real columns.
    {
      const isPhone=this.phone(), isNarrow=this.narrow();
      const L=this.state.leftOpen, R=this.state.rightOpen;
      const chatActive=!!this.activeChatObj();
      const C=chatActive && !!this.state.viewUrl && !isNarrow;   // chat docked as a column
      const pw=(this.state.panelW||380), cw=(this.state.chatW||420);
      base.isPhone=isPhone; base.isNarrow=isNarrow; base.chatColOn=C;
      if(isPhone){
        base.gridCols='1fr';
        base.leftOrder=0; base.mainOrder=0; base.chatOrder=0; base.rightOrder=0;
      }else{
        // Reading is the hero: give the centre column a readable floor that the side
        // panels must yield to, never the other way round. The panels are sized as
        // minmax(0,Wpx) — they take their preferred width when there's room, but shrink
        // (and finally scroll) before the prose column collapses. Without this the fixed
        // panel tracks crushed the reading column to a sliver (one word per line) on a
        // narrowish window with both panels open. Phone drops to a single pane above.
        const floor=isNarrow?340:420;
        const mainCss='minmax('+floor+'px,1fr)';
        const cols=[];
        if(L) cols.push('minmax(0,264px)');
              cols.push(mainCss);
        if(C) cols.push('minmax(0,'+cw+'px)');
        if(R) cols.push('minmax(0,'+pw+'px)');
        base.gridCols=cols.join(' ');
        // Swap moves the side GROUPS (sources↔entities) to opposite ends; reading+chat
        // stay central, so swap never strands the page in a corner.
        const order={left:0,main:1,chat:2,right:3};
        if(this.state.swapped){ order.left=3; order.right=0; }
        base.leftOrder=order.left; base.mainOrder=order.main; base.chatOrder=order.chat; base.rightOrder=order.right;
      }
      // Resize handles (wide/mid only, not swapped — fixed `right:` anchoring assumes
      // the panel/chat hug the right edge). Entity handle at panelW; chat handle just
      // left of it at panelW+chatW.
      const showPanelH=R && !isPhone && !this.state.swapped;
      const showChatH=C && !isPhone && !this.state.swapped;
      base.resizeHandleStyle='position:fixed;top:54px;bottom:0;right:'+(pw-3)+'px;width:9px;z-index:40;cursor:col-resize;display:'+(showPanelH?'flex':'none')+';align-items:center;justify-content:center;';
      base.chatResizeHandleStyle='position:fixed;top:54px;bottom:0;right:'+((R?pw:0)+cw-3)+'px;width:9px;z-index:40;cursor:col-resize;display:'+(showChatH?'flex':'none')+';align-items:center;justify-content:center;';
    }
    // ── Layout presets + chat toggle + phone bottom nav ───────────────────────
    {
      const isPhone=this.phone();
      const ap=this.activePreset();
      const pillSty=on=>'font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;'+(on?'background:var(--card);color:var(--acc);box-shadow:0 1px 1px rgba(0,0,0,.05);':'color:var(--ink2);');
      base.presets=[
        {k:'focus',label:'Focus',title:'Reading only — hide chat and panels'},
        {k:'read',label:'Read',title:'Reading + entities panel'},
        {k:'research',label:'Research',title:'Reading + chat + entities'},
      ].map(p=>({label:p.label,title:p.title,onPick:()=>this.applyPreset(p.k),style:pillSty(ap===p.k)}));
      const chatActive=!!this.activeChatObj();
      base.chatToggleOn=chatActive;
      base.onToggleChat=()=>this.onToggleChat();
      base.chatToggleTitle=chatActive?'Hide chat':'Start a net-new chat';
      base.chatToggleStyle='display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;'+(chatActive?'color:var(--acc);background:var(--accbg);border:1px solid var(--accline);':'color:var(--ink2);background:var(--app);border:1px solid var(--line2);')+'border-radius:7px;padding:5px 10px;flex:0 0 auto;cursor:pointer;';
      // Phone bottom-nav tabs. Chat tab ensures a chat exists before switching pane.
      const pane=this.state.pane||'doc';
      const navSty=on=>'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px 6px;font-size:10px;font-weight:600;border:none;background:transparent;cursor:pointer;color:'+(on?'var(--acc)':'var(--ink3)')+';';
      base.navTabs=[
        {k:'sources',label:'Sources',pane:'sources'},
        {k:'doc',label:'Read',pane:'doc'},
        {k:'chat',label:'Chat',pane:'chat'},
        {k:'spine',label:'Spine',pane:'spine'},
      ].map(t=>({key:t.k,label:t.label,style:navSty(pane===t.pane),
        onPick:()=>{ if(t.pane==='chat'&&!this.activeChatObj())this.newChat(null); this.setPane(t.pane); }}));
      // Phone single-pane visibility. Off phone, regions follow their own open flags;
      // on phone exactly one region shows, chosen by `pane`. The chat pane is served by
      // the dedicated chat cell (chatDockedOn), so main only shows the reading pane.
      base.paneSources=pane==='sources'; base.paneDoc=pane==='doc'; base.paneChat=pane==='chat'; base.paneSpine=pane==='spine';
      base.notPhone=!isPhone; base.isPhone=isPhone;
      base.leftShow=isPhone? (pane==='sources') : this.state.leftOpen;
      base.rightShow=isPhone? (pane==='spine') : this.state.rightOpen;
      base.mainShow=isPhone? (pane==='doc') : true;
      // Bottom nav is a real grid row on phone (not a fixed overlay), so it never covers
      // the chat composer. The app shell adds an `auto` row for it on phone.
      base.appRows=isPhone?'auto auto 1fr auto':'auto auto 1fr';
      base.navStyle='display:'+(isPhone?'flex':'none')+';background:var(--card);border-top:1px solid var(--line);';
    }
    base.activity=this.activityVals();
    this.chatVals(base);

    // Project Gutenberg search results take the center when present (and no chat open).
    base.gutenOn=!base.chatOn&&!this.state.viewUrl&&(this.state.gutenLoading||this.state.gutenResults!=null);
    const _gcount=(this.state.gutenResults||[]).length;
    base.guten={loading:!!this.state.gutenLoading,query:this.state.gutenQuery||'',
      hasResults:!!(this.state.gutenResults&&this.state.gutenResults.length),
      empty:!!(this.state.gutenResults&&!this.state.gutenResults.length),
      countLabel:_gcount+' book'+(_gcount===1?'':'s'),
      onClear:()=>this.setState({gutenResults:null,gutenQuery:''}),
      results:(this.state.gutenResults||[]).map(b=>{const reading=this.state.gutenReading===b.id;
        return {title:b.title,author:this.authorDisplay(b.author),downloads:(b.downloads||0).toLocaleString()+' downloads',reading,
          hasCover:!!b.cover,
          coverStyle:'width:50px;height:74px;flex:0 0 auto;border-radius:5px;box-shadow:0 1px 4px rgba(20,24,30,.16);background:#eef0f3 center/cover no-repeat;'+(b.cover?'background-image:url(\''+String(b.cover).replace(/'/g,'%27')+'\');':''),
          tags:this._gutenTags(b).map(t=>({label:t,style:'display:inline-flex;align-items:center;font-size:10px;font-weight:600;color:var(--ink2);background:var(--app);border:1px solid var(--line2);border-radius:6px;padding:2px 7px;white-space:nowrap;'})),
          btnLabel:reading?'Reading…':'Read fully',onRead:()=>this.readGutenberg(b),
          rowStyle:'display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;background:var(--card);',
          btnStyle:'flex:0 0 auto;font-size:12px;font-weight:600;color:#fff;background:'+(reading?'#9aa1ab':'var(--acc)')+';border:none;border-radius:9px;padding:8px 14px;cursor:'+(reading?'default':'pointer')+';'};})};

    const vu=this.state.viewUrl;
    base.askPageOn=!!vu&&!/^search:/i.test(vu)&&!base.chatOn;   // the discoverable "Ask about this page" FAB
    // Reading toolbar. Over a stripped book (isBook) it carries the full e-reader typography
    // controls; over a NATIVE read page it carries just the contents nav, flagged passages,
    // and the Reader/Page mode toggle. Both render the same Contents + ❖ marks.
    { const rp=this.state.readPrefs||this._defaultRead,toc=this.state.bookToc||[],isBook=!!(vu&&this.state.bookView);
      const isWebUrl=!!(vu&&!/^text:/i.test(vu));
      const canToggleMode=isWebUrl&&this._bookReady(this.pageOf(vu));   // both renderings available once read
      const nativeNow=isWebUrl&&!this.state.bookView;                   // the live page is what's showing
      const pill=on=>'display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 9px;border:1px solid var(--line2);background:'+(on?'var(--accbg)':'var(--app)')+';color:'+(on?'var(--acc)':'var(--ink2)')+';border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;line-height:1;';
      base.reading={isBook,
        show:isBook||canToggleMode,
        canToggleMode,modeNative:nativeNow,
        modeLabel:nativeNow?'Reader':'Page',
        modeTitle:nativeNow?'Reading the live page with its own layout. Switch to the reader view — clean prose, no ads or chrome.':'Reading the stripped reader view. Switch to the live page with its own layout, contents and highlights laid on top.',
        onToggleMode:()=>this.toggleViewMode(),modeStyle:pill(false),
        btnStyle:pill(false),
        fsLabel:(rp.fs||19)+'px',onFontDown:()=>this.bumpFont(-1),onFontUp:()=>this.bumpFont(1),
        onLineDown:()=>this.bumpLine(-0.1),onLineUp:()=>this.bumpLine(0.1),
        widthLabel:(rp.w||720)<=600?'Narrow':((rp.w||720)>=860?'Wide':'Normal'),onWidth:()=>this.cycleWidth(),widthStyle:pill(false),
        fontLabel:rp.font==='sans'?'Sans':'Serif',onFont:()=>this.toggleReadFont(),fontStyle:pill(rp.font==='sans'),
        themeLabel:rp.theme==='sepia'?'Sepia':(rp.theme==='dark'?'Night':'Light'),onTheme:()=>this.cycleReadTheme(),themeStyle:pill(rp.theme!=='light'),
        hasToc:toc.length>1,tocOpen:!!this.state.tocOpen,onToggleTOC:()=>this.toggleTOC(),tocStyle:pill(!!this.state.tocOpen),
        onPrevSection:()=>this.jumpSection(-1),onNextSection:()=>this.jumpSection(1),
        toc:toc.map(c=>({label:c.label,onGo:()=>this.gotoChapter(c.id),
          rowStyle:'display:block;width:100%;text-align:left;padding:9px 13px 9px '+(13+((c.level||1)-1)*15)+'px;border:none;border-bottom:1px solid var(--line);background:transparent;color:var(--ink'+((c.level||1)>1?'3':'2')+');font-size:12.5px;line-height:1.35;cursor:pointer;'})),
        // Auto-bookmarks: a toggle + a marker rail down the page edge.
        hasMarks:(this.state.bookmarks||[]).length>0,marksCount:(this.state.bookmarks||[]).length,
        marksOn:!!this.state.bookmarkMode,onToggleMarks:()=>this.toggleBookmarks(),marksStyle:pill(!!this.state.bookmarkMode),
        onPrevMark:()=>this.jumpMark(-1),onNextMark:()=>this.jumpMark(1),
        railOn:!!this.state.bookmarkMode&&(this.state.bmRail||[]).length>0,
        marks:(this.state.bmRail||[]).map(m=>({top:(m.frac*100).toFixed(2)+'%',why:m.why||'Something important here',onGo:()=>this.gotoBookmark(m.id)})),
        progressPct:Math.round((this.state.bookProgress||0)*100),progressW:Math.round((this.state.bookProgress||0)*100)+'%'};
    }
    if(vu){
      base.showWeb=true;
      base.web={url:vu,host:/^search:/i.test(vu)?('Search · '+this.norm(vu.slice(7))):(/^text:/i.test(vu)?((this.pageOf(vu)||{}).title||'Imported text'):this.short(vu)),loading:!!this.state.pageLoading&&!this.state.pageDoc,
        err:(this.state.pageErr&&!this.state.pageDoc)?this.state.pageErr:null,hasDoc:!!this.state.pageDoc,doc:this.state.pageDoc||'',
        onReloadPage:()=>this.loadCenter(vu),detecting:this.state.detect&&this.state.busy};
    }

    const sm=this.state.sortMode||'updated';
    const sOn='font-size:10.5px;font-weight:600;color:var(--acc);background:var(--card);border:none;border-radius:5px;padding:3px 8px;cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.05);',
          sOff='font-size:10.5px;font-weight:500;color:var(--ink2);background:transparent;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;';
    base.sortUpdatedStyle=sm==='updated'?sOn:sOff;base.sortTopStyle=sm==='mentions'?sOn:sOff;base.sortAzStyle=sm==='name'?sOn:sOff;
    base.onSortUpdated=()=>this.setState({sortMode:'updated'});base.onSortTop=()=>this.setState({sortMode:'mentions'});base.onSortAz=()=>this.setState({sortMode:'name'});

    if(!ready||!g||this.state.pages.length===0){
      if(!vu&&!base.chatOn&&!base.gutenOn){
        this.landingVals(base);
      }
      return base;
    }

    const sel=this.state.selId&&g.entities.has(this.state.selId)?this.state.selId:this.topEntity();
    const q=(this.state.query||'').toLowerCase().trim();
    const lastSeen=new Map(),srcTally=new Map();
    for(const ev of this.master.events){if(ev.sentIdx==null)continue;const su=this.master.sentenceSource[ev.sentIdx];for(const x of [ev.id,ev.src,ev.tgt].filter(Boolean)){const r=g.representative(x);if((lastSeen.get(r)||-1)<ev.sentIdx)lastSeen.set(r,ev.sentIdx);if(su){let m=srcTally.get(r);if(!m){m=new Map();srcTally.set(r,m);}m.set(su,(m.get(su)||0)+1);}}}
    const ents=[...g.entities.values()].filter(e=>this.showable(e.id)&&(e.sightings||0)>=1);
    const cmp=sm==='name'?(a,b)=>this.labelOf(a.id).localeCompare(this.labelOf(b.id))
      :sm==='mentions'?(a,b)=>(b.sightings||0)-(a.sightings||0)||this.weightOf(b)-this.weightOf(a)
      :(a,b)=>((lastSeen.get(b.id)||0)-(lastSeen.get(a.id)||0))||this.weightOf(b)-this.weightOf(a);
    ents.sort(cmp);
    const primaryOf=new Map();
    ents.forEach(e=>{const m=srcTally.get(e.id);let best=null,bc=-1;if(m)for(const [u,c] of m){if(c>bc){bc=c;best=u;}}primaryOf.set(e.id,best);});
    // Per-source entity COUNT for the source-row subtitle ("· N entities") — the number of
    // showable entities that actually APPEAR (are mentioned) in that source, NOT the number
    // "homed" to it by primaryOf. Cross-source coreference folds a name shared by two sources
    // (a re-read of the same book, or an article overlapping a book) onto one referent; the
    // homed bucket then gives all those entities to a single source, leaving the other showing
    // ~0 even though the full text plainly carries them. Counting by mention restores each
    // source's true coverage — both copies of one book report their entities, not one-or-none.
    const entInSrc=new Map();this.master.pages.forEach(p=>entInSrc.set(p.url,0));
    ents.forEach(e=>{const m=srcTally.get(e.id);if(!m)return;for(const u of m.keys())if(entInSrc.has(u))entInSrc.set(u,entInSrc.get(u)+1);});
    const pagesByRecency=[...this.master.pages].sort((a,b)=>b.ts-a.ts);
    const bucket=new Map();pagesByRecency.forEach(p=>bucket.set(p.url,[]));
    const fallback=pagesByRecency.length?pagesByRecency[0].url:null;
    ents.forEach(e=>{let u=primaryOf.get(e.id);if(u==null||!bucket.has(u))u=fallback;if(u!=null&&bucket.has(u))bucket.get(u).push(e);});
    const groups=[];let shownTotal=0;
    pagesByRecency.forEach((p,gi)=>{let arr=bucket.get(p.url)||[];if(q)arr=arr.filter(e=>this.labelOf(e.id).toLowerCase().includes(q));if(!arr.length)return;shownTotal+=arr.length;const ov=this.state.openGroups[p.url];const open=q?true:(ov===undefined?gi===0:ov!==false);groups.push({sid:this.srcId(p.url),title:this.truncLabel(p.title,28),count:arr.length,open,caret:open?'▾':'▸',onToggle:()=>this.setState(s=>({openGroups:{...s.openGroups,[p.url]:!open}})),items:open?arr.slice(0,100).map(e=>this.entRow(e,sel)):[]});});
    base.groups=groups;base.inboxEmpty=shownTotal===0;base.inboxCount=ents.length;
    base.ledgerCount=this.master.pages.length;base.ledgerEmpty=this.master.pages.length===0;
    // Sources nest under the page you intentionally opened: a researched source is a
    // child of the page its research was launched from. Render as an indented tree.
    const allP=this.master.pages;
    const inSet=u=>!!(u&&allP.find(x=>x.url===u));
    const childrenOf=u=>pagesByRecency.filter(p=>p.parent===u);
    const collapsed=this.state.collapsedSrc||{};
    const orderedP=[];const seenP=new Set();
    const markSeen=p=>{if(seenP.has(p.url))return;seenP.add(p.url);childrenOf(p.url).forEach(markSeen);};
    const pushP=(p,depth)=>{if(seenP.has(p.url))return;seenP.add(p.url);const kids=childrenOf(p.url);
      orderedP.push({p,depth,kids:kids.length,collapsed:!!collapsed[p.url]});
      // A collapsed parent hides its researched subtree — mark it seen so it can't resurface
      // through the orphan-recovery pass below.
      if(collapsed[p.url])kids.forEach(markSeen);
      else kids.forEach(c=>pushP(c,Math.min(depth+1,2)));};
    pagesByRecency.filter(p=>!inSet(p.parent)).forEach(p=>pushP(p,0));
    pagesByRecency.forEach(p=>{if(!seenP.has(p.url))pushP(p,0);});
    base.sources=orderedP.map(({p,depth,kids,collapsed:col})=>{const c=this.hashColor(this.short(p.url)),isA=vu===p.url,cnt=entInSrc.get(p.url)||0;
      return {label:this.truncLabel(p.title,depth?38:42),host:this.short(p.url),url:p.url,count:cnt,active:isA,onOpen:()=>this.goWeb(p.url),onChat:ev=>{if(ev&&ev.stopPropagation)ev.stopPropagation();this.newChat(p.url);},
        hasKids:kids>0,collapsed:col,caret:col?'▸':'▾',collapseTitle:(col?'Show':'Hide')+' the '+kids+' source'+(kids!==1?'s':'')+' found from this one',
        onToggleCollapse:ev=>{if(ev&&ev.stopPropagation)ev.stopPropagation();this.toggleSrcCollapse(p.url);},
        caretStyle:'width:22px;height:22px;flex:0 0 auto;border:none;background:transparent;color:var(--ink3);border-radius:6px;cursor:pointer;font-size:11px;line-height:1;',
        dot:'width:'+(depth?16:20)+'px;height:'+(depth?16:20)+'px;border-radius:6px;flex:0 0 auto;background:'+c+'1a;color:'+c+';display:flex;align-items:center;justify-content:center;font-size:'+(depth?8:9)+'px;font-weight:800;',
        glyph:depth?'↳':(p.via==='REAFFERENCE'?'⟲':this.short(p.url).slice(0,2).toUpperCase()),
        rowStyle:'display:flex;align-items:center;gap:10px;padding:'+(depth?'7px 11px':'9px 11px')+';border-radius:9px;margin-bottom:3px;margin-left:'+(depth*15)+'px;cursor:pointer;border:1px solid '+(isA?'var(--accline)':'transparent')+';background:'+(isA?'var(--accbg)':'transparent')+';'+(depth?'border-left:2px solid '+c+'55;border-radius:0 9px 9px 0;':'')};});
    base.srcCount=this.master.pages.length;base.srcEmpty=this.master.pages.length===0&&(this.state.imports||[]).length===0;

    // The "+" new-tab surface, once you already have sources read: a blank centre that offers
    // the three kinds a tab can be. Side panels (sources / entities) are built above, so they
    // stay populated; only the centre yields to the landing. A chat or a page takes precedence.
    if((this.state.newTabOpen||this._activeTabKind()==='new')&&!vu&&!base.chatOn&&!base.gutenOn){
      this.landingVals(base);
      return base;
    }

    if(vu){
      this.hoverVals(base);
      this.linkChoiceVals(base);
      base.listFromPage=true;
      if(this.state.panelSel&&g.entities.has(this.state.panelSel)){base.panelProfileOn=true;base.panelListOn=false;base.panelProfile=this.panelProfile(this.state.panelSel,vu);}
      else if(this.state.previewWiki){base.previewOn=true;base.panelListOn=false;base.preview=this.previewVals();}
      else if(this.state.panelMode!=='entities'){const ov=this.pageOverview(vu);if(ov){base.panelPageOn=true;base.panelListOn=false;base.pageOverview=ov;}}
      return base;
    }
    // When an active chat fills the centre column (no page open, desktop/mid — not phone),
    // the chat owns <main>. Don't also build the centre entity explorer: `sel` falls back to
    // topEntity() even with nothing explicitly selected, so without this guard the explorer
    // renders stacked *below* the chat composer. Mirrors how gutenOn / showPrompt already
    // yield to the chat. The right-hand entity panel is independent of the centre, so keep it
    // working (clickEntity → panelProfile) before returning.
    if(base.chatOn && base.chatOverlayOn){
      if(this.state.panelSel&&g.entities.has(this.state.panelSel)){base.panelProfileOn=true;base.panelListOn=false;base.panelProfile=this.panelProfile(this.state.panelSel,null);}
      else if(this.state.previewWiki){base.previewOn=true;base.panelListOn=false;base.preview=this.previewVals();}
      return base;
    }
    if(!sel){base.showPrompt=true;base.simplePrompt=true;base.promptTitle='Select an entity';base.promptBody='Pick one from the list, or read another URL.';base.ent={name:'',gist:'',av:'',avStyle:'',meta:{sightings:0}};return base;}

    const e=g.entities.get(sel),lab=this.labelOf(sel),mentions=this.mentionsOf(sel),srcs=this.sourcesOf(sel),nbrs=this.neighbors(sel);
    const aliasCands=this.aliasesOf(sel).filter(a=>a!==lab);
    const realAliases=aliasCands.filter(a=>this.trueAlias(lab,a));
    const facets=aliasCands.filter(a=>!this.trueAlias(lab,a));
    const aliases=realAliases.slice(0,8).map(a=>({a,style:'display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:6px;color:var(--ink2);border:1px solid var(--line2);'}));
    const fmtDate=ts=>{try{return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});}catch(e){return '';}};
    const subjIdx=this.subjectSentences(sel),subjSet=new Set(subjIdx),apprIdx=mentions.filter(i=>!subjSet.has(i));
    const attIdx=subjIdx.filter(i=>this.bandOf(i)==='eva').sort((a,b)=>a-b);
    const attestedTexts=attIdx.map(i=>this.master.sentences[i]);
    // ── temporal cursor over the attested record ──────────────────────────
    // With two or more attested propositions there is a timeline to walk: k of
    // them, in reading order, are "in view". The summary is stitched from those,
    // so the cursor slides the summary back and forth through the time of the
    // text. k = N (the right edge, the default) is the whole record and the
    // stitch is byte-identical to the untimed summary.
    const attN=attIdx.length, cursorOn=attN>=2, curK=this.entCursorK(sel,attN);
    const scopedTexts=cursorOn?attestedTexts.slice(0,curK):attestedTexts;
    const cachedSum=this.state.summaries&&this.state.summaries[sel],sumSig=this.summarySig(sel),autoOn=false;
    let summaryText=null,sumModel=false,wikiBacked=false,wikiUrl=null,wikiTitle=null,wikiConf=false,srcComposed=false;
    if(cachedSum&&cachedSum.sig===sumSig&&!cursorOn){summaryText=cachedSum.text;sumModel=!!cachedSum.model;}
    else { summaryText=this.summaryFallback(scopedTexts); if(attestedTexts.length)setTimeout(()=>this.ensureSummary(sel,attestedTexts),0); }
    if(!summaryText){const w=this.wikiDef(sel);
      if(w&&w.text&&!w.none&&w.confirmed){summaryText=w.text;wikiBacked=true;wikiUrl=w.url;wikiTitle=w.title;wikiConf=true;}
      else{const gist=this.sourceGist(sel);if(gist){summaryText=gist;srcComposed=true;}
        if(!w&&(this.looksProperNoun(lab)||this.isGenericConcept(sel)))this.ensureWiki(sel);}}
    const synthN=cursorOn?curK:attestedTexts.length;
    // The cursor only rides the attested stitch — a wiki/gist summary has no
    // in-text timeline to walk, so it is left untimed.
    let cursorView={on:false};
    if(cursorOn&&!wikiBacked&&!srcComposed){
      const here=attIdx[curK-1],u=this.master.sentenceSource[here],p=this.pageOf(u),when=p&&p.ts?fmtDate(p.ts):'';
      cursorView={on:true,k:curK,n:attN,pct:Math.max(4,Math.round(curK/attN*100)),
        label:'as of proposition '+curK+' of '+attN,
        atLatest:curK>=attN,notLatest:curK<attN,when:when,hasWhen:!!when,host:this.short(u),
        whenLabel:when?('read '+when):'',
        onMove:ev=>{const v=ev&&ev.target?+ev.target.value:attN;this.setEntCursor(sel,v);},
        onLatest:()=>this.setEntCursor(sel,attN)};
    }
    base.hasSel=true;base.showPrompt=false;base.autoOn=autoOn;
    if(this.state.panelSel&&g.entities.has(this.state.panelSel)){
      base.panelProfileOn=true;base.panelListOn=false;
      base.panelProfile=this.panelProfile(this.state.panelSel,this.state.viewUrl);
    } else if(this.state.previewWiki){base.previewOn=true;base.panelListOn=false;base.preview=this.previewVals();}
    base.ent={name:lab,hasSummary:!!summaryText,
      summary:summaryText||('No established summary yet — so far '+lab+' is mostly mentioned, not described. '+(autoOn?'Enriching without being asked…':'Read more to establish it.')),
      summaryStyle:summaryText?'':'color:var(--ink3);font-style:italic;',
      synthMark:wikiBacked?('✦ Wikipedia · '+wikiTitle+' — matched to your graph'):(srcComposed?'✦ composed from your sources — not yet an attested definition':(summaryText?('✦ stitched verbatim from '+synthN+' attested proposition'+(synthN!==1?'s':'')+' — every line traced below'):'✦ nothing attested to summarize yet — only appearances')),
      wikiBacked:wikiBacked,wikiUrl:wikiUrl,wikiTitle:wikiTitle,
      cursor:cursorView,hasCursor:cursorView.on,
      av:this.initials(lab),avStyle:this.avatar(lab,46),avStyleSm:this.avatar(lab,24),meta:{sightings:e.sightings||mentions.length}};
    base.aliases=aliases;

    // ── first person: the attributive record — who said what, when ───────
    // Replaces the "view from nowhere" summary. Every surfaced claim is a quote
    // worn in attributive grammar (S2 reports / asserts / names), carrying its
    // source and the date it was read. The folded sentence is demoted to a
    // marked, defeasible composition the app stands behind; absence is the
    // reflexive VOID — the edge of what the app has actually read.
    // Each register a distinct marker: reports (documented), asserts (intent/claim),
    // names (in passing). Glyph + color + label, kept visibly apart.
    const REGV={eva:{verb:'reports',fg:'#1d4ed8',bg:'#e8eefc',gl:'\u25A0'},def:{verb:'asserts',fg:'#b45309',bg:'#fbf0db',gl:'\u25C6'},held:{verb:'names',fg:'#6b7280',bg:'#eef0f3',gl:'\u25CB'}};
    const fpRows=subjIdx.map(i=>{const b=this.bandOf(i),u=this.master.sentenceSource[i],p=this.pageOf(u),R=REGV[b]||REGV.held,ch=this.chip(u,active===u);
      return {sortw:b==='eva'?0:(b==='def'?1:2),verb:R.verb,glyph:R.gl,
        regStyle:'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+R.fg+';background:'+R.bg+';border-radius:5px;padding:2px 8px;flex:0 0 auto;',
        srcId:this.srcId(u),host:this.short(u),when:p?fmtDate(p.ts):'',hasWhen:!!(p&&p.ts),
        txt:this.stripRefs(this.norm(this.master.sentences[i])),jumpUrl:this.tfURL(u,this.master.sentences[i]),
        onOpen:()=>this.openSource(u),onEnter:()=>this.setHover(u),onLeave:()=>this.setHover(null),chip:ch,
        rowStyle:'padding:10px 13px;border-top:1px solid var(--line);'+((active&&active!==u)?'opacity:.24;transition:opacity .14s;':'opacity:1;transition:opacity .14s;')};});
    fpRows.sort((a,b)=>a.sortw-b.sortw);
    const fpHas=fpRows.length>0;
    const provOpen=!!this.state.provOpen;
    // distinct register legend, shown so the markers read as a vocabulary
    const seenB={};subjIdx.forEach(i=>{seenB[this.bandOf(i)]=true;});
    const legend=['eva','def','held'].filter(b=>seenB[b]).map(b=>{const R=REGV[b];return {label:R.verb,glyph:R.gl,
      style:'display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:'+R.fg+';'};});
    base.fp={
      has:fpHas, empty:!fpHas, openHas:fpHas&&provOpen,
      open:provOpen, caret:provOpen?'\u25BE':'\u25B8',
      toggleLabel:provOpen?'hide provenance':'trace provenance',
      onToggle:()=>this.setState(s=>({provOpen:!s.provOpen})),
      legend:legend, hasLegend:legend.length>0,
      intro:'How I come to be saying the above — each line is a quote, traceable to who said it and when. The sentence above is my fold of these; if it goes past them, they win.',
      rows:fpRows.slice(0,8), hasMore:fpRows.length>8, more:Math.max(0,fpRows.length-8),
      voidNote:'I have not read anything that defines '+lab+'. It has been named, never described. This is the edge of what I have read — not a claim that nothing is there.'
    };

    base.egoViz=this.egoGraph(sel,nbrs,facets);base.hasEgo=(nbrs.length>0||facets.length>0);base.egoMeta=nbrs.length+' connected'+(facets.length?' · '+facets.length+' also-called':'');

    const enter=u=>()=>this.setHover(u),leave=()=>()=>this.setHover(null),openC=u=>()=>this.openSource(u);
    const dimOf=u=>(active&&active!==u)?'opacity:.24;transition:opacity .14s;':'opacity:1;transition:opacity .14s;';

    // bands
    const BANDM={eva:{name:'Attested',fg:'#1d4ed8',bg:'#e8eefc',note:'reported / documented'},def:{name:'Asserted',fg:'#b45309',bg:'#fbf0db',note:'intent / claim'},held:{name:'Mentioned',fg:'#6b7280',bg:'#eef0f3',note:'named in passing'}};
    const bands={eva:[],def:[],held:[]};subjIdx.forEach(i=>bands[this.bandOf(i)].push(i));
    const cE=bands.eva.length,cD=bands.def.length,cH=bands.held.length,tot=cE+cD+cH||1;
    let eL,eC;if(cE/tot>=.45){eL='well attested';eC='#1d4ed8';}else if(cD/tot>=.4){eL='mostly asserted';eC='#b45309';}else{eL='mostly mentioned';eC='#6b7280';}
    base.est={label:eL,labelStyle:'font-size:12.5px;font-weight:600;color:'+eC+';',dot:'width:8px;height:8px;border-radius:50%;background:'+eC+';display:inline-block;',
      segs:[[cE,'#1d4ed8'],[cD,'#b45309'],[cH,'#6b7280']].filter(([n])=>n>0).map(([n,c])=>({style:'width:'+(n/tot*100)+'%;background:'+c+';display:block;'}))};
    base.statList=[{k:'about',v:subjIdx.length},{k:'links',v:nbrs.length},{k:'sources',v:srcs.length}];
    base.bandSections=['eva','def','held'].filter(b=>bands[b].length).map(b=>({name:BANDM[b].name,note:BANDM[b].note,count:bands[b].length,
      pillStyle:'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:'+BANDM[b].fg+';background:'+BANDM[b].bg+';border-radius:20px;padding:3px 10px;',pillDot:'width:7px;height:7px;border-radius:50%;background:'+BANDM[b].fg+';display:inline-block;',
      claims:bands[b].slice(0,12).map(i=>{const u=this.master.sentenceSource[i],ch=this.chip(u,active===u);return {txt:this.norm(this.master.sentences[i]),srcId:this.srcId(u),chipStyle:ch.style,dotStyle:ch.dot,onChip:openC(u),onEnter:enter(u),onLeave:leave(),jumpUrl:this.tfURL(u,this.master.sentences[i]),dim:dimOf(u)};})}));

    base.hasBandSections=base.bandSections.length>0;base.noBandSections=base.bandSections.length===0;
    base.apprClaims=apprIdx.slice(0,10).map(i=>{const u=this.master.sentenceSource[i],ch=this.chip(u,active===u);return {txt:this.norm(this.master.sentences[i]),srcId:this.srcId(u),chipStyle:ch.style,dotStyle:ch.dot,onChip:openC(u),onEnter:enter(u),onLeave:leave(),jumpUrl:this.tfURL(u,this.master.sentences[i]),dim:dimOf(u)};});
    base.hasAppr=apprIdx.length>0;base.apprCount=apprIdx.length;

    // relations
    const GRAINC={Ground:'#386a96',Figure:'#a3692c',Pattern:'#3c7a50'};
    const rels=nbrs.slice(0,14).map(n=>{const u=n.sent!=null?this.master.sentenceSource[n.sent]:null,ch=u?this.chip(u,active===u):null,olab=this.labelOf(n.id);
      const gr=n.grain||'Figure',gc=GRAINC[gr]||GRAINC.Figure;
      return {toLabel:olab,rel:this.relVerb(n.vias[0]||'related'),onClick:()=>this.clickEntity(n.id),onEnter2:ev=>this.entHover(n.id,ev),onLeave2:()=>this.entLeave(),
        grain:gr,llm:!!n.llm,grainTitle:'grain · '+gr+' (proposition embedded, verb dropped, tested against the band)',
        grainStyle:'display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:600;color:'+gc+';background:'+gc+'14;border-radius:5px;padding:1px 6px;flex:0 0 auto;',grainDot:'width:5px;height:5px;border-radius:50%;background:'+gc+';display:inline-block;',
        countLabel:'',hasSrc:!!u,srcId:u?this.srcId(u):'',chipStyle:u?ch.style:'',dotStyle:u?ch.dot:'',onChip:u?openC(u):(()=>{}),onEnter:u?enter(u):(()=>{}),onLeave:leave(),dim:u?dimOf(u):'',av:this.initials(olab),avStyle:this.avatar(olab,28)};});
    base.relations=rels;base.relCount=nbrs.length;base.hasRelations=rels.length>0;

    // ── source chips on the panel: which sources feed this profile ──────
    // sources split: pages the reader intentionally opened are primary; pages EO
    // pulled in on its own (REAFFERENCE / self-enrich) sit behind a disclosure click.
    const chipOf=u=>{const ch=this.chip(u,active===u),p=this.pageOf(u);return {id:this.srcId(u),host:this.short(u),style:ch.style,dot:ch.dot,onChip:openC(u),onEnter:enter(u),onLeave:leave(),title:(p&&p.title)||u};};
    const learnedU=srcs.filter(u=>{const p=this.pageOf(u);return !!(p&&p.via==='REAFFERENCE');});
    const intentU=srcs.filter(u=>{const p=this.pageOf(u);return !(p&&p.via==='REAFFERENCE');});
    base.srcChips=intentU.map(chipOf);
    base.learnedChips=learnedU.map(chipOf);
    base.hasSrcChips=srcs.length>0;
    base.hasLearned=learnedU.length>0;
    const learnedOpen=!!this.state.learnedOpen;
    base.learnedOpenHas=base.hasLearned&&learnedOpen;
    base.learnedCaret=learnedOpen?'\u25BE':'\u25B8';
    base.learnedToggleLabel=(learnedOpen?'hide ':'+ ')+learnedU.length+' found on its own';
    base.onToggleLearned=()=>this.setState(s=>({learnedOpen:!s.learnedOpen}));
    base.srcChipsLabel=intentU.length?(intentU.length+(intentU.length===1?' source you opened':' sources you opened')):'self-learned only';

    // ── explicit research consent: EO no longer self-learns on its own. The user
    // decides whether to look further, and picks breadth or depth. ───────────
    const _lr=this.state.liveResearch||{},_researchingThis=!!(_lr.on&&_lr.focal===sel);
    base.askBusy=!!this._busy||_researchingThis;
    base.askIdle=!base.askBusy;
    base.askLabel=_researchingThis?('Researching '+lab+'…'):'Should I research more?';
    base.askSub=_researchingThis
      ?(_lr.phase==='read'?('Reading '+(_lr.host||'a new source')+'…'):('Searching the web for more on '+lab+'…'))
      :(srcs.length?('I won’t add sources on my own — '+srcs.length+' read so far. Widen out, or dig in.'):'I won’t add sources on my own — choose how to look.');
    base.onAskBreadth=()=>{this.setState({mode:'breadth'});this.research(sel,'breadth');};
    base.onAskDepth=()=>{this.setState({mode:'depth'});this.research(sel,'depth');};
    base.onAskResearch=()=>{this.research(sel,this.state.mode||'breadth');};

    // ── audit mode: integral fold vs. Wikipedia, + raw graph contents ───
    base.auditOn=this.state.auditMode;
    if(this.state.auditMode){
      const foldDef=this.summaryFallback(attestedTexts)||this.sourceGist(sel)||null;
      base.hasFoldDef=!!foldDef;base.noFoldDef=!foldDef;base.foldDef=foldDef||'';
      base.foldMeta=synthN+' attested proposition'+(synthN!==1?'s':'')+' · '+srcs.length+(srcs.length===1?' source':' sources');
      base.foldEmpty='“'+lab+'” is only named so far — no defining proposition to fold into a referent yet.';
      const w=this.wikiDef(sel),wikiText=(w&&w.text&&!w.none&&w.confirmed)?w.text:null;
      if(!w&&(this.looksProperNoun(lab)||this.isGenericConcept(sel)))this.ensureWiki(sel); // audit always wants the wiki referent to compare against
      base.hasWikiText=!!wikiText;base.wikiText=wikiText||'';base.wikiTitle=(w&&w.title)||'';base.wikiUrl=(w&&w.url)||'';
      base.wikiAbsent=!wikiText&&!!(w&&w.none);base.wikiWait=!wikiText&&!(w&&w.none);
      const cmp=(foldDef&&wikiText)?this.defCompare(foldDef,wikiText):null;
      base.hasCompare=!!cmp;
      if(cmp){
        const tagChip=c=>'display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:'+c+';background:'+c+'14;border:1px solid '+c+'33;border-radius:6px;padding:1px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;';
        base.cmpPct=cmp.pct+'%';
        base.cmpShared=cmp.shared.slice(0,14).map(t=>({t,style:tagChip('#15803d')}));base.cmpHasShared=cmp.shared.length>0;
        base.cmpFold=cmp.aOnly.slice(0,14).map(t=>({t,style:tagChip(_acc)}));base.cmpHasFold=cmp.aOnly.length>0;
        base.cmpWiki=cmp.bOnly.slice(0,14).map(t=>({t,style:tagChip('#2563eb')}));base.cmpHasWiki=cmp.bOnly.length>0;
      }
      const BMN={eva:'attested',def:'asserted',held:'mentioned'};
      const trip=this.entityTriples(sel);
      const auditObj={
        entity:{id:sel,label:lab,aliases:realAliases,also_called:facets,sightings:base.ent.meta.sightings,sources:srcs.map(u=>this.srcId(u)),links:nbrs.length},
        definition:{integral_fold:foldDef||null,fold_from:{attested_propositions:synthN,sources:srcs.length},wikipedia:wikiText||null,wikipedia_title:(w&&w.title)||null,referent_overlap:cmp?cmp.pct/100:null},
        propositions_as_subject:trip.subj,
        propositions_as_object:trip.obj,
        mentioned_in:{count:apprIdx.length,bands:apprIdx.reduce((m,i)=>{const b=BMN[this.bandOf(i)];m[b]=(m[b]||0)+1;return m;},{})}
      };
      base.auditText=JSON.stringify(auditObj,null,2);
      base.auditPropCount=trip.subj.length+trip.obj.length;
      base.auditExpanded=!this.state.auditCollapsed;
      base.auditCollapseLabel=this.state.auditCollapsed?'Show':'Hide';
      base.onToggleAuditCollapse=()=>this.setState(s=>({auditCollapsed:!s.auditCollapsed}));
      base.auditCopyLabel=this.state.auditCopied?'Copied ✓':'Copy';
      base.onCopyAudit=()=>{try{navigator.clipboard.writeText(base.auditText);}catch(e){}this.setState({auditCopied:true});clearTimeout(this._auditCopyT);this._auditCopyT=setTimeout(()=>this.setState({auditCopied:false}),1400);};
    }

    // voids
    const vds=this.graph.voids.filter(v=>v.node===sel);
    base.hasVoids=vds.length>0;base.voids=vds.map(v=>({txt:v.rel?('No '+v.rel):'Asserted absence',ctx:v.sentIdx!=null?this.norm(this.master.sentences[v.sentIdx]).slice(0,150):''}));

    // related media — only the sources that actually mention THIS entity
    const srcSet=new Set(srcs);
    base.media=this.master.pages.filter(p=>srcSet.has(p.url)).map(p=>{const c=this.hashColor(this.short(p.url)),thumb=p.image;
      const grad='linear-gradient(120deg,'+c+','+c+'bb)';
      return {title:p.title,host:this.short(p.url),meta:'read '+this.fmtTime(p.ts),url:p.url,glyph:(p.via==='REAFFERENCE'?'⟲':'¶'),noImg:!thumb,
        onEnter:enter(p.url),onLeave:leave(),onOpen:()=>this.openSource(p.url,true,'page'),
        thumbStyle:'position:relative;height:94px;border-radius:9px;border:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;background:'+(thumb?("url('"+String(thumb).replace(/'/g,"%27")+"'), "+grad+";background-size:cover;background-position:center;"):(grad+";"))};});
    base.hasMedia=base.media.length>0;

    // ledger
    base.ledger=this.master.pages.map(p=>{const isA=active===p.url,c=this.hashColor(this.short(p.url)),cnt=this.master.sentenceSource.filter(u=>u===p.url).length;
      return {sid:this.srcId(p.url),label:p.title,host:this.short(p.url),read:this.fmtTime(p.ts),tstamp:'read '+new Date(p.ts).toLocaleString(),count:cnt,learnMark:p.via==='REAFFERENCE'?'⟲ ':'',
        dot:'width:10px;height:10px;border-radius:50%;background:'+c+';display:inline-block;flex-shrink:0;',onEnter:enter(p.url),onLeave:leave(),onOpen:openC(p.url),
        style:'border:1px solid '+(isA?c:'var(--line)')+';border-left:3px solid '+c+';border-radius:8px;padding:9px 11px;margin-bottom:8px;cursor:pointer;transition:all .12s;background:'+(isA?'#f7f9fc':'var(--card)')+';'};});

    // frontier
    const fr=this.frontier(sel);
    const FK={void:{fg:'#9a6b12',bar:'#d6a83a'},conflict:{fg:'#b91c1c',bar:'#dc2626'},deepen:{fg:'#1d4ed8',bar:'#1d4ed8'}};
    base.frontier=fr.map(it=>({kind:it.kind,label:it.label,tagStyle:'font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+FK[it.kind].fg+';background:'+FK[it.kind].fg+'14;border-radius:5px;padding:2px 6px;flex:0 0 auto;',barStyle:'width:'+Math.round(100*Math.min(1,it.score/3))+'%;background:'+FK[it.kind].bar+';display:block;',onFocus:()=>this.setState({direction:it.query})}));
    base.hasFrontier=fr.length>0;base.frontierQuiet=fr.length===0;

    // research controls
    const md=this.state.mode,segOn='font-size:12px;font-weight:600;color:var(--acc);background:var(--card);border:none;border-radius:7px;padding:6px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06);',segOff='font-size:12px;font-weight:500;color:var(--ink2);background:transparent;border:none;border-radius:7px;padding:6px 12px;',busy=this.state.busy;
    base.breadthStyle=md==='breadth'?segOn:segOff;base.depthStyle=md==='depth'?segOn:segOff;base.onBreadth=()=>this.setState({mode:'breadth'});base.onDepth=()=>this.setState({mode:'depth'});
    base.modeHint=(busy?'Working…':'Research — searches and reads more sources.')+(this.state.direction.trim()&&!busy?'  ·  aimed at “'+this.state.direction.trim()+'”':'');
    base.onResearch=()=>this.research();base.researchLabel=busy?'Researching…':'Research';base.researchGlyph=busy?'◐':'✦';base.researchIcon='display:inline-block;margin-right:7px;'+(busy?'animation:eospin .9s linear infinite;':'');
    base.researchStyle='display:inline-flex;align-items:center;font-size:13px;font-weight:600;color:#fff;background:'+(busy?'#7ea3e8':'var(--acc)')+';border:none;border-radius:9px;padding:9px 16px;box-shadow:0 1px 2px rgba(37,99,235,.3);'+(busy?'cursor:default;':'');
    const FEED={search:{i:'',c:'#2563eb'},found:{i:'',c:'#2563eb'},read:{i:'',c:'#b45309'},graph:{i:'',c:'#15803d'},done:{i:'',c:'#1b1f24'},warn:{i:'',c:'#dc2626'}};
    base.feed=this.state.feed.filter(l=>l.ent==null||l.ent===sel).map(l=>l.sep?{isSep:true,isLine:false,text:l.sep}:{isLine:true,isSep:false,icon:(FEED[l.k]||{i:'\u00b7'}).i,icStyle:'flex:0 0 auto;width:15px;text-align:center;font-family:\'Phosphor\';font-size:12px;color:'+((FEED[l.k]||{c:'#9aa1ab'}).c)+';',text:l.t,rowStyle:l.k==='done'?'font-weight:500;':''});
    base.hasFeed=base.feed.length>0;

    // hovercard
    this.hoverVals(base);

    // source panel
    if(this.state.openSrc&&this.pageOf(this.state.openSrc)){const url=this.state.openSrc,p=this.pageOf(url),c=this.hashColor(this.short(url));
      const idxs=[];this.master.sentenceSource.forEach((u,i)=>{if(u===url)idxs.push(i);});
      const tagColor={eva:'#1d4ed8',def:'#b45309',held:'#6b7280'},tagName={eva:'attested',def:'asserted',held:'mentioned'};
      const selMentions=new Set(this.mentionsOf(sel));
      const props=idxs.map(i=>{const b=this.bandOf(i),about=selMentions.has(i),txt=this.norm(this.master.sentences[i]);return {txt,body:this.linkifyNode(txt,url),tag:tagName[b],about,tagStyle:'font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+tagColor[b]+';',rowStyle:'padding:10px 0;border-bottom:1px solid #f0f1f3;'+(about?'background:linear-gradient(90deg,#eef3fc 0,transparent 60%);margin:0 -8px;padding-left:8px;padding-right:8px;border-radius:6px;':'')};});
      props.sort((a,b)=>(b.about?1:0)-(a.about?1:0));
      const wide=this.state.srcWide,isText=/^text:/i.test(url),tab=(this.state.srcTab||'page'),canEmbed=!isText,showPage=tab==='page'&&canEmbed,showProps=!showPage;
      const tabOn='font-size:12px;font-weight:600;color:var(--acc);background:var(--accbg);border:1px solid var(--accline);border-radius:8px;padding:5px 12px;cursor:pointer;',tabOff='font-size:12px;font-weight:500;color:var(--ink2);background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:5px 12px;cursor:pointer;';
      let urlPath='';try{const _u=new URL(url);urlPath=(_u.pathname+_u.search)||'/';}catch(e){urlPath=isText?' reader text':'';}
      base.srcOpen=true;base.srcWide=wide;base.srcView={sid:this.srcId(url),label:p.title,host:this.short(url),urlPath,read:this.fmtTime(p.ts),url,dot:'width:11px;height:11px;border-radius:50%;background:'+c+';display:inline-block;flex:0 0 auto;',total:props.length,aboutCount:props.filter(x=>x.about).length,props,
        panelStyle:'position:absolute;top:0;right:0;bottom:0;width:'+(wide?'min(1180px,94vw)':'468px')+';max-width:96vw;background:var(--card);border-left:1px solid var(--line);box-shadow:-12px 0 44px rgba(0,0,0,.14);z-index:21;display:flex;flex-direction:column;animation:eoslide .18s ease-out;transition:width .2s ease;',
        canEmbed,showPage,showProps,loading:!!this.state.srcLoading&&!this.state.srcDoc,err:(this.state.srcErr&&!this.state.srcDoc)?this.state.srcErr:null,hasDoc:!!this.state.srcDoc,doc:this.state.srcDoc||'',
        pageTabStyle:showPage?tabOn:tabOff,propsTabStyle:showProps?tabOn:tabOff,onPage:()=>this.setSrcTab('page'),onProps:()=>this.setSrcTab('props'),
        onWide:()=>this.toggleWide(),wideIcon:wide?'⤡':'⤢',wideTitle:wide?'Read in brief':'Expand full width',onReload:()=>this.loadEmbed(url),
        linkMode:this.state.linkMode,onToggleLink:()=>this.toggleLinkMode(),
        linkBtnStyle:'display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border-radius:8px;padding:5px 11px;cursor:pointer;'+(this.state.linkMode?'color:var(--acc);background:var(--accbg);border:1px solid var(--accline);':'color:var(--ink2);background:var(--card);border:1px solid var(--line2);')};}
    this.linkChoiceVals(base);

    base.footNote='Live projection of your reading log over the real eoreader4 engine. Each URL is fetched through your proxy, parsed into propositions, and folded into one append-only log; the graph — and every profile — re-projects from it at the latest cursor. Relations and bands are the engine’s raw output: candidates to check against the passage, not verdicts.';
    return base;
  }
}
