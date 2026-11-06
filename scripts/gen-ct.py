# Rebuilds the "ct" translation block of locales/es.default.json and locales/en.json from scripts/render/content.en.json (Spanish text -> English).
# Run after adding a text to content.en.json:  python3 scripts/gen-ct.py
import json, re, hashlib, glob
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
def rd(f): return open(R + f, encoding='utf8').read()
def split_head(t):
    m = re.match(r'^\s*/\*.*?\*/\s*', t, re.S); return (m.group(0) if m else ''), t[len(m.group(0)) if m else 0:]
def key(s): return hashlib.md5(s.strip().encode('utf8')).hexdigest()[:12]

dic = json.loads(rd('scripts/render/content.en.json'))
# every string that can be printed from a template / schema default must be in the dictionary
src = set()
def walk(n, out):
    if isinstance(n, dict):
        for k, v in n.items():
            if k in ('type', 'art', 'slug', 'tier', 'collection', 'layout', 'columns', 'background', 'link', 'button_link', 'button2_link', 'parent_link', 'next_url', 'image', 'panel') or k.endswith('_link') or k.endswith('_url'): continue
            walk(v, out)
    elif isinstance(n, list):
        for v in n: walk(v, out)
    elif isinstance(n, str) and re.search(r'[A-Za-zÁ-ú]{3,}', n) and not re.match(r'^(https?:|/|#|shopify://)', n): out.add(n)
for f in glob.glob(R + 'templates/**/*.json', recursive=True) + glob.glob(R + 'sections/*.json'):
    h, body = split_head(open(f, encoding='utf8').read()); walk(json.loads(body), src)
missing = sorted(s for s in src if s not in dic and s.strip() not in {k.strip() for k in dic})
print('template strings', len(src), 'in dictionary', len(src) - len(missing), 'missing', len(missing))


es_ct, en_ct = {}, {}
for es, en in dic.items():
    k = key(es)
    if k in es_ct and es_ct[k] != es.strip(): print('COLLISION', k)
    es_ct[k] = es.strip(); en_ct[k] = en.strip() if isinstance(en, str) else en
for lg, f, ct in (('es', 'locales/es.default.json', es_ct), ('en', 'locales/en.json', en_ct)):
    head, body = split_head(rd(f)); o = json.loads(body); o['ct'] = ct
    open(R + f, 'w', encoding='utf8').write(head + json.dumps(o, ensure_ascii=False, indent=2) + '\n')
print('ct keys', len(es_ct))
