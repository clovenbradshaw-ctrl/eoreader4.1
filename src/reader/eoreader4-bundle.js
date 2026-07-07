// src/core/operators.js
var MODES = Object.freeze(["Differentiate", "Relate", "Generate"]);
var DOMAINS = Object.freeze(["Existence", "Structure", "Interpretation"]);
var GRAINS = Object.freeze(["Ground", "Figure", "Pattern"]);
var OPERATORS = Object.freeze({
  NUL: Object.freeze({ id: "NUL", mode: "Differentiate", domain: "Existence", label: "hold (non-transformation)" }),
  SEG: Object.freeze({ id: "SEG", mode: "Differentiate", domain: "Structure", label: "resplit" }),
  DEF: Object.freeze({ id: "DEF", mode: "Differentiate", domain: "Interpretation", label: "assert/define" }),
  SIG: Object.freeze({ id: "SIG", mode: "Relate", domain: "Existence", label: "attribute" }),
  CON: Object.freeze({ id: "CON", mode: "Relate", domain: "Structure", label: "bond" }),
  EVA: Object.freeze({ id: "EVA", mode: "Relate", domain: "Interpretation", label: "evaluate" }),
  INS: Object.freeze({ id: "INS", mode: "Generate", domain: "Existence", label: "instantiate" }),
  SYN: Object.freeze({ id: "SYN", mode: "Generate", domain: "Structure", label: "synthesize" }),
  REC: Object.freeze({ id: "REC", mode: "Generate", domain: "Interpretation", label: "learn rule" })
});
var isOperator = (op) => typeof op === "string" && op in OPERATORS;
var operatorsByDomain = (domain) => Object.values(OPERATORS).filter((o) => o.domain === domain);

// src/core/cube.js
var STANCES = Object.freeze({
  Differentiate: Object.freeze({ Ground: "Clearing", Figure: "Dissecting", Pattern: "Unraveling" }),
  Relate: Object.freeze({ Ground: "Tending", Figure: "Binding", Pattern: "Tracing" }),
  Generate: Object.freeze({ Ground: "Cultivating", Figure: "Making", Pattern: "Composing" })
});
var TERRAINS = Object.freeze({
  Existence: Object.freeze({ Ground: "Void", Figure: "Entity", Pattern: "Kind" }),
  Structure: Object.freeze({ Ground: "Field", Figure: "Link", Pattern: "Network" }),
  Interpretation: Object.freeze({ Ground: "Atmosphere", Figure: "Lens", Pattern: "Paradigm" })
});
var stanceOf = (mode, grain) => STANCES[mode]?.[grain] ?? null;
var terrainOf = (domain, grain) => TERRAINS[domain]?.[grain] ?? null;
var STANCE_GRAIN = /* @__PURE__ */ new Map();
var TERRAIN_GRAIN = /* @__PURE__ */ new Map();
for (const mode of MODES)
  for (const grain of GRAINS) STANCE_GRAIN.set(STANCES[mode][grain], { mode, grain });
for (const domain of DOMAINS)
  for (const grain of GRAINS) TERRAIN_GRAIN.set(TERRAINS[domain][grain], { domain, grain });
var cellOf = (op, grain) => {
  const o = OPERATORS[op?.id ?? op];
  if (!o || !GRAINS.includes(grain)) return null;
  const stance = stanceOf(o.mode, grain);
  const terrain = terrainOf(o.domain, grain);
  return Object.freeze({
    key: `${o.id}_${stance}_${terrain}`,
    op: o.id,
    mode: o.mode,
    domain: o.domain,
    grain,
    stance,
    terrain
  });
};
var DIAGONAL_CELLS = Object.freeze((() => {
  const cells = {};
  for (const op of Object.keys(OPERATORS))
    for (const grain of GRAINS) {
      const c = cellOf(op, grain);
      cells[c.key] = c;
    }
  return Object.freeze(cells);
})());
var SIGNATURES = Object.freeze({
  Differentiate: Object.freeze({ mode: "Differentiate", polarity: "subtractive", reads: "one", writes: "void", label: "read-and-void" }),
  Relate: Object.freeze({ mode: "Relate", polarity: "connective", reads: "two", writes: "link", label: "read-two-write-link" }),
  Generate: Object.freeze({ mode: "Generate", polarity: "additive", reads: "none", writes: "new", label: "write-new" })
});
var OPERATOR_ALIASES = Object.freeze({ ALT: "DEF", SUP: "EVA" });
var STANCE_ALIASES = Object.freeze({});
{
  const stanceNames = MODES.flatMap((m) => GRAINS.map((g) => STANCES[m][g]));
  const terrainNames = DOMAINS.flatMap((d) => GRAINS.map((g) => TERRAINS[d][g]));
  const cellCount = Object.keys(DIAGONAL_CELLS).length;
  if (new Set(stanceNames).size !== 9 || new Set(terrainNames).size !== 9 || cellCount !== 27)
    throw new Error("cube self-check failed: stances/terrains/diagonal are not a clean 9/9/27");
}

// src/core/address.js
var inferGrain = (event) => {
  if (event.grain) return event.grain;
  if (event.op === "REC" || event.op === "SYN" || event.op === "CON") return "Pattern";
  if (event.op === "INS" || event.op === "NUL") return "Ground";
  return "Figure";
};
var eoAddressOfEvent = (event) => {
  const op = OPERATORS[event?.op];
  if (!op) return null;
  const grain = inferGrain(event);
  return Object.freeze({
    operator: op.id,
    act: Object.freeze({ mode: op.mode, domain: op.domain }),
    site: Object.freeze({ domain: op.domain, grain, terrain: terrainOf(op.domain, grain) }),
    resolution: Object.freeze({ mode: op.mode, grain, stance: stanceOf(op.mode, grain) })
  });
};

// src/core/holon.js
var SEP = ".";
var fnv1a = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
var canon = (path) => String(path ?? "").split(SEP).map((s) => s.trim()).filter(Boolean).join(SEP);
var holonId = (path) => fnv1a(canon(path));
var parseHolon = (path) => {
  const c = canon(path);
  const segments = c ? c.split(SEP) : [];
  return Object.freeze({
    path: c,
    segments: Object.freeze(segments),
    depth: segments.length,
    // the holonic level of the target
    leaf: segments[segments.length - 1] ?? null,
    parent: segments.length > 1 ? segments.slice(0, -1).join(SEP) : null,
    id: holonId(c)
  });
};

// src/core/faces.js
var FACES = Object.freeze({
  Act: Object.freeze({ axes: Object.freeze(["Mode", "Domain"]), asks: "what is done", value: "operator" }),
  Site: Object.freeze({ axes: Object.freeze(["Domain", "Object"]), asks: "where it lands", value: "terrain" }),
  Stance: Object.freeze({ axes: Object.freeze(["Mode", "Object"]), asks: "how it is done", value: "stance" })
});
var facesOf = (event) => {
  const addr = eoAddressOfEvent(event);
  if (!addr) return null;
  const targetPath = event.holon ?? event.node ?? event.src ?? event.id ?? null;
  const holon = targetPath != null ? parseHolon(String(targetPath)) : null;
  return Object.freeze({
    act: addr.act,
    site: Object.freeze({ ...addr.site, ...holon ? { holon } : {} }),
    stance: Object.freeze({ mode: addr.resolution.mode, grain: addr.resolution.grain, stance: addr.resolution.stance })
  });
};

// src/core/log.js
var nextLogId = 1;
var sealGeometry = (event) => {
  let f = null;
  try {
    f = facesOf(event);
  } catch {
    f = null;
  }
  if (!f) return null;
  const holon = f.site.holon || null;
  const siteStr = holon ? `${holon.path}@${f.site.terrain}` : f.site.terrain;
  return Object.freeze({
    notation: `${event.op}(${siteStr}, ${f.stance.stance})`,
    terrain: f.site.terrain,
    stance: f.stance.stance,
    address: holon ? Object.freeze({ path: holon.path, id: holon.id, depth: holon.depth }) : null
  });
};
var createLog = ({ docId } = {}) => {
  const id = nextLogId++;
  const events = [];
  const subscribers = /* @__PURE__ */ new Set();
  const append = (event) => {
    if (!event || !isOperator(event.op)) {
      throw new TypeError(`log.append: invalid event ${JSON.stringify(event)}`);
    }
    const eo = sealGeometry(event);
    const sealed = Object.freeze({
      ...event,
      seq: events.length,
      t: event.t ?? Date.now(),
      ...eo ? { eo } : {}
    });
    events.push(sealed);
    for (const fn of subscribers) {
      try {
        fn(sealed);
      } catch {
      }
    }
    return sealed;
  };
  const retract = (refSeq, reason) => append({ op: "SEG", kind: "retract", refSeq, reason });
  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  return {
    id,
    docId,
    append,
    retract,
    subscribe,
    get events() {
      return events;
    },
    get length() {
      return events.length;
    },
    snapshot() {
      return events.slice();
    },
    filter(pred) {
      return events.filter(pred);
    },
    last(n = 1) {
      return events.slice(-n);
    }
  };
};

// src/core/project.js
var DEFAULT_PROJECTION_RULES = Object.freeze({
  // Mass decays at γ per sentence distance from the cursor.
  // engine.js READING_RULES.decay_gamma.value.
  decay_gamma: 0.7,
  // Edges below this weight are pruned from the projection. 0 disables.
  edge_weight_floor: 0
});
var memo = /* @__PURE__ */ new WeakMap();
var projectGraph = (log, frame = {}) => {
  const rules = { ...DEFAULT_PROJECTION_RULES, ...frame.rules || {} };
  const fullFrame = { ...frame, rules };
  const frameSig = canonicalFrame(fullFrame);
  const cached = memo.get(log);
  if (cached && cached.length === log.length && cached.frameSig === frameSig) {
    return cached.result;
  }
  const result = computeProjection(log, fullFrame);
  memo.set(log, { length: log.length, frameSig, result });
  return result;
};
var projectionStats = (log) => {
  const c = memo.get(log);
  return c ? { cached: true, atLength: c.length, frameSig: c.frameSig } : { cached: false };
};
var canonicalFrame = (f) => {
  const ser = (v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v).sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + ser(v[k])).join(",") + "}";
    }
    return JSON.stringify(v);
  };
  return ser(f);
};
var computeProjection = (log, frame) => {
  const events = log.snapshot();
  const entities = /* @__PURE__ */ new Map();
  const edges = [];
  const voidsRaw = [];
  const parent = /* @__PURE__ */ new Map();
  const retracted = /* @__PURE__ */ new Set();
  const find = (x) => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    return p;
  };
  for (const e of events) {
    if (e.op === "SEG" && e.kind === "retract" && e.refSeq != null) {
      retracted.add(e.refSeq);
    }
  }
  for (const e of events) {
    if (retracted.has(e.seq)) continue;
    if (e.kind === "void") {
      voidsRaw.push({
        node: e.node ?? (e.src && e.src !== "[void]" ? e.src : e.tgt),
        rel: e.rel ?? e.via ?? null,
        sentIdx: e.sentIdx ?? null,
        seq: e.seq
      });
      continue;
    }
    switch (e.op) {
      case "INS": {
        const ent = entities.get(e.id) || {
          id: e.id,
          label: e.label,
          props: {},
          sightings: 0,
          firstSeen: e.seq
        };
        ent.sightings++;
        entities.set(e.id, ent);
        break;
      }
      case "DEF": {
        const ent = entities.get(e.id);
        if (ent) ent.props[e.key] = e.value;
        break;
      }
      case "SIG":
      case "CON":
        edges.push({
          from: e.src,
          to: e.tgt,
          kind: e.op.toLowerCase(),
          via: e.via,
          // The polarity/modality channel rides through verbatim when present — a
          // negated or hedged bond ("could not understand", "seemed clear") must
          // keep its sign and mood all the way to the reading, never silently
          // flattened to the positive. Absent on a plain bond (positive · realis).
          ...e.polarity ? { polarity: e.polarity } : {},
          ...e.modality ? { modality: e.modality } : {},
          seq: e.seq,
          sentIdx: e.sentIdx,
          // Coupling: a referent resolved by field rather than by name carries
          // a sub-unit weight. The projection measures the field scaled by it;
          // a certain bond has no `w` and couples at 1.
          coupling: e.w == null ? 1 : e.w,
          // Provenance: a derived edge (e.g. the descriptor trigger's inferred
          // kinship hop) is defeasible. The edge-grounding veto reads this flag —
          // a derived filler never satisfies the functional-axiom witness rule.
          derived: !!e.derived
        });
        break;
      case "SYN":
        if (e.kind === "merge") parent.set(find(e.from), find(e.to));
        break;
    }
  }
  const merged = /* @__PURE__ */ new Map();
  for (const [id, ent] of entities) {
    const root = find(id);
    const m = merged.get(root) || { ...ent, id: root, sightings: 0 };
    m.sightings += ent.sightings;
    merged.set(root, m);
  }
  const cursor = frame.cursor == null || !isFinite(frame.cursor) ? Infinity : frame.cursor;
  const \u03B3 = frame.rules.decay_gamma;
  const floor = frame.rules.edge_weight_floor;
  const edgesOut = [];
  for (const e of edges) {
    const f = find(e.from), t = find(e.to);
    const fS = merged.get(f)?.sightings || 1;
    const tS = merged.get(t)?.sightings || 1;
    let w = (Math.log(1 + fS) + Math.log(1 + tS)) * (e.coupling ?? 1);
    if (isFinite(cursor) && e.sentIdx != null) {
      const dist = Math.abs(cursor - e.sentIdx);
      w *= Math.pow(\u03B3, dist);
    }
    if (w >= floor) edgesOut.push({ ...e, from: f, to: t, weight: w });
  }
  const voids = voidsRaw.map((v) => Object.freeze({ ...v, node: find(v.node) }));
  return Object.freeze({
    entities: merged,
    edges: edgesOut,
    voids: Object.freeze(voids),
    // Canonicalise any id to its merged referent — the binding of record the
    // edge-grounding veto resolves a talker claim's endpoints against, so a claim
    // about an alias lands on the same node its edges do (edge-grounding §5).
    representative: (id) => find(id),
    frame: Object.freeze({ ...frame }),
    rev: events.length
  });
};

// src/core/verdicts.js
var VERDICTS = Object.freeze({
  CORROBORATED: "corroborated",
  UNSUPPORTED: "unsupported",
  CONTRADICTED: "contradicted",
  INDETERMINATE: "indeterminate",
  OFF_DIAGONAL: "off_diagonal"
});

// src/core/proposition.js
var PROPOSITION_SLOTS = Object.freeze(["substrate", "relation", "differentia"]);

// src/core/event.js
var BANDS = Object.freeze({ VOID: "void", FIRM: "firm" });
var DEFAULT_P = Object.freeze({ void: 0.1, firm: 0.9 });

// src/core/provenance.js
var PERCEIVER = "perceiver";
var ENACTOR = "enactor";
var DOORS = Object.freeze([PERCEIVER, ENACTOR]);

// src/core/holder.js
var STATUS = Object.freeze({ INFERRED: "inferred", STATED: "stated" });

