#!/usr/bin/env python3
"""Format adapter: extract_dag.mjs --json output -> populated tools/dag/view.html copy.

Maps the extractor's JSON shape onto the DATA contract the viewer reads:
  asserted.complexities.{confounding,reverse,mechanism,construct} -> asserted.{...}
  edge.strongestProposed -> edge.strongest
  claim.src.{docId,sentIdx,span,text} flattened into the claim, readerConfidence -> rc
  corpus := {sources, disagreements, distinguishing}

usage: python3 dag_view_adapt.py dag.json view-template.html out.html [title]
"""
import json, sys, re

dag_path, tpl_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
title = sys.argv[4] if len(sys.argv) > 4 else None

d = json.load(open(dag_path))
a = d['asserted']

edges = []
for e in a['edges']:
    claims = []
    for c in e['claims']:
        src = c.get('src', {})
        claims.append({
            'stance': c.get('stance'), 'marker': c.get('marker'),
            'polarity': c.get('polarity'), 'modality': c.get('modality'),
            'rc': c.get('readerConfidence'), 'effectSign': c.get('effectSign'),
            'docId': src.get('docId'), 'sentIdx': src.get('sentIdx'),
            'span': src.get('span') or [0, 0], 'text': src.get('text') or '',
        })
    edges.append({
        'from': e['from'], 'to': e['to'], 'stanceTally': e['stanceTally'],
        'strongest': e.get('strongestProposed') or e.get('strongest'),
        'sources': e['sources'], 'contested': e['contested'],
        'polarity': e['polarity'], 'claims': claims,
    })

cx = a.get('complexities', {})
data = {
    'asserted': {
        'nodes': [{'key': n['key'], 'labels': n['labels'], 'sources': n['sources']} for n in a['nodes']],
        'edges': edges,
        'confounding': cx.get('confounding', []),
        'mechanism': cx.get('mechanism', []),
        'reverse': cx.get('reverse', []),
        'construct': cx.get('construct', []),
    },
    'corpus': {
        'sources': a.get('sources', []),
        'disagreements': d.get('corpus', {}).get('disagreements', []),
        'distinguishing': d.get('distinguishing', []),
    },
    'sourceText': {},
    'discourse': {
        'sentenceNodes': d.get('discourse', {}).get('sentenceNodes', []),
        'discourseLinks': d.get('discourse', {}).get('discourseLinks', []),
    },
}

tpl = open(tpl_path, encoding='utf-8').read()
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
new = re.sub(r'(<script id="data" type="application/json">).*?(</script>)',
             lambda m: m.group(1) + payload + m.group(2), tpl, count=1, flags=re.S)
if title:
    new = new.replace('<title>', f'<title>{title} · ', 1) if '<title>' in new else new
open(out_path, 'w', encoding='utf-8').write(new)
print(f'wrote {out_path}: {len(edges)} edges, {len(data["asserted"]["nodes"])} nodes')
