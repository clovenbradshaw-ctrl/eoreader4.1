#!/usr/bin/env python3
"""Format adapter: corpus slice jsonl -> flow-tool jsonl ({id,title,text}+facets).

- normalizes CRLF -> LF
- federalregister docs: extracts the text inside the single <pre>...</pre> block
  and unescapes HTML entities (the corpus stores the raw .txt endpoint output,
  which is HTML-wrapped)
- deterministic 80/20 distill/held-out split keyed on the doc's content hash
  (falls back to id) so no document ever appears in both sets

usage: python3 tools/flow/corpus_adapt.py corpus/<slice>.jsonl outdir/
writes outdir/<slice>.jsonl, outdir/<slice>.distill.jsonl, outdir/<slice>.heldout.jsonl
"""
import json, sys, re, html, hashlib, os

src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
base = os.path.basename(src).replace('corpus-', '').replace('.jsonl', '')

PRE = re.compile(r'<pre>(.*?)</pre>', re.S)

def clean(d):
    t = d['text'].replace('\r\n', '\n').replace('\r', '\n')
    if d.get('source') == 'federalregister':
        m = PRE.search(t)
        if m:
            t = html.unescape(m.group(1))
    return t

def held(d):
    key = d.get('hash') or d.get('id') or ''
    h = int(hashlib.sha1(str(key).encode()).hexdigest()[:8], 16)
    return (h % 10) < 2   # 20% held out

n = {'all': 0, 'distill': 0, 'heldout': 0}
with open(src) as fh, \
     open(f'{outdir}/{base}.jsonl', 'w') as fa, \
     open(f'{outdir}/{base}.distill.jsonl', 'w') as fd, \
     open(f'{outdir}/{base}.heldout.jsonl', 'w') as fo:
    for line in fh:
        d = json.loads(line)
        rec = {'id': d['id'], 'title': d.get('title') or d['id'], 'text': clean(d),
               'lang': d.get('lang'), 'region': d.get('region'), 'era': d.get('era'),
               'domain': d.get('domain'), 'register': d.get('register')}
        s = json.dumps(rec, ensure_ascii=False) + '\n'
        fa.write(s); n['all'] += 1
        if held(d): fo.write(s); n['heldout'] += 1
        else:       fd.write(s); n['distill'] += 1
print(f'{base}: {n["all"]} docs -> {n["distill"]} distill / {n["heldout"]} heldout')