// src/core/relation-types.js
var PRIMITIVES = Object.freeze({
  sibling: { symmetric: true, transitive: false, functional: false, inverse: "sibling", prior: 0.9 },
  parent: { symmetric: false, transitive: false, functional: true, inverse: "child", prior: 0.95 },
  child: { symmetric: false, transitive: false, functional: false, inverse: "parent", prior: 0.95 },
  spouse: { symmetric: true, transitive: false, functional: true, inverse: "spouse", prior: 0.9 },
  ancestor: { symmetric: false, transitive: true, functional: false, inverse: "descendant", prior: 0.9 },
  // Non-kin primitives — SAME machinery, proving this isn't a family table.
  leads: { symmetric: false, transitive: false, functional: true, inverse: "led-by", prior: 0.8 },
  // captain/leader/head
  authored: { symmetric: false, transitive: false, functional: false, inverse: "authored-by", prior: 0.7 },
  located: { symmetric: false, transitive: true, functional: false, inverse: "contains", prior: 0.85 },
  social: { symmetric: true, transitive: false, functional: false, inverse: "social", prior: 0.5 }
  // friend (weak)
});
var DISJOINT_PRIMITIVES = Object.freeze([
  ["parent", "sibling"],
  ["parent", "child"],
  ["ancestor", "child"],
  ["spouse", "sibling"],
  ["spouse", "parent"],
  ["spouse", "child"]
].map(Object.freeze));
var SURFACE = Object.freeze({
  sister: { type: "sibling", gender: "F" },
  brother: { type: "sibling", gender: "M" },
  sibling: { type: "sibling", gender: null },
  mother: { type: "parent", gender: "F" },
  father: { type: "parent", gender: "M" },
  parent: { type: "parent", gender: null },
  mom: { type: "parent", gender: "F" },
  dad: { type: "parent", gender: "M" },
  son: { type: "child", gender: "M" },
  daughter: { type: "child", gender: "F" },
  child: { type: "child", gender: null },
  wife: { type: "spouse", gender: "F" },
  husband: { type: "spouse", gender: "M" },
  spouse: { type: "spouse", gender: null },
  grandfather: { type: "ancestor", gender: "M" },
  grandmother: { type: "ancestor", gender: "F" },
  // non-kin
  captain: { type: "leads", gender: null },
  leader: { type: "leads", gender: null },
  head: { type: "leads", gender: null },
  boss: { type: "leads", gender: null },
  master: { type: "leads", gender: null },
  author: { type: "authored", gender: null },
  writer: { type: "authored", gender: null },
  capital: { type: "located", gender: null },
  friend: { type: "social", gender: null },
  neighbour: { type: "social", gender: null },
  neighbor: { type: "social", gender: null }
});

// src/core/conventions/ledger.js
var SEED_SPEECH = Object.freeze([
  "said",
  "says",
  "say",
  "asked",
  "asks",
  "replied",
  "replies",
  "told",
  "tells",
  "cried",
  "cries",
  "shouted",
  "whispered",
  "muttered",
  "answered",
  "answers",
  "called",
  "calls",
  "exclaimed",
  "declared",
  "added",
  "continued",
  "thought",
  "thinks",
  "wondered",
  "murmured",
  "repeated",
  "insisted",
  "remarked",
  "observed",
  "screamed",
  "begged",
  "urged",
  "warned",
  "promised",
  "admitted",
  "confessed",
  "announced",
  "wrote",
  "writes"
]);
var SEED_ABBREVIATIONS = Object.freeze([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "mt",
  "messrs",
  "mme",
  "mlle",
  "prof",
  "rev",
  "hon",
  "capt",
  "col",
  "gen",
  "sgt",
  "lt",
  "cmdr",
  "sr",
  "jr",
  "esq",
  "co",
  "inc",
  "ltd",
  "no",
  "vol",
  "pp",
  "rd",
  "ave",
  "fig",
  "vs",
  "etc",
  "al",
  "eg",
  "ie",
  "cf",
  "viz",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec"
]);
var SEED_COPULA = Object.freeze([
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being"
]);
var SEED_MODIFIER = Object.freeze([
  // adverbs of time/manner/degree
  "then",
  "now",
  "also",
  "just",
  "once",
  "soon",
  "suddenly",
  "slowly",
  "quietly",
  "gently",
  "again",
  "still",
  "only",
  "even",
  "simply",
  "quickly",
  "immediately",
  "finally",
  "however",
  "never",
  "always",
  "often",
  "already",
  "almost",
  "nearly",
  "merely",
  "truly",
  "indeed",
  "perhaps",
  "really",
  "quite",
  "rather",
  "very",
  "much",
  "more",
  "most",
  "less",
  "so",
  "too",
  "such",
  "thus",
  "hence",
  // auxiliaries / modals
  "had",
  "has",
  "have",
  "having",
  "would",
  "could",
  "will",
  "shall",
  "should",
  "did",
  "does",
  "do",
  "not",
  "must",
  "might",
  "may",
  "can"
]);
var SEED_RELATION_TYPES = Object.freeze({
  motion: [
    "crawled",
    "crawl",
    "crawls",
    "crawling",
    "ran",
    "run",
    "runs",
    "running",
    "walked",
    "walk",
    "walks",
    "walking",
    "jumped",
    "jump",
    "climbed",
    "climb",
    "rushed",
    "rush",
    "fled",
    "flee",
    "moved",
    "move",
    "moves",
    "turned",
    "turn",
    "rose",
    "rise",
    "fell",
    "fall",
    "came",
    "come",
    "comes",
    "went",
    "go",
    "goes",
    "entered",
    "enter",
    "left",
    "leave",
    "leaves",
    "approached",
    "approach",
    "crept",
    "creep",
    "slipped",
    "slip",
    "flew",
    "fly",
    "dragged",
    "drag",
    "pushed",
    "push",
    "pulled",
    "pull",
    "rolled",
    "roll",
    "marched",
    "march",
    "stepped",
    "step",
    "hurried",
    "hurry",
    "wandered",
    "wander",
    "followed",
    "follow",
    "chased",
    "chase",
    "escaped",
    "escape",
    "returned",
    "return",
    "arrived",
    "arrive",
    "departed",
    "depart"
  ],
  perception: [
    "saw",
    "see",
    "sees",
    "seeing",
    "looked",
    "look",
    "looks",
    "looking",
    "watched",
    "watch",
    "watches",
    "heard",
    "hear",
    "hears",
    "noticed",
    "notice",
    "observed",
    "observe",
    "stared",
    "stare",
    "glanced",
    "glance",
    "felt",
    "feel",
    "feels",
    "smelled",
    "smell",
    "gazed",
    "gaze",
    "beheld",
    "behold",
    "spotted",
    "spot",
    "glimpsed",
    "glimpse",
    "sensed",
    "sense"
  ],
  possession: [
    "held",
    "hold",
    "holds",
    "holding",
    "carried",
    "carry",
    "carries",
    "owned",
    "own",
    "owns",
    "kept",
    "keep",
    "keeps",
    "grasped",
    "grasp",
    "grabbed",
    "grab",
    "seized",
    "seize",
    "clutched",
    "clutch",
    "gripped",
    "grip",
    "took",
    "take",
    "takes",
    "brought",
    "bring",
    "wore",
    "wear",
    "wears",
    "possessed",
    "possess",
    "bore",
    "bears",
    "dropped",
    "drop"
  ],
  spatial: [
    "stood",
    "stand",
    "stands",
    "standing",
    "sat",
    "sit",
    "sits",
    "sitting",
    "lay",
    "lie",
    "lies",
    "lying",
    "hung",
    "hang",
    "hangs",
    "lived",
    "live",
    "lives",
    "remained",
    "remain",
    "rested",
    "rest",
    "perched",
    "perch",
    "leaned",
    "lean",
    "leant",
    "filled",
    "fill",
    "covered",
    "cover"
  ],
  affect: [
    "feared",
    "fear",
    "fears",
    "loved",
    "love",
    "loves",
    "hated",
    "hate",
    "hates",
    "liked",
    "like",
    "likes",
    "wanted",
    "want",
    "wants",
    "hoped",
    "hope",
    "hopes",
    "wished",
    "wish",
    "dreaded",
    "dread",
    "enjoyed",
    "enjoy",
    "missed",
    "miss",
    "trusted",
    "trust",
    "admired",
    "admire",
    "envied",
    "envy",
    "pitied",
    "pity",
    "needed",
    "need"
  ],
  communication: [
    "wrote",
    "write",
    "writes",
    "called",
    "call",
    "calls",
    "signalled",
    "signaled",
    "signal",
    "greeted",
    "greet",
    "greets",
    "nodded",
    "nod",
    "waved",
    "wave",
    "beckoned",
    "beckon",
    "summoned",
    "summon",
    "knocked",
    "knock"
  ],
  // Kinship / social role bonds (via = the kin noun on a kinship CON or a derived
  // descriptor edge). The fine sibling/parent split stays the read-layer bridge's
  // job; here it is the coarse bucket the graph groups on.
  kinship: [
    "father",
    "mother",
    "sister",
    "brother",
    "son",
    "daughter",
    "wife",
    "husband",
    "parents",
    "parent",
    "uncle",
    "aunt",
    "cousin",
    "nephew",
    "niece",
    "grandfather",
    "grandmother",
    "sibling",
    "child",
    "spouse",
    "dad",
    "mom",
    "friend",
    "master",
    "servant",
    "boss",
    "chief",
    "partner",
    "neighbour",
    "neighbor",
    "colleague",
    "lover",
    "fiance",
    "fiancee"
  ]
});
var RELATION_TYPE = /* @__PURE__ */ new Map();
for (const [bucket, toks] of Object.entries(SEED_RELATION_TYPES))
  for (const t of toks) if (!RELATION_TYPE.has(t)) RELATION_TYPE.set(t, bucket);
var SEED_PREPOSITION = Object.freeze([
  "of",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "with",
  "into",
  "onto",
  "upon",
  "over",
  "under",
  "through",
  "after",
  "before",
  "between",
  "among",
  "against",
  "about",
  "as",
  "unto",
  "toward",
  "towards",
  "for",
  "near",
  "beside",
  "within",
  "without",
  "beyond",
  "beneath",
  "above",
  "below",
  "behind",
  "around",
  "past"
]);
var SEED_AUXILIARY = Object.freeze([
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "shall",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "must",
  "can",
  "hath",
  "hast",
  "doth",
  "dost",
  "art",
  "wast",
  "wilt",
  "shalt"
]);
var SEED_ROLE = Object.freeze([
  "son",
  "sons",
  "daughter",
  "daughters",
  "father",
  "mother",
  "brother",
  "brethren",
  "sister",
  "sisters",
  "wife",
  "wives",
  "husband",
  "child",
  "children",
  "firstborn",
  "seed",
  "name",
  "named",
  "called",
  "uncle",
  "aunt",
  "cousin",
  "nephew",
  "niece",
  "his",
  "her",
  "their",
  "my",
  "thy",
  "our",
  "your",
  "thine"
]);
var SEED_FUNCTION = Object.freeze([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "he",
  "she",
  "it",
  "they",
  "we",
  "i",
  "you",
  "him",
  "them",
  "us",
  "me",
  "thee",
  "thou",
  "ye",
  "who",
  "whom",
  "whose",
  "which",
  "what",
  "his",
  "her",
  "its",
  "their",
  "our",
  "my",
  "your",
  "thy",
  "thine",
  "mine",
  "hers",
  "ours",
  "yours",
  "there",
  "then",
  "now",
  "here",
  "very",
  "not",
  "also",
  "thus",
  "lo",
  "behold",
  "yea",
  "nay",
  "verily",
  "when",
  "where",
  "why",
  "how",
  "if",
  "because",
  "while",
  "though",
  "although",
  "until",
  "unless",
  "whether",
  "else",
  "ever",
  "never",
  ...SEED_PREPOSITION,
  ...SEED_AUXILIARY
]);
var SEED_STARTER = Object.freeze([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "then",
  "now",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "what",
  "who",
  "whom",
  "which",
  "yes",
  "no",
  "maybe",
  "perhaps",
  "otherwise",
  "also",
  "however",
  "indeed",
  "still",
  "yet",
  "but",
  "and",
  "so",
  "or",
  "nor",
  "for",
  "because",
  "although",
  "while",
  "since",
  "as",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "with",
  "of",
  "up",
  "down",
  "over",
  "under",
  "into",
  "out",
  "if",
  "unless",
  "until",
  "once",
  "just",
  "only",
  "even",
  "soon",
  "again",
  "almost",
  "nearly",
  "suddenly",
  "finally",
  "meanwhile",
  "nevertheless",
  "therefore",
  "thus",
  "hence",
  "anyway",
  "well",
  "oh",
  "ah",
  "eh",
  "alas",
  "look",
  "listen",
  "can",
  "could",
  "would",
  "should",
  "shall",
  "will",
  "may",
  "might",
  "must",
  "let",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "not",
  "never",
  "always",
  "often",
  "sometimes",
  "thou",
  "thee",
  "thy",
  "thine",
  "ye",
  "behold",
  "lo",
  "verily",
  "yea",
  "nay",
  "hast",
  "hath",
  "doth",
  "dost",
  "art",
  "wast",
  "wilt",
  "shalt",
  "unto",
  // Indefinite determiners / quantifiers — they open a clause but name no one, so a
  // capitalised one at sentence start ("Other travelling salesmen…", "Most of them…",
  // "One morning…") is a stray capital, not a character. Without these the gravity
  // floor admits them on their sentence-initial subject position.
  "one",
  "another",
  "other",
  "some",
  "any",
  "each",
  "every",
  "all",
  "both",
  "many",
  "much",
  "more",
  "most",
  "few",
  "fewer",
  "several",
  "such",
  "either",
  "neither",
  "none",
  // Indefinite pronouns — likewise referential of no one in particular.
  "something",
  "nothing",
  "anything",
  "everything",
  "someone",
  "anyone",
  "everyone",
  "somebody",
  "anybody",
  "everybody",
  "nobody",
  "whatever",
  "whoever",
  "whenever",
  "wherever",
  "whichever",
  // Discourse openers, politeness, hedging adverbs.
  "please",
  "thanks",
  "okay",
  "hardly",
  "scarcely",
  "barely",
  "certainly",
  "surely",
  "clearly",
  "apparently",
  "obviously",
  "probably",
  "possibly",
  "eventually",
  "gradually",
  "usually",
  "normally",
  "generally",
  // Cardinals that commonly open a clause ("Two whole days…", "Seven o'clock…").
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "during"
]);
var SEED_CONJUNCTION = Object.freeze([
  "and",
  "or",
  "nor"
]);
var SEED_FIELD_LABEL = Object.freeze([
  // bibliographic front matter
  "title",
  "subtitle",
  "author",
  "authors",
  "editor",
  "translator",
  "illustrator",
  "contributor",
  "credits",
  "produced by",
  "publisher",
  "publication",
  "imprint",
  "edition",
  "volume",
  "series",
  "date",
  "release date",
  "publication date",
  "published",
  "updated",
  "last updated",
  "most recently updated",
  "revised",
  "language",
  "source",
  "origin",
  "subject",
  "subjects",
  "keywords",
  "genre",
  "rights",
  "copyright",
  "license",
  "licence",
  "isbn",
  "issn",
  "doi",
  "url",
  // correspondence / memo header
  "from",
  "to",
  "cc",
  "bcc",
  "re",
  "sender",
  "recipient",
  // creative-work credits
  "composer",
  "director",
  "artist",
  "performer",
  "writer",
  "creator"
]);
var SEEDS = {
  "attribution-verb": SEED_SPEECH,
  "abbreviation": SEED_ABBREVIATIONS,
  "copula": SEED_COPULA,
  "modifier": SEED_MODIFIER,
  "preposition": SEED_PREPOSITION,
  "auxiliary": SEED_AUXILIARY,
  "role": SEED_ROLE,
  "function": SEED_FUNCTION,
  "starter": SEED_STARTER,
  "conjunction": SEED_CONJUNCTION,
  "field-label": SEED_FIELD_LABEL
};
var PRIOR_SUPPORT = 3;
var createConventions = ({ seeds = true, inherit = null } = {}) => {
  const rules = [];
  const reg = {};
  const ensure = (kind) => reg[kind] || (reg[kind] = /* @__PURE__ */ new Map());
  const norm2 = (v) => String(v || "").toLowerCase().replace(/\.$/, "");
  if (seeds) {
    for (const [kind, seed] of Object.entries(SEEDS)) {
      const m = ensure(kind);
      for (const t of seed)
        m.set(t, { origin: "prior", weight: 0, support: PRIOR_SUPPORT, strain: 0, defeated: false });
    }
  }
  if (Array.isArray(inherit)) {
    for (const e of inherit) {
      if (e.defeated) continue;
      const t = norm2(e.token);
      ensure(e.kind).set(t, {
        origin: "prior",
        weight: e.weight || 0,
        support: e.support || PRIOR_SUPPORT,
        strain: 0,
        defeated: false
      });
    }
  }
  const entryOf = (kind, v) => reg[kind] ? reg[kind].get(norm2(v)) : void 0;
  const has = (kind, v) => {
    const e = entryOf(kind, v);
    return !!e && !e.defeated;
  };
  const learn = (kind, token, weight = 1) => {
    const t = norm2(token);
    const m = ensure(kind);
    const e = m.get(t);
    if (e) {
      e.weight += weight;
      e.support += weight;
      e.origin = "learned";
      e.defeated = false;
    } else m.set(t, { origin: "learned", weight, support: weight, strain: 0, defeated: false });
    rules.push({ op: "REC", kind, token: t, weight, t: Date.now() });
  };
  const eva = (kind, token, holds = true) => {
    const t = norm2(token);
    const m = ensure(kind);
    let e = m.get(t);
    if (!e) {
      e = { origin: "learned", weight: 0, support: 0, strain: 0, defeated: false };
      m.set(t, e);
    }
    if (holds) {
      e.support += 1;
      if (e.strain > 0) e.strain -= 1;
    } else {
      e.strain += 1;
    }
    if (e.strain > e.support && !e.defeated) {
      e.defeated = true;
      rules.push({ op: "REC", kind, token: t, defeat: true, t: Date.now() });
    }
    return { defeated: e.defeated, support: e.support, strain: e.strain };
  };
  const rec = (kind, token, { defeat = false, reinstate = false } = {}) => {
    const t = norm2(token);
    const m = ensure(kind);
    let e = m.get(t);
    if (!e) {
      e = { origin: "learned", weight: 0, support: 0, strain: 0, defeated: false };
      m.set(t, e);
    }
    if (defeat) {
      e.defeated = true;
    } else if (reinstate) {
      e.defeated = false;
      e.strain = 0;
    } else {
      e.support += 1;
    }
    rules.push({ op: "REC", kind, token: t, ...defeat ? { defeat: true } : {}, t: Date.now() });
    return { defeated: e.defeated, support: e.support, strain: e.strain };
  };
  return {
    learn,
    def: learn,
    // DEF — hold (alias; a held convention is learned sediment)
    eva,
    // EVA — test against the stream
    rec,
    // REC — revise / override
    defeat: (kind, token) => rec(kind, token, { defeat: true }),
    reinstate: (kind, token) => rec(kind, token, { reinstate: true }),
    learnAttribution: (token, weight = 1) => learn("attribution-verb", token, weight),
    learnAbbreviation: (token, weight = 1) => learn("abbreviation", token, weight),
    isAttributionVerb: (v) => has("attribution-verb", v),
    isAbbreviation: (v) => has("abbreviation", v),
    isCopula: (v) => has("copula", v),
    isModifier: (v) => has("modifier", v),
    // Registers entity admission reads to weigh a sighting's referential gravity.
    isPreposition: (v) => has("preposition", v),
    isAuxiliary: (v) => has("auxiliary", v) || has("copula", v),
    isRole: (v) => has("role", v),
    isFunction: (v) => has("function", v),
    isStarter: (v) => has("starter", v),
    // A coordinating conjunction joining two like constituents ('and'/'or'/'nor') —
    // read by the relation parser to admit a coordinated subject ("Name and Name …"),
    // seed ∪ learned. NOT the adversative/illative connectives the function class holds.
    isConjunction: (v) => has("conjunction", v),
    // A front-matter field label ("Title", "Author", "Release date") — read by the
    // metadata pass to confirm a labeled line is a bibliographic field, seed ∪ learned.
    isFieldLabel: (v) => has("field-label", v),
    learnFieldLabel: (token, weight = 1) => learn("field-label", token, weight),
    // Convention status — the strain-history a consumer or a test can read.
    isDefeated: (kind, v) => {
      const e = entryOf(kind, v);
      return !!e && e.defeated;
    },
    originOf: (kind, v) => entryOf(kind, v)?.origin ?? null,
    strainOf: (kind, v) => entryOf(kind, v)?.strain ?? 0,
    supportOf: (kind, v) => entryOf(kind, v)?.support ?? 0,
    // Type a relation predicate to its closed-vocab bucket (move 3), or null when it
    // is outside the table — additive, never a drop. Speech is read live from the
    // attribution register so a learned speech verb types as `speech` too.
    relationType: (v) => {
      const t = norm2(v);
      if (!t) return null;
      if (has("attribution-verb", t)) return "speech";
      return RELATION_TYPE.get(t) || null;
    },
    weightOf: (v) => entryOf("attribution-verb", v)?.weight || 0,
    get rules() {
      return rules;
    },
    // Back-compat Map views (token → weight). Derived; not load-bearing.
    get attribution() {
      return new Map([...reg["attribution-verb"] || []].map(([t, e]) => [t, e.weight]));
    },
    get abbreviation() {
      return new Map([...reg["abbreviation"] || []].map(([t, e]) => [t, e.weight]));
    },
    // The full language spec — conventions.jsonl. A line per convention, DEF for the
    // prior it started from, REC for what the document taught; a defeated one carries
    // the flag. The parser and splitter only read it.
    exportJSONL() {
      const out = [];
      for (const [kind, m] of Object.entries(reg))
        for (const [token, e] of m)
          out.push(JSON.stringify({
            op: e.origin === "learned" ? "REC" : "DEF",
            kind,
            token,
            weight: e.weight,
            ...e.defeated ? { defeated: true } : {}
          }));
      return out.join("\n");
    },
    // Structured export for inheritance: the sediment a later read picks up as its
    // priors, the same slot it picks up the seeds (TEST 3 / reshape §5).
    exportLedger() {
      const out = [];
      for (const [kind, m] of Object.entries(reg))
        for (const [token, e] of m)
          out.push({
            kind,
            token,
            origin: e.origin,
            weight: e.weight,
            support: e.support,
            strain: e.strain,
            defeated: e.defeated
          });
      return out;
    }
  };
};

// src/core/conventions/induce.js
var QUOTE = '["\u201C\u201D\u201C\u201D]';
var PRE = new RegExp(String.raw`\b([a-z]{2,})\s*[,:]?\s*${QUOTE}`, "g");
var POST = new RegExp(String.raw`${QUOTE}\s*,?\s*([a-z]{2,})\s+(?:[A-Z][a-z]+|he|she|they|the)\b`, "g");
var NOT_VERB = /* @__PURE__ */ new Set([
  "the",
  "and",
  "but",
  "that",
  "with",
  "for",
  "his",
  "her",
  "their",
  "this",
  "then",
  "when",
  "while",
  "because",
  "about",
  "into",
  "from"
]);
var verbish = (w) => /(?:ed|s|t)$/.test(w) || ["say", "ask", "cry", "tell", "add", "go", "reply"].includes(w);
var induceAttributionVerbs = (sentences) => {
  const counts = /* @__PURE__ */ new Map();
  const bump = (w) => {
    const t = w.toLowerCase();
    if (NOT_VERB.has(t) || !verbish(t)) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  };
  for (const s of sentences) {
    if (!new RegExp(QUOTE).test(s)) continue;
    let m;
    const pre = new RegExp(PRE.source, "g");
    while ((m = pre.exec(s)) !== null) bump(m[1]);
    const post = new RegExp(POST.source, "g");
    while ((m = post.exec(s)) !== null) bump(m[1]);
  }
  return [...counts.entries()].map(([token, count]) => ({ token, count })).sort((a, b) => b.count - a.count);
};

// src/core/cognition.js
var COGNITION = Object.freeze({
  perceiver: Object.freeze({
    faculty: "perceiver",
    domain: "Existence",
    function: "Existence",
    act: "constitute",
    position: "first",
    modalityBlind: true,
    operators: Object.freeze(operatorsByDomain("Existence").map((o) => o.id))
    // NUL SIG INS
  }),
  surfer: Object.freeze({
    faculty: "surfer",
    domain: "Structure",
    function: "Structure",
    act: "navigate",
    position: "middle",
    operators: Object.freeze(operatorsByDomain("Structure").map((o) => o.id))
    // SEG CON SYN
  }),
  enactor: Object.freeze({
    faculty: "enactor",
    domain: "Interpretation",
    function: "Significance",
    act: "commit",
    position: "last",
    modalityBlind: true,
    operators: Object.freeze(operatorsByDomain("Interpretation").map((o) => o.id)),
    // DEF EVA REC
    // The enactor's gate is the Significance column itself — DEF·EVA·REC. It is
    // the commit step, modality-blind: speech is one output organ among several.
    gate: Object.freeze(["DEF", "EVA", "REC"])
  })
});
var COGNITION_ORDER = Object.freeze(["perceiver", "surfer", "enactor"]);

// src/perceiver/parse/sentences.js
var SEED_ABBR = new Set(SEED_ABBREVIATIONS);
var defaultIsAbbreviation = (w) => SEED_ABBR.has(String(w).toLowerCase());
var abbreviates = (buf, isAbbreviation) => {
  const m = buf.slice(0, -1).match(/([A-Za-z]+)$/);
  if (!m) return false;
  const w = m[1];
  return /^[A-Z]$/.test(w) || isAbbreviation(w);
};
var segmentSentences = (text, { isAbbreviation = defaultIsAbbreviation, extraBoundaries = EMPTY } = {}) => {
  const t = String(text || "").replace(/\r\n?/g, "\n");
  if (!t.trim()) return [];
  const out = [];
  for (const para of t.split(/\n{2,}/)) {
    const p = para.replace(/\s+/g, " ").trim();
    if (!p) continue;
    let buf = "";
    for (let i = 0; i < p.length; i++) {
      buf += p[i];
      const ch = p[i];
      const next = p[i + 1] || "";
      const isFloor = ch === "." || ch === "!" || ch === "?";
      if ((isFloor || extraBoundaries.has(ch)) && (next === "" || /\s/.test(next))) {
        if (ch === "." && abbreviates(buf, isAbbreviation)) continue;
        const s = buf.trim();
        if (s) out.push(s);
        buf = "";
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
};
var EMPTY = /* @__PURE__ */ new Set();

// src/core/enacted/frame.js
var DEFAULT_STRAIN_LEAK = 0.9;
var createFrame = ({ layer, cursor, terms = [], threshold, leak = DEFAULT_STRAIN_LEAK }) => ({
  layer,
  cursor,
  // the read-time point the frame was set at
  terms: Object.freeze([...terms]),
  // the terms this layer currently stands on
  threshold,
  // the REC threshold — the size of the belt
  leak,
  // strain's per-cursor retention (the leaky integrator)
  strain: 0,
  // running leaky Σ surprise from EVAs against it
  strainCursor: cursor,
  // read-time of the last strain update (drives the leak)
  dimStrain: /* @__PURE__ */ new Map()
  // per-dimension leaky strain — the axis the frame breaks along
});
var snapshotFrame = (frame) => Object.freeze({
  layer: frame.layer,
  cursor: frame.cursor,
  terms: frame.terms,
  threshold: frame.threshold,
  leak: frame.leak
  // carried so the fold leaks exactly as the live run did
});

// src/core/enacted/loop.js
var DEFAULT_THRESHOLDS = Object.freeze({
  proposition: 1.5,
  document: 4
});
var DEFAULT_CONFIRM_BAND = 0.25;
var DEFAULT_IMPULSE = 0.95;
var DEFAULT_IMPULSE_QUANTILE = 0.98;
var IMPULSE_MIN_SAMPLES = 16;
var DEFAULT_REFRACTORY = 3;
var calibrateReader = (surprises, {
  layers = ["proposition", "document"],
  perLayerSteps = { proposition: 3, document: 8 },
  defaults = DEFAULT_THRESHOLDS,
  defaultBand = DEFAULT_CONFIRM_BAND
} = {}) => {
  const xs = (surprises || []).filter((x) => Number.isFinite(x));
  if (xs.length < 4) return { confirmBand: defaultBand, thresholds: { ...defaults }, fitted: false };
  const band = medianOf(xs);
  const excess = xs.map((x) => Math.max(0, x - band)).filter((e) => e > 0);
  const step = excess.length ? excess.reduce((s, e) => s + e, 0) / excess.length : 0;
  if (step <= 0) return { confirmBand: defaultBand, thresholds: { ...defaults }, fitted: false };
  const thresholds = {};
  for (const layer of layers) {
    const k = perLayerSteps[layer] ?? perLayerSteps.proposition ?? 3;
    thresholds[layer] = k * step;
  }
  return { confirmBand: band, thresholds, fitted: true, band: round(band), step: round(step) };
};
var medianOf = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
var quantileOf = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};
var createEnactedLoop = ({
  layers = ["proposition", "document"],
  thresholds = DEFAULT_THRESHOLDS,
  confirmBand = DEFAULT_CONFIRM_BAND,
  strainLeak = DEFAULT_STRAIN_LEAK,
  // strain's per-cursor retention — the leaky integrator (frame.js)
  impulseThreshold = DEFAULT_IMPULSE,
  // a single EVA above this breaks the frame on impact (Newton); causal fallback
  impulseQuantile = DEFAULT_IMPULSE_QUANTILE,
  // causal mode: the shock is this quantile of PAST surprise
  refractoryPeriod = DEFAULT_REFRACTORY,
  // cursors a just-restructured frame cannot re-break (hysteresis)
  calibrate = null,
  // { mode:'causal', alpha } → band/threshold from PAST surprises only
  read
  // (cursor) => { surprise ∈ [0,1], terms } — the cheap γ-mass signal
} = {}) => {
  if (typeof read !== "function") {
    throw new TypeError("createEnactedLoop: `read` must be (cursor) \u2192 { surprise, terms }");
  }
  const orderedLayers = [...layers];
  const base = orderedLayers[0];
  const events = [];
  const live = /* @__PURE__ */ new Map();
  const sinceSet = /* @__PURE__ */ new Map();
  const lastRec = /* @__PURE__ */ new Map();
  let lastCursor = -1;
  const causal = calibrate?.mode === "causal";
  const perLayerSteps = calibrate?.perLayerSteps;
  const seen = [];
  let causalBand = confirmBand;
  let causalThresholds = thresholds;
  let causalImpulse = impulseThreshold;
  const recalibrate = () => {
    const cal = calibrateReader(seen, {
      layers: orderedLayers,
      ...perLayerSteps ? { perLayerSteps } : {},
      defaults: thresholds,
      defaultBand: confirmBand
    });
    causalBand = cal.confirmBand;
    causalThresholds = cal.thresholds;
    if (seen.length >= IMPULSE_MIN_SAMPLES) {
      const q = quantileOf(seen, impulseQuantile);
      causalImpulse = q > causalBand ? q : impulseThreshold;
    } else {
      causalImpulse = impulseThreshold;
    }
  };
  const bandNow = () => causal ? causalBand : confirmBand;
  const impulseNow = () => causal ? causalImpulse : impulseThreshold;
  const emit = (e) => {
    const sealed = Object.freeze({ ...e, register: "enacted", reader: "reading", seq: events.length });
    events.push(sealed);
    return sealed;
  };
  const thresholdOf = (layer) => causal ? causalThresholds[layer] ?? DEFAULT_THRESHOLDS[layer] ?? causalThresholds[base] ?? 1.5 : thresholds[layer] ?? DEFAULT_THRESHOLDS[layer] ?? thresholds[base] ?? 1.5;
  const def = (layer, cursor, terms, producedBy) => {
    const frame = createFrame({ layer, cursor, terms, threshold: thresholdOf(layer), leak: strainLeak });
    live.set(layer, frame);
    sinceSet.set(layer, []);
    emit({ op: "DEF", layer, cursor, frame: snapshotFrame(frame), producedBy });
    return frame;
  };
  const eva = (layer, cursor, surprise, particular, contrib) => {
    const frame = live.get(layer);
    if (frame.cursor > cursor) {
      throw new Error(`enacted EVA tested a FUTURE frame: ${layer}@${frame.cursor} vs particular@${cursor} (\xA75)`);
    }
    const dt = Math.max(0, cursor - frame.strainCursor);
    frame.strain *= Math.pow(frame.leak, dt);
    frame.strainCursor = cursor;
    const band = bandNow();
    const verdict = surprise < band ? "confirm" : "strain";
    const strainDelta = Math.max(0, surprise - band);
    frame.strain = round(frame.strain + strainDelta);
    const decay = Math.pow(frame.leak, dt);
    for (const [d, v] of frame.dimStrain) frame.dimStrain.set(d, v * decay);
    if (contrib && strainDelta > 0) {
      let sum = 0;
      for (const k in contrib) sum += contrib[k];
      if (sum > 0) for (const k in contrib)
        frame.dimStrain.set(k, round((frame.dimStrain.get(k) || 0) + strainDelta * (contrib[k] / sum)));
    }
    const ev = emit({
      op: "EVA",
      testLayer: base,
      frameLayer: layer,
      frameCursor: frame.cursor,
      cross: layer !== base,
      cursor,
      particular,
      verdict,
      surprise: round(surprise),
      strainDelta: round(strainDelta)
    });
    sinceSet.get(layer).push(ev.seq);
    return frame;
  };
  const rec = (layer, cursor, terms, trigger = "accumulation") => {
    const old = live.get(layer);
    const forcedBy = sinceSet.get(layer).slice();
    const axis = [...old.dimStrain.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([d]) => d);
    const installTerms = axis.length ? axis.slice(0, 3) : terms;
    const recEv = emit({
      op: "REC",
      target: layer,
      action: "restructure",
      // RULES_LEDGER shape, borrowed (§9)
      layer,
      cursor,
      trigger,
      // 'accumulation' (grind) | 'impulse' (shock) — §3/§6
      alongAxis: axis.slice(0, 3),
      // the cause of the break (the straining dimensions)
      from: snapshotFrame(old),
      strainSum: round(old.strain),
      forcedBy
    });
    def(layer, cursor, installTerms, { rec: recEv.seq });
    return recEv;
  };
  const step = (cursor) => {
    if (cursor <= lastCursor) {
      throw new Error(`enacted loop runs forward only: cursor ${cursor} \u2264 last ${lastCursor} (\xA75)`);
    }
    lastCursor = cursor;
    const r = read(cursor) || {};
    const s = clamp01(Number(r.surprise) || 0);
    const terms = r.terms || [];
    const contrib = r.contrib || null;
    for (const layer of orderedLayers) {
      if (!live.has(layer)) {
        def(layer, cursor, terms, "initial");
        continue;
      }
      const frame = eva(layer, cursor, s, cursor, contrib);
      const last = lastRec.get(layer);
      if (last != null && cursor - last <= refractoryPeriod) continue;
      if (s > impulseNow()) {
        rec(layer, cursor, terms, "impulse");
        lastRec.set(layer, cursor);
      } else if (frame.strain >= thresholdOf(layer)) {
        rec(layer, cursor, terms, "accumulation");
        lastRec.set(layer, cursor);
      }
    }
    if (causal) {
      seen.push(s);
      recalibrate();
    }
    return { cursor, surprise: round(s) };
  };
  const runTo = (cursor) => {
    for (let c = lastCursor + 1; c <= cursor; c++) step(c);
    return events;
  };
  return {
    step,
    runTo,
    get events() {
      return events;
    },
    get cursor() {
      return lastCursor;
    },
    frameAt: (layer) => {
      const f = live.get(layer);
      return f ? snapshotFrame(f) : null;
    },
    strainAt: (layer) => live.get(layer)?.strain ?? 0,
    // The live scale, for callers that report it (e.g. the meaning reader). In causal
    // mode these are the band/impulse AS THEY STAND now — fit from past surprises only;
    // in fixed mode they are the constants the loop was built with.
    get confirmBand() {
      return bandNow();
    },
    get impulse() {
      return impulseNow();
    },
    layers: Object.freeze([...orderedLayers]),
    // The enacted-REC ledger as JSONL — the same shape as the audit trail and
    // eoreader3's conventions.jsonl, so the reading is tuned against the record (§9).
    exportJSONL: () => events.map((e) => JSON.stringify(e)).join("\n")
  };
};
var round = (x) => Math.round(x * 1e3) / 1e3;
var clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// src/perceiver/parse/boundaries.js
var CANDIDATE_MARKS = Object.freeze([":", ";"]);
var CLAUSE_OPENER = /^\s*(?:and\s+)?(?:[A-Z][a-z]+|he|she|they|it|we|I|you|thou|ye)\b/;
var fusionByMark = (unit, ignored) => {
  const counts = {};
  for (const mk of ignored) counts[mk] = 0;
  for (let i = 0; i < unit.length; i++) {
    const ch = unit[i];
    if (!ignored.has(ch)) continue;
    const after = unit.slice(i + 1);
    if (!CLAUSE_OPENER.test(after)) continue;
    const seg = after.split(/[:;.!?]/)[0].trim();
    if (seg.split(/\s+/).filter(Boolean).length >= 4) counts[ch]++;
  }
  return counts;
};
var induceBoundaries = (text, { isAbbreviation, thresholds, confirmBand } = {}) => {
  const extraBoundaries = /* @__PURE__ */ new Set();
  const recs = [];
  for (let pass = 0; pass <= CANDIDATE_MARKS.length; pass++) {
    const ignored = new Set(CANDIDATE_MARKS.filter((m) => !extraBoundaries.has(m)));
    if (ignored.size === 0) break;
    const units = segmentSentences(text, { isAbbreviation, extraBoundaries });
    if (units.length < 4) break;
    const total = { ":": 0, ";": 0 };
    const strain = units.map((u) => {
      const f = fusionByMark(u, ignored);
      let s = 0;
      for (const mk of ignored) {
        total[mk] += f[mk];
        s += f[mk];
      }
      return s;
    });
    const loop = createEnactedLoop({
      layers: ["segmentation"],
      thresholds: { segmentation: thresholds?.segmentation ?? 3 },
      confirmBand: confirmBand ?? 0.4,
      // a unit fusing <1 clause confirms
      impulseThreshold: 1.1,
      // accumulation only — no single-unit shock
      read: (i) => ({ surprise: Math.min(1, strain[i] / 2), terms: [...extraBoundaries] })
    });
    loop.runTo(units.length - 1);
    if (!loop.events.some((e) => e.op === "REC")) break;
    const mark = [...ignored].sort((a, b) => total[b] - total[a])[0];
    if (!total[mark]) break;
    extraBoundaries.add(mark);
    recs.push({ op: "REC", kind: "boundary", token: mark, fused: total[mark], reader: "reading" });
  }
  return { extraBoundaries, recs };
};

// src/perceiver/parse/chrome.js
var FOOTNOTE = /^\[\d{1,3}\]$/;
// "[12]" — a reference marker, not a datum
var ROMAN = /^[ivxlcdm]{1,7}\.?$/i;
// a bare roman numeral: "III", "iv."
var SEPARATOR = /^[\W_]+$/;
// only punctuation/symbols — a separator rule
var isDegenerate = (sentence) => {
  const s = String(sentence || "").trim();
  if (!s) return true;
  if (FOOTNOTE.test(s)) return true;
  if (/\d/.test(s)) return false;
  if (s.length < 3) return true;
  return ROMAN.test(s) || SEPARATOR.test(s);
};
var isChrome = (sentence, hint = 0) => {
  const nudge = typeof hint === "boolean" ? hint ? 1 : 0 : Number(hint) || 0;
  return isDegenerate(sentence) || nudge >= 1;
};

// src/perceiver/parse/frame.js
var MIN_SENTENCES = 40;
var BODY_MAJORITY = 0.5;
var isBanner = (s) => /\*{3,}/.test(String(s || ""));
var frameSpan = (sentences = []) => {
  const n = sentences.length;
  const empty = { head: [], tail: [], all: /* @__PURE__ */ new Set(), start: 0, end: n - 1 };
  if (n < MIN_SENTENCES) return empty;
  const banners = [];
  for (let i = 0; i < n; i++) if (isBanner(sentences[i])) banners.push(i);
  if (banners.length < 2) return empty;
  let lo = -1, hi = -1, span2 = -1;
  for (let k = 1; k < banners.length; k++) {
    const gap = banners[k] - banners[k - 1];
    if (gap > span2) {
      span2 = gap;
      lo = banners[k - 1];
      hi = banners[k];
    }
  }
  const start = lo + 1, end = hi - 1;
  if (start > end) return empty;
  if (end - start + 1 < n * BODY_MAJORITY) return empty;
  const head = [];
  for (let i = 0; i <= lo; i++) head.push(i);
  const tail = [];
  for (let i = hi; i < n; i++) tail.push(i);
  return { head, tail, all: /* @__PURE__ */ new Set([...head, ...tail]), start, end };
};

// src/perceiver/parse/metadata.js
var MAX_LABEL_WORDS = 4;
var MAX_LABEL_CHARS = 40;
var FRONT_MAX = 30;
var BLOCK_START_MAX = 8;
var BODY_MAJORITY2 = 0.25;
var LABEL = String.raw`[A-Z][A-Za-z0-9.&'’\/-]*(?:\s+[A-Za-z0-9.&'’\/-]+){0,${MAX_LABEL_WORDS - 1}}`;
var FIELD = String.raw`(?:^|\s)(${LABEL})\s*:\s+`;
var CANON = /* @__PURE__ */ new Map([
  ["title", "title"],
  ["subtitle", "subtitle"],
  ["author", "author"],
  ["authors", "author"],
  ["by", "author"],
  ["writer", "author"],
  ["written by", "author"],
  ["creator", "author"],
  ["creators", "author"],
  ["editor", "editor"],
  ["edited by", "editor"],
  ["translator", "translator"],
  ["translated by", "translator"],
  ["translation", "translator"],
  ["illustrator", "illustrator"],
  ["contributor", "contributor"],
  ["credits", "credits"],
  ["produced by", "producer"],
  ["producer", "producer"],
  ["publisher", "publisher"],
  ["publication", "publisher"],
  ["published by", "publisher"],
  ["imprint", "publisher"],
  ["date", "date"],
  ["release date", "date"],
  ["publication date", "date"],
  ["published", "date"],
  ["posted", "date"],
  ["posted on", "date"],
  ["pubdate", "date"],
  ["updated", "updated"],
  ["last updated", "updated"],
  ["most recently updated", "updated"],
  ["revised", "updated"],
  ["language", "language"],
  ["lang", "language"],
  ["source", "source"],
  ["origin", "source"],
  ["subject", "subject"],
  ["subjects", "subject"],
  ["topic", "subject"],
  ["keywords", "subject"],
  ["re", "subject"],
  ["rights", "rights"],
  ["copyright", "rights"],
  ["license", "rights"],
  ["licence", "rights"],
  ["from", "from"],
  ["sender", "from"],
  ["to", "to"],
  ["recipient", "to"],
  ["cc", "cc"],
  ["bcc", "bcc"],
  ["isbn", "isbn"],
  ["issn", "issn"],
  ["doi", "doi"],
  ["url", "url"],
  ["volume", "volume"],
  ["edition", "edition"],
  ["series", "series"],
  ["genre", "genre"],
  ["composer", "composer"],
  ["director", "director"],
  ["artist", "artist"],
  ["performer", "performer"]
]);
var norm = (s) => String(s || "").toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim();
var canonKey = (label) => CANON.get(norm(label)) || norm(label);
var isBanner2 = (s) => /\*{3,}/.test(String(s || ""));
var isGap = (s) => {
  const t = String(s || "").trim();
  return t.length < 3 || isBanner2(t);
};
var splitFields = (line) => {
  const s = String(line || "");
  const ms = [...s.matchAll(new RegExp(FIELD, "g"))];
  if (!ms.length) return [];
  const clean = (v) => v.trim().replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  const parts = ms.map((m, i) => ({
    label: m[1].trim(),
    value: clean(s.slice(m.index + m[0].length, i + 1 < ms.length ? ms[i + 1].index : s.length))
  }));
  if (parts.length > 1 && parts.some((p) => !p.value)) {
    const label = ms[0][1].trim();
    const value = clean(s.slice(ms[0].index + ms[0][0].length));
    return label.length <= MAX_LABEL_CHARS && value ? [{ label, value }] : [];
  }
  return parts.filter((p) => p.value && p.label.length <= MAX_LABEL_CHARS);
};
var frontMatterWindow = (lines) => {
  const n = lines.length;
  const banners = [];
  for (let i = 0; i < n; i++) if (isBanner2(lines[i])) banners.push(i);
  if (banners.length >= 2) {
    let lo = -1, hi = -1, span2 = -1;
    for (let k = 1; k < banners.length; k++) {
      const gap = banners[k] - banners[k - 1];
      if (gap > span2) {
        span2 = gap;
        lo = banners[k - 1];
        hi = banners[k];
      }
    }
    if (lo > 0 && hi - lo - 1 >= n * BODY_MAJORITY2) {
      const idx2 = [];
      for (let i = 0; i < lo; i++) idx2.push(i);
      return idx2;
    }
  }
  const limit = Math.min(FRONT_MAX, n);
  let first = -1;
  for (let i = 0; i < limit; i++) if (splitFields(lines[i]).length) {
    first = i;
    break;
  }
  if (first < 0 || first > BLOCK_START_MAX) return [];
  let end = first, count = 0;
  for (let i = first; i < limit; i++) {
    if (splitFields(lines[i]).length) {
      end = i;
      count++;
      continue;
    }
    if (isGap(lines[i])) continue;
    break;
  }
  if (count < 2) return [];
  const idx = [];
  for (let i = first; i <= end; i++) idx.push(i);
  return idx;
};
var extractMetadata = (text = "", { conventions = null } = {}) => {
  const lines = String(text || "").split(/\r?\n/);
  const window = frontMatterWindow(lines);
  const fields = [];
  for (const i of window)
    for (const f of splitFields(lines[i]))
      fields.push({ label: f.label, value: f.value, line: i });
  if (!fields.length) return { fields: [], byKey: {} };
  for (const f of fields)
    f.known = !!(conventions && conventions.isFieldLabel && conventions.isFieldLabel(f.label));
  if (fields.length < 2 && !fields.some((f) => f.known)) return { fields: [], byKey: {} };
  for (const f of fields) {
    f.key = canonKey(f.label);
    if (conventions && conventions.learn) conventions.learn("field-label", f.label);
  }
  const byKey = {};
  for (const f of fields) if (!(f.key in byKey)) byKey[f.key] = f.value;
  return { fields, byKey };
};

// src/perceiver/parse/entities.js
var TITLE = String.raw`(?:Mr|Mrs|Ms|Dr|Miss|Mister|Sir|Madam|Madame|Lady|Lord|Professor|Prof|Capt|Captain|Rev|St|Aunt|Uncle)\.?`;
var CONN = String.raw`de|von|van|der|del|di|du|la|le|of|the`;
var NAME = String.raw`[A-Z][a-zA-Z]+(?:\s+(?:${CONN}\s+)?[A-Z][a-zA-Z]+)*`;
var CAP_RE = new RegExp(String.raw`\b(?:${TITLE}\s+)?${NAME}\b`, "g");
var lc = (s) => String(s || "").toLowerCase();
var setOf = (seed) => new Set(seed.map(lc));
var DEFAULT_CONVENTIONS = (() => {
  const starter = setOf(SEED_STARTER), fn = setOf(SEED_FUNCTION);
  const prep = setOf(SEED_PREPOSITION), role = setOf(SEED_ROLE), aux = setOf(SEED_AUXILIARY);
  return {
    isStarter: (w) => starter.has(lc(w)),
    isFunction: (w) => fn.has(lc(w)),
    isPreposition: (w) => prep.has(lc(w)),
    isRole: (w) => role.has(lc(w)),
    isAuxiliary: (w) => aux.has(lc(w))
  };
})();
var TITLE_WORDS = /* @__PURE__ */ new Set([
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Miss",
  "Mister",
  "Sir",
  "Madam",
  "Madame",
  "Lady",
  "Lord",
  "Professor",
  "Prof",
  "Capt",
  "Captain",
  "Rev",
  "St",
  "Aunt",
  "Uncle"
]);
var idFor = (label) => label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
var GRAVITY_FLOOR = 1;
var isContent = (w, C) => !!w && /^[a-z][a-z'’]*$/.test(w) && w.length >= 2 && !C.isFunction(w);
var sightingGravity = (sentence, start, end, C) => {
  const after = sentence.slice(end);
  if (/^['’]s?\b/.test(after)) return 1;
  const before = sentence.slice(0, start);
  const prev = (before.match(/([A-Za-z'’]+)\s*$/) || [])[1];
  const next = (after.match(/^\s*([A-Za-z'’]+)/) || [])[1];
  if (prev && (C.isRole(prev) || C.isPreposition(prev))) return 1;
  if (isContent(next, C) || isContent(prev, C)) return 1;
  if (next && C.isAuxiliary(next)) return 1;
  return 0;
};
var cleanLabel = (raw, C = DEFAULT_CONVENTIONS) => {
  let words = raw.trim().split(/\s+/);
  while (words.length > 0 && C.isStarter(words[0])) words.shift();
  if (words.length === 0) return null;
  const head = words[0].replace(/\.$/, "");
  if (TITLE_WORDS.has(head)) {
    if (words.length === 1) return null;
    words = [head, ...words.slice(1)];
  }
  if (words.length === 1 && C.isStarter(words[0])) return null;
  return words.join(" ");
};
var createEntityAdmission = ({ conventions } = {}) => {
  const C = conventions ? {
    isStarter: (w) => conventions.isStarter(w),
    isFunction: (w) => conventions.isFunction(w),
    isPreposition: (w) => conventions.isPreposition(w),
    isRole: (w) => conventions.isRole(w),
    isAuxiliary: (w) => conventions.isAuxiliary(w)
  } : DEFAULT_CONVENTIONS;
  const counts = /* @__PURE__ */ new Map();
  const gravity = /* @__PURE__ */ new Map();
  const admitted = /* @__PURE__ */ new Map();
  const sightSent = /* @__PURE__ */ new Map();
  const mentions = /* @__PURE__ */ new Map();
  const noteMention = (id, sentIdx) => {
    if (sentIdx == null) return;
    const arr = mentions.get(id) || [];
    arr.push(sentIdx);
    mentions.set(id, arr);
  };
  const aliasOf = (label) => {
    const t = label.split(" ");
    for (const [lab, id] of admitted) {
      const lt = lab.split(" ");
      if (t.length === 1 && lt.length >= 2 && lt.length <= 3) {
        if (lt[0] === t[0]) return { id, kind: "head", token: t[0] };
        if (lt[lt.length - 1] === t[0]) return { id, kind: "tail", token: t[0] };
      }
      if (lt.length === 1 && t.length >= 2 && t.length <= 3) {
        if (t[0] === lt[0]) return { id, kind: "head", token: lt[0] };
        if (t[t.length - 1] === lt[0]) return { id, kind: "tail", token: lt[0] };
      }
    }
    return null;
  };
  const observe = (sentence, sentIdx = null) => {
    const seenInSentence = /* @__PURE__ */ new Set();
    const out = [];
    const re = new RegExp(CAP_RE.source, "g");
    let m;
    while ((m = re.exec(sentence)) !== null) {
      const label = cleanLabel(m[0], C);
      if (!label) continue;
      if (seenInSentence.has(label)) continue;
      seenInSentence.add(label);
      if (sentIdx != null) {
        const s = sightSent.get(label) || [];
        s.push(sentIdx);
        sightSent.set(label, s);
      }
      const c = (counts.get(label) ?? 0) + 1;
      counts.set(label, c);
      const multiword = label.includes(" ");
      const g = (gravity.get(label) || 0) + (multiword ? GRAVITY_FLOOR : sightingGravity(sentence, m.index, m.index + m[0].length, C));
      gravity.set(label, g);
      if (admitted.has(label)) {
        const id = admitted.get(label);
        noteMention(id, sentIdx);
        out.push({ status: "present", id, label });
      } else if (g >= GRAVITY_FLOOR) {
        const rawId = idFor(label);
        const alias = aliasOf(label);
        const head = alias && alias.kind === "head";
        const id = head ? alias.id : rawId;
        admitted.set(label, id);
        if (!mentions.has(id)) mentions.set(id, []);
        for (const si of sightSent.get(label) || []) mentions.get(id).push(si);
        out.push({
          status: "admit",
          id,
          label,
          rawId,
          aliasOf: alias ? alias.id : null,
          aliasKind: alias ? alias.kind : null,
          surname: alias && alias.kind === "tail" ? String(alias.token).toLowerCase() : null
        });
      } else {
        out.push({ status: "candidate", label });
      }
    }
    return out;
  };
  return {
    observe,
    isAdmitted: (label) => admitted.has(label),
    idOf: (label) => admitted.get(label),
    labelOf: (id) => {
      for (const [label, eid] of admitted) if (eid === id) return label;
      return null;
    },
    get counts() {
      return counts;
    },
    get admitted() {
      return admitted;
    },
    get mentions() {
      return mentions;
    }
  };
};
var scanEntities = (text) => {
  const re = new RegExp(CAP_RE.source, "g");
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = cleanLabel(m[0]);
    if (label) out.push({ label, start: m.index, end: m.index + m[0].length });
  }
  return out;
};

// src/perceiver/parse/clauses.js
var SEED_CLAUSE_BOUNDARY = Object.freeze([
  ", and ",
  ", but ",
  ", or ",
  ", nor ",
  ", so ",
  ", yet ",
  "; ",
  " while ",
  " when ",
  " where ",
  " because ",
  " although ",
  " though ",
  " whereas ",
  " unless ",
  " who ",
  " which "
]);
var PARTICIPIAL = /,\s+(?=(?:[a-z]+ing\b|He\b|She\b|They\b|We\b|It\b|You\b))/g;
var span = (s, from, to) => {
  const raw = s.slice(from, to);
  const lead = raw.length - raw.replace(/^\s+/, "").length;
  const text = raw.slice(lead).replace(/\s+$/, "");
  return text ? { text, offset: from + lead } : null;
};
var segmentClauses = (sentence, { boundaries = SEED_CLAUSE_BOUNDARY } = {}) => {
  const s = String(sentence || "");
  if (!s.trim()) return [];
  const lower = s.toLowerCase();
  const cuts = [];
  for (const mk of boundaries) {
    let from = 0, i;
    while ((i = lower.indexOf(mk, from)) !== -1) {
      cuts.push({ at: i, after: i + mk.length });
      from = i + mk.length;
    }
  }
  let m;
  const re = new RegExp(PARTICIPIAL.source, "g");
  while ((m = re.exec(s)) !== null) cuts.push({ at: m.index, after: m.index + m[0].length });
  if (cuts.length === 0) {
    const whole = span(s, 0, s.length);
    return whole ? [whole] : [];
  }
  cuts.sort((a, b) => a.at - b.at);
  const spans = [];
  let start = 0;
  for (const c of cuts) {
    if (c.at <= start) {
      start = Math.max(start, c.after);
      continue;
    }
    const sp = span(s, start, c.at);
    if (sp) spans.push(sp);
    start = c.after;
  }
  const tail = span(s, start, s.length);
  if (tail) spans.push(tail);
  return spans;
};

// src/perceiver/parse/relations.js
var COPULA_SEED = new Set(SEED_COPULA);
var SPEECH_SEED = new Set(SEED_SPEECH);
var MODIFIER_SEED = new Set(SEED_MODIFIER);
var CONJUNCTION_SEED = new Set(SEED_CONJUNCTION);
var defIsCopula = (w) => COPULA_SEED.has(w);
var defIsSpeech = (w) => SPEECH_SEED.has(w);
var defIsModifier = (w) => MODIFIER_SEED.has(w);
var defIsConjunction = (w) => CONJUNCTION_SEED.has(w);
var NOT_HEAD = /* @__PURE__ */ new Set([
  "who",
  "whom",
  "whose",
  "which",
  "that",
  "what",
  "where",
  "when",
  "why",
  "how",
  "by",
  "of",
  "in",
  "on",
  "at",
  "to",
  "from",
  "with",
  "for",
  "as",
  "than",
  "about",
  "and",
  "but",
  "or",
  "nor",
  "so",
  "because",
  "although",
  "while",
  "if",
  "unless",
  "a",
  "an",
  "the",
  "his",
  "her",
  "their",
  "its",
  "this",
  "these",
  "those",
  "my",
  "your",
  "our",
  "mine",
  "yours",
  "ours",
  "between",
  "among",
  "amongst",
  "through",
  "throughout",
  "without",
  "within",
  "into",
  "onto",
  "upon",
  "over",
  "under",
  "across",
  "behind",
  "beside",
  "below",
  "above",
  "near",
  "past",
  "around",
  "round",
  "against",
  "toward",
  "towards",
  "during",
  "off",
  "up",
  "down",
  "out",
  "something",
  "nothing",
  "anything",
  "everything",
  "someone",
  "anyone",
  "everyone",
  "somebody",
  "anybody",
  "everybody",
  "nobody",
  "none",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "all",
  "some",
  "any",
  "each",
  "every",
  "both",
  "either",
  "neither",
  "several",
  "many",
  "few",
  "fewer",
  "other",
  "another",
  "various",
  "numerous",
  "multiple",
  "enough",
  "certain",
  "including"
]);
var NEGATION = /* @__PURE__ */ new Set(["not", "never", "cannot"]);
var MODAL_EPISTEMIC = /* @__PURE__ */ new Set(["could", "would", "might", "may"]);
var MODAL_DEONTIC = /* @__PURE__ */ new Set(["must", "should", "shall", "ought"]);
var MODAL_IRREALIS = /* @__PURE__ */ new Set(["will", "can"]);
var MODALS = /* @__PURE__ */ new Set([...MODAL_EPISTEMIC, ...MODAL_DEONTIC, ...MODAL_IRREALIS]);
var HEDGE_VERB = /* @__PURE__ */ new Set(["seem", "seems", "seemed", "appear", "appears", "appeared", "look", "looks", "looked"]);
var NEG_CONTRACTION = /^([a-z]+)n['’]t$/;
var DO_SUPPORT = /* @__PURE__ */ new Set(["do", "does", "did"]);
var polmod = (head) => ({
  ...head.polarity === "\u2212" ? { polarity: "\u2212" } : {},
  ...head.modality && head.modality !== "realis" ? { modality: head.modality } : {}
});
var KIN_NOUNS = Object.freeze([
  "father",
  "mother",
  "sister",
  "brother",
  "son",
  "daughter",
  "wife",
  "husband",
  "parents",
  "uncle",
  "aunt",
  "cousin",
  "nephew",
  "niece",
  "grandfather",
  "grandmother",
  "friend",
  "master",
  "servant",
  "boss",
  "chief",
  "partner",
  "neighbour",
  "neighbor",
  "colleague",
  "lover",
  "fiance",
  "fiancee"
]);
var KIN = `(?:${KIN_NOUNS.join("|")})`;
var KIN_RE = new RegExp(
  String.raw`(?:([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)'s|\b(his|her|their|its)\b)\s+(${KIN})\s*,?\s+([A-Z][a-zA-Z]+)`,
  "gi"
);
var LEAD_COORD = /^\s*(?:and|but|now|so|then|or|nor|yet|for|therefore|thus)\b[\s,]*/i;
var COORD_CLAUSE_BOUNDARY = [...SEED_CLAUSE_BOUNDARY, ": "];
var leadingSubject = (sentence, admission, coref) => {
  const lead = (sentence.match(LEAD_COORD) || [""])[0].length;
  const rest = sentence.slice(lead);
  const pn = rest.match(/^\s*(he|she|they|we|it|i|you)\b/i);
  if (pn) {
    const cands = coref?.field ? coref.field() : [];
    const top = cands[0];
    const start = lead + (pn[0].length - pn[1].length);
    return { id: top?.id ?? null, start, end: lead + pn[0].length, text: pn[1], kind: "pronoun", w: top?.w ?? 0 };
  }
  const ents = scanEntities(rest);
  const first = ents.find((e) => e.start <= 1);
  if (first && admission.isAdmitted(first.label)) {
    return {
      id: admission.idOf(first.label),
      start: lead + first.start,
      end: lead + first.end,
      text: rest.slice(first.start, first.end),
      kind: "name",
      w: 1
    };
  }
  return null;
};
var coordinatedSubjects = (sentence, admission, isConjunction) => {
  const lead = (sentence.match(LEAD_COORD) || [""])[0].length;
  const rest = sentence.slice(lead);
  const ents = scanEntities(rest);
  if (!ents.length || ents[0].start > 1) return null;
  const subjects = [];
  let prevEnd = null;
  for (const e of ents) {
    if (prevEnd !== null) {
      const word = rest.slice(prevEnd, e.start).replace(/[\s,&]/g, "").toLowerCase();
      if (word !== "" && !isConjunction(word)) break;
    }
    if (!admission.isAdmitted(e.label)) break;
    subjects.push({
      id: admission.idOf(e.label),
      start: lead + e.start,
      end: lead + e.end,
      text: rest.slice(e.start, e.end)
    });
    prevEnd = e.end;
  }
  return subjects.length >= 2 ? { subjects, end: subjects[subjects.length - 1].end } : null;
};
var coupling = (subj) => subj.kind === "pronoun" || subj.kind === "inherited" ? { w: Math.round((subj.w ?? 0) * 1e3) / 1e3 } : {};
var headVerb = (text, { isCopula = defIsCopula, isModifier = defIsModifier } = {}) => {
  let rest = text.replace(/^[\s,]+/, "");
  let consumed = text.length - rest.length;
  let polarity = "+";
  let modality = "realis";
  const setModality = (w) => {
    if (MODAL_EPISTEMIC.has(w) || HEDGE_VERB.has(w)) modality = "epistemic";
    else if (MODAL_DEONTIC.has(w)) modality = "deontic";
    else if (MODAL_IRREALIS.has(w) && modality === "realis") modality = "irrealis";
  };
  const stepOver = (m) => {
    const sliced = rest.slice(m[0].length);
    const trimmed = sliced.replace(/^[\s,]+/, "");
    consumed += m[0].length + (sliced.length - trimmed.length);
    rest = trimmed;
  };
  for (let guard = 0; guard < 8; guard++) {
    const m = rest.match(/^([A-Za-z][a-zA-Z'’]*)\b/);
    if (!m) return null;
    const w = m[1].toLowerCase();
    const at = consumed;
    const restStart = at + m[0].length;
    const contr = w.match(NEG_CONTRACTION);
    if (contr) {
      polarity = "\u2212";
      if (!DO_SUPPORT.has(contr[1])) setModality(contr[1]);
      stepOver(m);
      continue;
    }
    if (NEGATION.has(w)) {
      polarity = "\u2212";
      stepOver(m);
      continue;
    }
    if (MODALS.has(w)) {
      setModality(w);
      stepOver(m);
      continue;
    }
    if (isCopula(w)) return { verb: w, rest: rest.slice(m[0].length), copular: true, at, restStart, polarity, modality };
    if (isModifier(w)) {
      stepOver(m);
      continue;
    }
    if (NOT_HEAD.has(w)) return null;
    if (HEDGE_VERB.has(w)) modality = "epistemic";
    return { verb: w, rest: rest.slice(m[0].length), copular: false, at, restStart, polarity, modality };
  }
  return null;
};
var objectEntities = (text, admission, excludeId) => {
  const out = [];
  const seen = /* @__PURE__ */ new Set([excludeId]);
  for (const e of scanEntities(text)) {
    if (!admission.isAdmitted(e.label)) continue;
    const id = admission.idOf(e.label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: e.label, start: e.start, end: e.end });
  }
  return out;
};
var NP_PREP = /* @__PURE__ */ new Set([
  "over",
  "under",
  "into",
  "onto",
  "across",
  "through",
  "toward",
  "towards",
  "at",
  "to",
  "on",
  "in",
  "behind",
  "beside",
  "below",
  "above",
  "near",
  "past",
  "around",
  "round",
  "up",
  "down",
  "off",
  "against",
  "upon",
  "within",
  "from",
  "by",
  "of",
  "with",
  "for",
  "about",
  "before",
  "after"
]);
var NP_DET = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "his",
  "her",
  "their",
  "its",
  "my",
  "your",
  "our",
  "some",
  "any",
  "no",
  "each",
  "every",
  "another",
  "one",
  "all",
  "both"
]);
var NP_NON_HEAD = /* @__PURE__ */ new Set([
  ...NP_DET,
  ...NP_PREP,
  "and",
  "but",
  "or",
  "nor",
  "so",
  "yet",
  "as",
  "than",
  "then",
  "if",
  "because",
  "he",
  "she",
  "it",
  "they",
  "we",
  "i",
  "you",
  "him",
  "them",
  "us",
  "me",
  "who",
  "whom",
  "whose",
  "which",
  "what",
  "where",
  "when",
  "why",
  "how",
  "here",
  "there",
  "not",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "thing",
  "things",
  "way",
  "ways",
  "time",
  "times",
  "day",
  "days",
  "moment",
  "while",
  "part",
  "lot",
  "kind",
  "sort",
  "bit",
  "deal",
  "course",
  "something",
  "nothing",
  "anything",
  "everything",
  "someone",
  "anyone",
  "everyone",
  "ones",
  "order",
  "sense",
  "fact",
  "later",
  "earlier",
  "soon",
  "ago",
  "away",
  "again",
  "together",
  "onward",
  "forward",
  "backward",
  "meanwhile",
  "afterward",
  "afterwards",
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "now",
  "once",
  "too",
  "enough",
  "indeed",
  "perhaps"
]);
var NP_BOUNDARY = /* @__PURE__ */ new Set([
  "and",
  "but",
  "or",
  "nor",
  "so",
  "yet",
  "while",
  "when",
  "where",
  "because",
  "although",
  "though",
  "since",
  "after",
  "before",
  "until",
  "unless",
  "who",
  "which",
  "that",
  "as",
  "than"
]);
var NP_PARTICLE = /* @__PURE__ */ new Set([
  "out",
  "away",
  "aside",
  "apart",
  "along",
  "ahead",
  "aback",
  "aboard",
  "forward",
  "backward",
  "upward",
  "downward",
  "inward",
  "outward",
  "onward",
  "indoors",
  "outdoors",
  "abroad",
  "overboard",
  "here",
  "there",
  "everywhere",
  "anywhere",
  "nowhere",
  "somewhere"
]);
var NP_REFLEX = /* @__PURE__ */ new Set([
  "himself",
  "herself",
  "itself",
  "themselves",
  "myself",
  "yourself",
  "ourselves",
  "oneself"
]);
var isAdverbLy = (lw) => lw.length > 4 && lw.endsWith("ly");
var isParticiple = (lw) => lw.length > 4 && (lw.endsWith("ing") || lw.endsWith("ed"));
var npObject = (rest, guards) => {
  const seg = String(rest).split(/[,;:.!?…—–()"]/)[0];
  const toks = [];
  const re = /[A-Za-z][A-Za-z'’]*/g;
  let m;
  while ((m = re.exec(seg)) !== null)
    toks.push({ w: m[0], lw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  if (!toks.length) return null;
  const isVerbish = (lw) => guards.isCopula(lw) || guards.isModifier(lw) || guards.isSpeech(lw);
  const stops = (t) => NP_BOUNDARY.has(t.lw) || NP_PREP.has(t.lw) || NP_REFLEX.has(t.lw) || isVerbish(t.lw);
  let i = NP_PREP.has(toks[0].lw) ? 1 : 0;
  const run = [];
  for (; i < toks.length && run.length < 5; i++) {
    const t = toks[i];
    if (run.length > 0 && stops(t)) break;
    run.push(t);
  }
  const eligible = (t, allowParticiple) => {
    if (/^[A-Z]/.test(t.w)) return false;
    if (NP_NON_HEAD.has(t.lw) || NP_PARTICLE.has(t.lw) || NP_REFLEX.has(t.lw)) return false;
    if (isVerbish(t.lw) || isAdverbLy(t.lw) || t.lw.length < 2) return false;
    if (!allowParticiple && isParticiple(t.lw)) return false;
    return true;
  };
  for (const allow of [false, true])
    for (let k = run.length - 1; k >= 0; k--)
      if (eligible(run[k], allow)) return { lemma: run[k].lw, start: run[k].start, end: run[k].end };
  return null;
};
var kinshipEdges = (sentence, admission, coref) => {
  const out = [];
  const re = new RegExp(KIN_RE.source, KIN_RE.flags);
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const ownerName = m[1];
    const ownerPron = m[2];
    const kin = m[3].toLowerCase();
    const relName = m[4];
    let ownerId = null;
    if (ownerName && admission.isAdmitted(ownerName)) ownerId = admission.idOf(ownerName);
    else if (ownerPron && coref?.resolve) ownerId = coref.resolve(ownerPron);
    if (!ownerId) continue;
    if (!admission.isAdmitted(relName)) continue;
    const relId = admission.idOf(relName);
    if (relId === ownerId) continue;
    out.push({ op: "CON", src: ownerId, tgt: relId, via: kin });
  }
  return out;
};
var DESC_NAME_RE = new RegExp(String.raw`\b([A-Z][a-zA-Z]+)['’]s\s+(${KIN})\b`, "gi");
var DESC_PRON_RE = new RegExp(String.raw`\b(his|her|their|its)\s+(${KIN})\b`, "gi");
var scanDescriptors = (sentence) => {
  const s = String(sentence || "");
  const isApposition = (endIdx) => /^[,\s]+[A-Z][a-z]/.test(s.slice(endIdx));
  const out = [];
  let m;
  const reN = new RegExp(DESC_NAME_RE.source, "gi");
  while ((m = reN.exec(s)) !== null) {
    if (isApposition(m.index + m[0].length)) continue;
    out.push({ roleKey: m[2].toLowerCase(), owner: { kind: "name", name: m[1] } });
  }
  const reP = new RegExp(DESC_PRON_RE.source, "gi");
  while ((m = reP.exec(s)) !== null) {
    if (isApposition(m.index + m[0].length)) continue;
    out.push({ roleKey: m[2].toLowerCase(), owner: { kind: "pron", pron: m[1].toLowerCase() } });
  }
  return out;
};
var scanVocatives = (sentence) => {
  const s = String(sentence || "");
  const out = [];
  for (const m of s.matchAll(/\b([A-Z][a-zA-Z]+)\s*[!?]/g)) out.push({ name: m[1], index: m.index });
  return out;
};
var parseRelations = (sentence, admission, coref = {}, opts = {}) => {
  const isSpeech = opts.isSpeech || defIsSpeech;
  const isConjunction = opts.isConjunction || defIsConjunction;
  const verbOpts = { isCopula: opts.isCopula || defIsCopula, isModifier: opts.isModifier || defIsModifier };
  const npGuards = { isSpeech, isCopula: verbOpts.isCopula, isModifier: verbOpts.isModifier };
  const wantReferents = !!opts.referents;
  const out = [];
  const s = sentence.trim();
  let running = null;
  for (const clause of segmentClauses(s, opts.coordSubjects ? { boundaries: COORD_CLAUSE_BOUNDARY } : void 0)) {
    const base = clause.offset;
    if (opts.coordSubjects) {
      const coord = coordinatedSubjects(clause.text, admission, isConjunction);
      if (coord) {
        const after2 = clause.text.slice(coord.end);
        const head2 = headVerb(after2, verbOpts);
        if (head2 && !head2.copular) {
          const op2 = isSpeech(head2.verb) ? "SIG" : "CON";
          const restBase2 = base + coord.end + head2.restStart;
          const named = objectEntities(head2.rest, admission, null).filter((o) => !coord.subjects.some((su) => su.id === o.id));
          const targets = named.length ? named.map((o) => ({ id: o.id, start: o.start, end: o.end, kind: void 0 })) : (() => {
            const np = wantReferents ? npObject(head2.rest, npGuards) : null;
            return np ? [{ id: np.lemma, start: np.start, end: np.end, kind: "np" }] : [];
          })();
          for (const t of targets) {
            const oStart = restBase2 + t.start, oEnd = restBase2 + t.end;
            const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: t.id };
            const verb2 = { text: head2.verb, start: base + coord.end + head2.at, end: restBase2 };
            for (const su of coord.subjects) {
              const subject = { text: su.text, start: base + su.start, end: base + su.end, id: su.id };
              out.push({
                op: op2,
                src: su.id,
                tgt: t.id,
                via: head2.verb,
                ...t.kind ? { tgtKind: t.kind } : {},
                ...polmod(head2),
                coord: true,
                args: { subject, verb: verb2, object, op: op2 }
              });
            }
          }
          if (targets.length) {
            running = { id: coord.subjects[coord.subjects.length - 1].id, w: 1 };
            continue;
          }
        }
      }
    }
    let subj = leadingSubject(clause.text, admission, coref);
    if (!subj || !subj.id) {
      const lead = (clause.text.match(LEAD_COORD) || [""])[0].length;
      if (headVerb(clause.text.slice(lead), verbOpts)) {
        const inh = running || (coref.lastIns ? coref.lastIns() : null);
        if (inh && inh.id) subj = { id: inh.id, start: lead, end: lead, text: "", kind: "inherited", w: inh.w ?? 0 };
      }
    }
    if (!subj || !subj.id) continue;
    let afterStart = subj.end;
    const subjects = [subj];
    if (subj.kind === "name") {
      const rest0 = clause.text.slice(subj.end);
      let conjConsumed = 0;
      while (true) {
        const cjM = rest0.slice(conjConsumed).match(/^\s*(?:and|or)\s+/i);
        if (!cjM) break;
        const nameStart = conjConsumed + cjM[0].length;
        const ents = scanEntities(rest0.slice(nameStart));
        const first = ents.find((e) => e.start <= 1);
        if (!first || !admission.isAdmitted(first.label)) break;
        const coId = admission.idOf(first.label);
        if (!coId || coId === subj.id) break;
        subjects.push({
          id: coId,
          start: subj.end + nameStart + first.start,
          end: subj.end + nameStart + first.end,
          text: first.label,
          kind: "name",
          w: 1
        });
        conjConsumed = nameStart + first.end;
      }
      if (subjects.length > 1) afterStart = subj.end + conjConsumed;
    }
    running = {
      id: subjects[subjects.length - 1].id,
      w: subjects[subjects.length - 1].kind === "name" ? 1 : subjects[subjects.length - 1].w ?? 0
    };
    const after = clause.text.slice(afterStart);
    const head = headVerb(after, verbOpts);
    if (!head) continue;
    const vStart = base + afterStart + head.at, vEnd = base + afterStart + head.restStart;
    const verb = { text: s.slice(vStart, vEnd), start: vStart, end: vEnd };
    const restBase = vEnd;
    if (head.copular) {
      const pred = head.rest.replace(/^[\s,]+/, "").replace(/[.!?]+\s*$/, "").trim();
      if (pred) {
        for (const csub of subjects) {
          const cw = coupling(csub);
          out.push({ op: "DEF", id: csub.id, key: "predicate", value: pred, ...cw, ...polmod(head) });
        }
      }
      continue;
    }
    const op = isSpeech(head.verb) ? "SIG" : "CON";
    for (const csub of subjects) {
      const cw = coupling(csub);
      const subject = { text: csub.text, start: base + csub.start, end: base + csub.end, id: csub.id };
      let bonded = false;
      for (const obj of objectEntities(head.rest, admission, csub.id)) {
        const oStart = restBase + obj.start, oEnd = restBase + obj.end;
        const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: obj.id };
        out.push({ op, src: csub.id, tgt: obj.id, via: head.verb, ...cw, ...polmod(head), args: { subject, verb, object, op } });
        bonded = true;
      }
      if (wantReferents && !bonded) {
        const np = npObject(head.rest, npGuards);
        if (np) {
          const oStart = restBase + np.start, oEnd = restBase + np.end;
          const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: np.lemma };
          out.push({
            op,
            src: csub.id,
            tgt: np.lemma,
            via: head.verb,
            tgtKind: "np",
            ...cw,
            ...polmod(head),
            args: { subject, verb, object, op }
          });
        }
      }
    }
  }
  for (const k of kinshipEdges(s, admission, coref)) {
    if (!out.some((o) => o.op === k.op && o.src === k.src && o.tgt === k.tgt)) out.push(k);
  }
  return out;
};

// src/perceiver/parse/proposition.js
var SVO_EXTRACTOR = "svo-regex";
var SVO_CONFIDENCE = 0.6;
var argumentSpanSeg = (args, sentIdx, {
  extractor = SVO_EXTRACTOR,
  confidence = SVO_CONFIDENCE
} = {}) => Object.freeze({
  op: "SEG",
  kind: "argspan",
  // the cut that read S/V/O — distinct from a retract SEG
  reader: extractor,
  // witnessed by the extractor — a perception, not a fact
  confidence,
  sentIdx,
  // the sentence cut below it — the text the spans were read from
  depicts: args.op || "CON",
  // the bond this argument-span cut feeds
  subject: args.subject,
  verb: args.verb,
  object: args.object
});

// src/converse/provenance.js
var CONVERSATIONAL_CAP = 0.6;

// src/converse/history.js
var DEFAULTS = Object.freeze({
  budgetTokens: 600,
  // the recent verbatim window's ceiling (the fold engages beyond it)
  minRecent: 4,
  // a continuity floor — kept even when one huge turn overflows
  gamma: 0.7,
  // vocabulary decay, matches the reading's γ
  maxNoteTurns: 6,
  // cap on the recap so a long backlog can't blow the notes budget
  forget: 0.15
  // a token decayed below this is "new" again (content-add, not fraction)
});
var STOP = new Set("a an the and or but if then so of to in on at for with as is are was were be been being do does did have has had i you he she it we they me him her them my your our this that these those what which who whom whose how why when where will would can could should may might must not no yes ok okay sure thanks thank please just about".split(" "));

// src/converse/focus.js
var STOP2 = new Set("a an the and or but if then so of to in on at for with as is are was were be been being do does did done have has had i you he she it we they me him her them my your our this that these those what which who whom whose how why when where will would can could should may might must not no yes ok okay sure thanks thank please just about now then again more next go on continue here there back also too anymore".split(/\s+/));
var ATTRIBUTE = new Set("name names age job jobs role roles title titles occupation profession identity gender nationality deal story point problem problems issue issues".split(/\s+/));
var PRONOUN_TOKENS = new Set("he him his she her hers it its they them their theirs".split(" "));

// src/perceiver/surfaces.js
var NOTE_GROUPS = Object.freeze({
  settled: "What the document settles:",
  heldOpen: "What the document holds open (do not settle these):",
  turns: "Where the reading turns:"
});

// src/perceiver/parse/coref.js
var createCorefField = ({
  gamma = 0.7,
  maxDist = 8,
  convGamma = gamma,
  // conversational warmth decays at least as fast
  convCap = CONVERSATIONAL_CAP,
  // and never deposits above the model reader's cap
  descGamma = 0.97,
  // standing descriptions decay ~glacially
  descMaxDist = 400,
  // a role can be reactivated discourse-wide
  // Whether two role keys conflict on one bearer ("sister" vs "mother"). INJECTED,
  // never hardcoded: coref must not KNOW the algebra, only consult it. The default
  // asserts no conflicts (a leaf claims no knowledge it wasn't handed); the wiring
  // layer — which is allowed to see both holons — passes one backed by the typing
  // bridge's areDisjoint, so the conflict knowledge lives in exactly one place.
  rolesConflict = () => false
} = {}) => {
  const traces = /* @__PURE__ */ new Map();
  const descriptors = /* @__PURE__ */ new Map();
  const touch = (id, sentIdx) => {
    const tr = traces.get(id) || { lastIdx: sentIdx, grounded: 0, conversational: 0 };
    const d = Math.max(0, sentIdx - tr.lastIdx);
    tr.grounded *= Math.pow(gamma, d);
    tr.conversational *= Math.pow(convGamma, d);
    tr.lastIdx = sentIdx;
    traces.set(id, tr);
    return tr;
  };
  const note = (id, sentIdx) => {
    touch(id, sentIdx).grounded += 1;
  };
  const noteConversational = (id, sentIdx, w = convCap) => {
    touch(id, sentIdx).conversational += Math.min(convCap, Math.max(0, w));
  };
  const reinforce = (id, w, sentIdx) => noteConversational(id, sentIdx ?? 0, w);
  const boundToConflicting = (id, roleKey) => {
    for (const [rk, d] of descriptors)
      if (d.bound === id && rk !== roleKey && rolesConflict(roleKey, rk)) return true;
    return false;
  };
  const noteDescriptor = (roleKey, sentIdx, ownerId = null, { named = false } = {}) => {
    const dr = descriptors.get(roleKey) || { ownerId: null, ownerNamed: false, lastIdx: sentIdx, mass: 0, bound: null };
    const d = Math.max(0, sentIdx - dr.lastIdx);
    dr.mass = dr.mass * Math.pow(descGamma, d) + 1;
    dr.lastIdx = sentIdx;
    if (ownerId && (named || !dr.ownerNamed)) {
      dr.ownerId = ownerId;
      if (named) dr.ownerNamed = true;
    }
    descriptors.set(roleKey, dr);
    if (dr.bound) noteConversational(dr.bound, sentIdx, convCap * 0.5);
  };
  const unifyDescriptor = (roleKey, nameId, sentIdx, { compatible = true } = {}) => {
    const dr = descriptors.get(roleKey);
    if (!dr || !compatible) return null;
    if (dr.ownerId && dr.ownerId === nameId) return null;
    if (sentIdx - dr.lastIdx > descMaxDist) return null;
    if (dr.bound && dr.bound !== nameId) return null;
    if (boundToConflicting(nameId, roleKey)) return null;
    dr.bound = nameId;
    const decayed = dr.mass * Math.pow(descGamma, Math.max(0, sentIdx - dr.lastIdx));
    const w = Math.min(convCap, convCap * Math.tanh(decayed / 4));
    noteConversational(nameId, sentIdx, w);
    return { id: nameId, w, via: `descriptor:${roleKey}` };
  };
  const bindDescriptorsByElimination = (admittedIds, sentIdx) => {
    const ids = [...new Set(admittedIds)];
    const bonds = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const [roleKey, dr] of descriptors) {
        if (dr.bound || !dr.ownerNamed) continue;
        const survivors = ids.filter((id) => id !== dr.ownerId && !boundToConflicting(id, roleKey));
        if (survivors.length !== 1) continue;
        const bond = unifyDescriptor(roleKey, survivors[0], sentIdx, { compatible: true });
        if (bond) {
          bonds.push({ ...bond, role: roleKey, owner: dr.ownerId });
          changed = true;
        }
      }
    }
    return bonds;
  };
  const read = (sentIdx, pick) => {
    const cands = [];
    for (const [id, tr] of traces) {
      const dist = sentIdx - tr.lastIdx;
      if (dist < 0 || dist > maxDist) continue;
      const g = tr.grounded * Math.pow(gamma, dist);
      const c = tr.conversational * Math.pow(convGamma, dist);
      const mass = pick(g, c);
      if (mass > 0) cands.push({ id, mass, grounded: g, conversational: c });
    }
    const Z = cands.reduce((s, x) => s + x.mass, 0) || 1;
    for (const x of cands) x.w = x.mass / Z;
    cands.sort((a, b) => b.w - a.w);
    return cands;
  };
  const field = (sentIdx) => read(sentIdx, (g, c) => g + c).map(({ id, w, grounded, conversational }) => ({ id, w, grounded, conversational }));
  const fieldGrounded = (sentIdx) => read(sentIdx, (g) => g).map(({ id, w }) => ({ id, w }));
  const survivesSubtraction = (id, sentIdx, floor = 0) => {
    const g = fieldGrounded(sentIdx);
    const top = g[0];
    const me = g.find((c) => c.id === id);
    return !!me && !!top && me.id === top.id && me.w >= floor;
  };
  const descriptorState = (roleKey) => {
    const d = descriptors.get(roleKey);
    return d ? Object.freeze({ ...d }) : null;
  };
  return {
    note,
    noteConversational,
    reinforce,
    noteDescriptor,
    unifyDescriptor,
    bindDescriptorsByElimination,
    descriptorState,
    field,
    fieldGrounded,
    survivesSubtraction
  };
};

// src/perceiver/parse/naming.js
var REACH = 2;
var NONPERSON = /* @__PURE__ */ new Set(["god", "christmas", "heaven", "hell"]);
var prevWord = (s, idx) => (s.slice(0, idx).match(/(\w+)\W*$/) || [])[1];
var discoverNamings = (sentences, { admission, corefField, conventions, rolesConflict = () => false } = {}) => {
  const isStarter = conventions?.isStarter ?? (() => false);
  const isSpeech = conventions?.isAttributionVerb ?? (() => false);
  const owner = {};
  for (const role of KIN_NOUNS) {
    const d = corefField.descriptorState(role);
    if (d && d.ownerNamed && d.ownerId) owner[role] = d.ownerId;
  }
  if (!Object.keys(owner).length) return [];
  const ROLE_SPEAKER = new RegExp(String.raw`\b(?:his|her|the)\s+(${KIN_NOUNS.join("|")})\b`, "i");
  const vocAt = [];
  const ansAt = [];
  sentences.forEach((sent, i) => {
    const s = String(sent);
    for (const v of scanVocatives(s)) {
      const prev = prevWord(s, v.index);
      if (prev && isStarter(prev)) continue;
      if (NONPERSON.has(v.name.toLowerCase())) continue;
      if (admission.isAdmitted(v.name)) vocAt.push({ i, id: admission.idOf(v.name) });
    }
    const m = s.match(ROLE_SPEAKER);
    if (m && owner[m[1].toLowerCase()] && s.split(/\W+/).some(isSpeech)) ansAt.push({ i, role: m[1].toLowerCase() });
  });
  const raw = [];
  for (const v of vocAt) {
    const ans = ansAt.find((a) => a.i > v.i && a.i <= v.i + REACH);
    if (!ans) continue;
    if (v.id === owner[ans.role]) continue;
    raw.push({ role: ans.role, ownerId: owner[ans.role], name: v.id });
  }
  const byRole = /* @__PURE__ */ new Map();
  for (const p of raw) {
    if (!byRole.has(p.role)) byRole.set(p.role, /* @__PURE__ */ new Map());
    byRole.get(p.role).set(p.name, p);
  }
  const merges = [];
  const nameRole = /* @__PURE__ */ new Map();
  for (const [role, names] of byRole) {
    if (names.size > 1) continue;
    const p = [...names.values()][0];
    const prior = nameRole.get(p.name);
    if (prior && rolesConflict(role, prior)) continue;
    nameRole.set(p.name, role);
    merges.push(p);
  }
  return merges;
};

// src/perceiver/parse/tokenize.js
var STOP3 = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "and",
  "or",
  "but",
  "if",
  "as",
  "by",
  "from",
  "into",
  "over",
  "under",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "done",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "them",
  "us",
  "me",
  "him",
  "her",
  "my",
  "your",
  "our",
  "their",
  "his",
  "its",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "not"
]);
var tok = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((t) => t && t.length > 1 && !STOP3.has(t));

// src/perceiver/parse/pipeline.js
var DESC_OWNER_MARGIN = 2;
var createParser = ({
  languageModules = {},
  transcriptHandler = null,
  chromeHint = null,
  // optional (sentence) → score nudge toward chrome
  // The role-conflict predicate for the standing-descriptor trigger. INJECTED by
  // the assembly layer (ingest), which is allowed to see both holons and backs it
  // with the typing bridge's areDisjoint. Parse never imports the algebra; the
  // default asserts no conflict, so a bare parse has no descriptor exclusivity.
  rolesConflict = void 0,
  // The coref field's tuning — the CONFINEMENT WINDOW. The reach over which a
  // pronoun resolves (`maxDist`) and a standing role epithet can still bind a name
  // (`descMaxDist`, `descGamma`). INJECTED so a harness can sweep it without the
  // parser knowing why: too wide and wrong-owner relations bind, too narrow and the
  // long-range descriptor (a sibling named long after its epithet) never reaches.
  // The default is the coref field's own (a bare parse is unchanged).
  corefOpts = void 0,
  // The coherence-strain threshold at which the boundary-induction loop RECs a
  // punctuation mark into a sentence boundary (parse/boundaries.js). The default is
  // deliberately conservative (a rare crisis); exposed so a test or a known dialect
  // can set its own sensitivity. Undefined → the loop's own default.
  boundaryThreshold = void 0,
  // The core's learning layer (reshape §5), injectable so a harness can turn the
  // inherited priors OFF ({ seeds: false }) to prove the core still reads from
  // units alone (TEST 1), or feed sediment a prior read deposited ({ inherit }).
  // Default undefined → the seeded ledger; a bare parse is unchanged.
  conventionsOpts = void 0,
  // Coordinated-subject reading (relations.js): when a clause coordinates two named
  // subjects onto one predicate ("Delgado and Reyes listed…"), bond EACH conjunct to
  // the shared object so the convergence reaches the graph as a length-two path. A
  // RULES_REV-style switch held OFF by default: with it off the single-subject scan is
  // byte-identical (the goldens are untouched); a harness flips it on to expose the
  // convergence the bond graph otherwise never sees.
  coordSubjects = false
} = {}) => {
  const state = {
    languageModules: { ...languageModules },
    transcriptActive: false
  };
  const parse = (text, { docId } = {}) => {
    const log = createLog({ docId });
    const conventions = createConventions(conventionsOpts);
    const { extraBoundaries, recs: boundaryRecs } = induceBoundaries(text, {
      isAbbreviation: conventions.isAbbreviation,
      thresholds: boundaryThreshold != null ? { segmentation: boundaryThreshold } : void 0
    });
    for (const r of boundaryRecs) conventions.learn("boundary", r.token, r.fused || 1);
    const sentences = segmentSentences(text, { isAbbreviation: conventions.isAbbreviation, extraBoundaries });
    const admission = createEntityAdmission({ conventions });
    if (transcriptHandler && transcriptHandler.detect && transcriptHandler.detect(text)) {
      state.transcriptActive = true;
      state.languageModules["transcript-v1"] = { enabled: true };
    } else {
      state.transcriptActive = false;
      if (state.languageModules["transcript-v1"]) {
        state.languageModules["transcript-v1"] = {
          ...state.languageModules["transcript-v1"],
          enabled: false
        };
      }
    }
    for (const { token, count } of induceAttributionVerbs(sentences)) {
      conventions.learnAttribution(token, count);
    }
    const frame = frameSpan(sentences);
    const metadata = extractMetadata(text, { conventions });
    for (const r of conventions.rules) log.append(r);
    const slugOf = (s) => String(s || "").trim().replace(/[.\s]+/g, "-").replace(/[^\w-]/g, "");
    const docSlug = slugOf(docId) || "doc";
    for (const f of metadata.fields) {
      const keySlug = slugOf(f.key) || "field";
      const sentIdx = f.value ? sentences.findIndex((s) => s.includes(f.value)) : -1;
      log.append({
        op: "DEF",
        id: `${docSlug}.meta.${keySlug}`,
        kind: "meta",
        key: f.key,
        label: f.label,
        value: f.value,
        known: f.known,
        defeasible: true,
        line: f.line,
        ...sentIdx >= 0 ? { sentIdx } : {}
      });
    }
    const isSpeech = (verb) => conventions.isAttributionVerb(verb);
    const corefField = createCorefField({ ...corefOpts, ...rolesConflict ? { rolesConflict } : {} });
    const derivedEdges = [];
    const candidates = [];
    const INHERIT_REACH = 8;
    let lastIns = null;
    const surnameMerges = [];
    sentences.forEach((sent, sentIdx) => {
      if (frame.all.has(sentIdx)) {
        log.append({ op: "NUL", kind: "chrome", via: "frame", sentIdx, text: sent });
        log.append({ op: "DEF", id: `unit:${sentIdx}`, key: "role", value: "site", sentIdx });
        return;
      }
      if (isChrome(sent, chromeHint ? chromeHint(sent) : 0)) {
        log.append({ op: "NUL", kind: "chrome", sentIdx, text: sent });
        return;
      }
      const priorField = corefField.field(sentIdx);
      const priorLastIns = lastIns;
      for (const obs of admission.observe(sent, sentIdx)) {
        if (obs.status === "admit" || obs.status === "present") {
          log.append({ op: "INS", id: obs.id, label: obs.label, sentIdx });
          corefField.note(obs.id, sentIdx);
          lastIns = { id: obs.id, sentIdx };
        }
        if (obs.status !== "admit" || !obs.aliasOf) continue;
        if (obs.aliasKind === "head") {
          if (obs.rawId !== obs.id) {
            const syn = log.append({
              op: "SYN",
              kind: "alias",
              from: obs.rawId,
              to: obs.id,
              label: obs.label,
              sentIdx,
              match: "head",
              warrant: "given-name"
            });
            log.append({
              op: "EVA",
              site: "merge",
              ref: syn.seq,
              verdict: VERDICTS.CORROBORATED,
              reason: "given-name-containment",
              sentIdx
            });
          }
        } else if (obs.aliasKind === "tail") {
          const syn = log.append({
            op: "SYN",
            kind: "merge",
            from: obs.id,
            to: obs.aliasOf,
            label: obs.label,
            sentIdx,
            match: "tail",
            surname: obs.surname,
            warrant: "surname",
            defeasible: true,
            rebutter: "distinct-agent-shares-surname"
          });
          log.append({
            op: "EVA",
            site: "merge",
            ref: syn.seq,
            verdict: VERDICTS.INDETERMINATE,
            reason: "surname-containment-thin",
            surname: obs.surname,
            sentIdx
          });
          surnameMerges.push({ synSeq: syn.seq, surname: obs.surname });
        }
      }
      const coref = {
        field: () => priorField,
        resolve: () => priorField[0]?.id ?? null,
        // The last INS referent activated before this line, for a subjectless
        // clause to default to — within the activation reach, weight decayed by how
        // many lines back it was instantiated (the same γ kernel, as coupling).
        lastIns: () => {
          if (!priorLastIns) return null;
          const d = sentIdx - priorLastIns.sentIdx;
          if (d < 0 || d > INHERIT_REACH) return null;
          return { id: priorLastIns.id, w: Math.round(Math.pow(0.7, d) * 1e3) / 1e3 };
        }
      };
      const relOpts = {
        isSpeech,
        isCopula: conventions.isCopula,
        isModifier: conventions.isModifier,
        isConjunction: conventions.isConjunction,
        // ledger coordinator predicate
        referents: true,
        coordSubjects
      };
      for (const rel of parseRelations(sent, admission, coref, relOpts)) candidates.push({ rel, sentIdx });
      for (const desc of scanDescriptors(sent)) {
        let ownerId = null, named = false;
        if (desc.owner.kind === "name" && admission.isAdmitted(desc.owner.name)) {
          ownerId = admission.idOf(desc.owner.name);
          named = true;
        } else if (desc.owner.kind === "pron") {
          const [top, second] = priorField;
          if (top && (!second || top.w >= DESC_OWNER_MARGIN * second.w)) ownerId = top.id;
        }
        corefField.noteDescriptor(desc.roleKey, sentIdx, ownerId, { named });
      }
      for (const b of corefField.bindDescriptorsByElimination([...admission.admitted.values()], sentIdx))
        derivedEdges.push({ op: "CON", src: b.owner, tgt: b.id, via: b.role, sentIdx, w: b.w, derived: true });
    });
    if (surnameMerges.length) {
      const bearers = /* @__PURE__ */ new Map();
      for (const label of admission.admitted.keys()) {
        const words = label.split(" ");
        if (words.length < 2) continue;
        const s = words[words.length - 1].toLowerCase();
        if (!bearers.has(s)) bearers.set(s, /* @__PURE__ */ new Set());
        bearers.get(s).add(label);
      }
      for (const m of surnameMerges) {
        if ((bearers.get(m.surname)?.size || 0) < 2) continue;
        const seg = log.append({
          op: "SEG",
          kind: "retract",
          refSeq: m.synSeq,
          reason: "surname-shared-by-distinct-agents",
          surname: m.surname
        });
        log.append({
          op: "EVA",
          site: "merge",
          ref: m.synSeq,
          verdict: VERDICTS.CONTRADICTED,
          reason: "distinct-agent-shares-surname",
          surname: m.surname,
          defeatedBy: seg.seq
        });
      }
    }
    const viaCount = /* @__PURE__ */ new Map();
    const nounCount = /* @__PURE__ */ new Map();
    for (const { rel } of candidates)
      if (rel.op === "CON" || rel.op === "SIG") {
        viaCount.set(rel.via, (viaCount.get(rel.via) || 0) + 1);
        if (rel.tgtKind === "np") nounCount.set(rel.tgt, (nounCount.get(rel.tgt) || 0) + 1);
      }
    for (const [via, n] of viaCount) if (via && n >= 2) conventions.learn("relation", via, n);
    for (const { rel, sentIdx } of candidates) {
      const { args, coord, ...edge } = rel;
      if (edge.op === "CON" || edge.op === "SIG") {
        const recurrent = (viaCount.get(edge.via) || 1) >= 2 || coord === true;
        let factor = recurrent ? 1 : 0.5;
        if (edge.tgtKind === "np" && (nounCount.get(edge.tgt) || 1) < 2) factor *= 0.5;
        const base = edge.w == null ? 1 : edge.w;
        const w = Math.round(base * factor * 1e3) / 1e3;
        if (w < 1) edge.w = w;
        else delete edge.w;
        const relType = conventions.relationType(edge.via);
        if (relType) edge.relType = relType;
      }
      if (args) {
        const seg = log.append(argumentSpanSeg(args, sentIdx));
        log.append({ ...edge, sentIdx, argspan: seg.seq });
      } else {
        log.append({ ...edge, sentIdx });
      }
    }
    for (const e of derivedEdges) {
      const relType = conventions.relationType(e.via);
      log.append(relType ? { ...e, relType } : e);
    }
    for (const m of discoverNamings(sentences, { admission, corefField, conventions, rolesConflict })) {
      const roleRef = `role:${m.role}@${m.ownerId}`;
      const ownerLabel = admission.labelOf(m.ownerId) || m.ownerId;
      const relType = conventions.relationType(m.role);
      log.append({ op: "INS", id: roleRef, label: `${ownerLabel}\u2019s ${m.role}`, sentIdx: 0 });
      log.append({ op: "CON", src: m.ownerId, tgt: roleRef, via: m.role, sentIdx: 0, ...relType ? { relType } : {} });
      const syn = log.append({ op: "SYN", kind: "merge", from: roleRef, to: m.name, sentIdx: 0 });
      log.append({
        op: "EVA",
        site: "merge",
        ref: syn.seq,
        verdict: VERDICTS.CORROBORATED,
        reason: "naming-scene",
        role: m.role,
        sentIdx: 0
      });
    }
    const tokensBySentence = sentences.map((s) => new Set(tok(s)));
    return {
      docId,
      text,
      sentences,
      log,
      tokensBySentence,
      admission,
      conventions,
      // the learned-rules ledger (REC)
      metadata: metadata.byKey,
      // the document's front-matter facts, by canonical key
      metaFields: metadata.fields,
      // the harvested fields in reading order (label · value · sentIdx)
      mentions: admission.mentions,
      // id → unit indices
      // Modality-neutral contract: `units` is the reading sequence the spine
      // walks (here, sentences). An image adapter fills the same field with
      // regions; the operators, log, graph and reading levels are unchanged.
      units: sentences,
      modality: "text",
      corefField,
      // the referent field, incl. held standing descriptors (inspection)
      state
      // exposed for inspection; not for outside mutation
    };
  };
  return { parse, state };
};
var parseText = (text, opts = {}) => createParser(opts).parse(text, opts);

// src/reader/cross-source.js — nameless referent identity for the cross-source memory
// fold. See that file for the full reading; kept in sync here as part of the bundle.
var senseIdFor = (label) =>
  String(label ?? "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
var senseHash = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
var referentId = (anchorUrl, baseId) => "e" + senseHash(String(anchorUrl) + " " + String(baseId));
var SENSE_STOP = new Set(
  ("the of and a an to in on for is are was were be been being it its this that these those with as at by from or nor but so yet not no into over under out up down off about after before then than thus also who which what when where while there here they them his her she he you your our we us my are has have had will would can could should may might must does did done only just more most some any all each both few many much such own same other another into onto upon also very then them this that with into your their there about above below between through during without within along across around because although though however therefore moreover furthermore meanwhile nonetheless nevertheless said says say according new news page site source sources read reading").split(/\s+/)
);
var DISAMB_TITLE = /^\s*(.+?)\s*\(([^)]{2,40})\)/;
var senseDisamb = (title) => {
  const m = String(title || "").match(DISAMB_TITLE);
  if (!m) return null;
  const base = m[1].trim(), qualifier = m[2].trim();
  if (!base || base.length > 60) return null;
  return { base, qualifier, baseId: senseIdFor(base) };
};
var SENSE_VOID = "[void]";
var senseContext = (pg) => {
  const labelOf = /* @__PURE__ */ new Map(), sightings = /* @__PURE__ */ new Map(), allIds = /* @__PURE__ */ new Set();
  const note = (v) => { if (typeof v === "string" && v && v !== SENSE_VOID) allIds.add(v); };
  for (const e of pg.events || []) {
    note(e.id); note(e.src); note(e.tgt); note(e.from); note(e.to); note(e.node);
    if (e.subject) note(e.subject.id);
    if (e.object) note(e.object.id);
    if (e.op === "INS" && e.id != null && e.id !== SENSE_VOID) {
      if (!labelOf.has(e.id)) labelOf.set(e.id, e.label ?? e.id);
      sightings.set(e.id, (sightings.get(e.id) || 0) + 1);
    }
  }
  const proper = /* @__PURE__ */ new Set();
  for (const id of allIds) {
    const lab = String(labelOf.get(id) ?? "");
    if (!/^https?:/i.test(lab)) proper.add(id);
  }
  const freq = /* @__PURE__ */ new Map();
  for (const s of pg.sentences || [])
    for (const w of (String(s || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []))
      if (!SENSE_STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const topic = /* @__PURE__ */ new Set();
  for (const [w, n] of freq) if (n >= 2) topic.add(w);
  return { labelOf, sightings, proper, topic, allIds, title: pg.title || "", url: pg.url };
};
var referentMap = (pages) => {
  const ctx = pages.map(senseContext);
  const dis = pages.map((p) => senseDisamb(p.title));
  const byId = /* @__PURE__ */ new Map();
  ctx.forEach((c, i) => {
    for (const id of c.allIds) {
      let arr = byId.get(id); if (!arr) byId.set(id, (arr = []));
      arr.push(i);
    }
  });
  const remap = /* @__PURE__ */ new Map();
  const forks = [];
  const ensure = (url) => remap.get(url) || remap.set(url, /* @__PURE__ */ new Map()).get(url);
  const corroborates = (baseId, i, j) => {
    const a = ctx[i], b = ctx[j];
    for (const x of a.proper) if (x !== baseId && b.proper.has(x)) return true;
    let t = 0; for (const w of a.topic) if (b.topic.has(w)) { if (++t >= 2) return true; }
    return false;
  };
  const selfStanding = (i, baseId) => {
    let n = 0; for (const x of ctx[i].proper) if (x !== baseId && ++n >= 3) return true; return false;
  };
  for (const [baseId, idxs] of byId) {
    let groups;
    if (idxs.length < 2) {
      groups = [idxs];
    } else {
      const parent = new Map(idxs.map((i) => [i, i]));
      const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
      for (let a = 0; a < idxs.length; a++)
        for (let b = a + 1; b < idxs.length; b++)
          if (corroborates(baseId, idxs[a], idxs[b])) {
            const ra = find(idxs[a]), rb = find(idxs[b]);
            if (ra !== rb) parent.set(ra, rb);
          }
      const comps = /* @__PURE__ */ new Map();
      for (const i of idxs) { const r = find(i); (comps.get(r) || comps.set(r, []).get(r)).push(i); }
      const compList = [...comps.values()];
      if (compList.length < 2) {
        groups = [idxs];
      } else {
        const sightOf = (c) => c.reduce((s, i) => s + (ctx[i].sightings.get(baseId) || 0), 0);
        compList.sort((x, y) => sightOf(y) - sightOf(x));
        groups = [[...compList[0]]];
        for (let k = 1; k < compList.length; k++) {
          const c = compList[k];
          const distinct = c.every((i) => selfStanding(i, baseId))
            || c.some((i) => dis[i] && dis[i].baseId === baseId);
          if (distinct) groups.push(c);
          else groups[0] = groups[0].concat(c);
        }
      }
    }
    const forked = groups.length > 1;
    for (const g of groups) {
      const anchor = Math.min(...g);
      const label = ctx[anchor].labelOf.get(baseId) ?? baseId;
      const id = referentId(pages[anchor].url, baseId);
      let sense = null;
      if (forked) {
        const dp = g.find((i) => dis[i] && dis[i].baseId === baseId);
        sense = dp != null ? dis[dp].qualifier : null;
      }
      for (const i of g) ensure(pages[i].url).set(baseId, { id, label, sense });
      if (forked) forks.push({ url: pages[anchor].url, baseId, id, label, sense, pages: g.map((i) => pages[i].url) });
    }
  }
  return { remap, forks };
};
// src/perceiver/referent-nesting.js — the holonic containment address a referent earns
// from its span (docs/referent-journey.md). Pure over (log/mentions, graph); parseHolon
// and projectGraph are already in scope in this bundle.
var segmentOf = (id) => String(id).replace(/\./g, "·");
var strictlyContains = (B, A) =>
  B.span[0] <= A.span[0] && B.span[1] >= A.span[1] && B.spanLen > A.spanLen;
var referentNesting = (doc, graph = null) => {
  const g = graph || projectGraph(doc.log, {});
  const units = doc.units?.length ?? doc.sentences?.length ?? 0;
  const mentionsByRoot = /* @__PURE__ */ new Map();
  for (const [id, idxs] of (doc.mentions || /* @__PURE__ */ new Map())) {
    const root = g.representative(id);
    let arr = mentionsByRoot.get(root);
    if (!arr) mentionsByRoot.set(root, arr = []);
    for (const i of idxs) if (i != null) arr.push(i);
  }
  const degree = /* @__PURE__ */ new Map();
  for (const e of g.edges) {
    if (e.from != null) degree.set(e.from, (degree.get(e.from) || 0) + 1);
    if (e.to != null && e.to !== e.from) degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  const refs = [];
  for (const [root, arr] of mentionsByRoot) {
    if (!arr.length) continue;
    const sorted = [...new Set(arr)].sort((a, b) => a - b);
    const first = sorted[0], last = sorted[sorted.length - 1];
    refs.push({
      id: root, label: g.entities.get(root)?.label ?? root,
      mentions: sorted, count: sorted.length, span: [first, last], spanLen: last - first + 1,
      introFraction: units > 0 ? first / units : 0, connections: degree.get(root) || 0,
    });
  }
  for (const a of refs) {
    const containers = refs.filter((b) => b !== a && strictlyContains(b, a));
    a.containedBy = containers.map((b) => b.id);
    a.containedByCount = containers.length;
    a.parent = containers.length
      ? containers.slice().sort((x, y) =>
          (x.spanLen - y.spanLen) || (y.count - x.count) || (x.id < y.id ? -1 : 1))[0].id
      : null;
  }
  const order = refs.slice().sort((x, y) =>
    (y.spanLen - x.spanLen) || (y.count - x.count) || (x.id < y.id ? -1 : 1));
  const addressOf = /* @__PURE__ */ new Map();
  for (const r of order) {
    const seg = segmentOf(r.id);
    const parentAddr = r.parent ? addressOf.get(r.parent) : null;
    addressOf.set(r.id, parentAddr ? `${parentAddr}.${seg}` : seg);
  }
  for (const r of refs) { r.address = addressOf.get(r.id); r.depth = parseHolon(r.address).depth; }
  refs.sort((a, b) => (a.span[0] - b.span[0]) || (b.count - a.count) || (a.id < b.id ? -1 : 1));
  return { units, referents: refs };
};
var nestingSummary = (nesting) => {
  const refs = nesting.referents;
  const depths = refs.map((r) => r.containedByCount).sort((a, b) => a - b);
  const n = depths.length;
  return {
    referents: n,
    median: n ? depths[Math.floor((n - 1) / 2)] : 0,
    max: n ? depths[n - 1] : 0,
    nestedAtLeast3: refs.filter((r) => r.containedByCount >= 3).length,
    flatDepth1: refs.filter((r) => r.depth === 1).length,
    maxHolonDepth: refs.reduce((m, r) => Math.max(m, r.depth), 0),
  };
};
export {
  DEFAULT_PROJECTION_RULES,
  createParser,
  parseText,
  projectGraph,
  projectionStats,
  referentMap,
  referentNesting,
  nestingSummary,
  segmentClauses
};
