"""Audit: every translation key used in the theme exists in both locale files; both locales have the same keys; no empty values."""
import re, json, glob, sys
R = '/home/user/Kulinaria-MX/'
def load(f):
    t = open(R + f, encoding='utf8').read()
    t = re.sub(r'^\s*/\*.*?\*/', '', t, flags=re.S)
    return json.loads(t)
es, en = load('locales/es.default.json'), load('locales/en.json')
def flat(d, p=''):
    o = {}
    for k, v in d.items():
        if isinstance(v, dict): o.update(flat(v, p + k + '.'))
        else: o[p + k] = v
    return o
fe, fn = flat(es), flat(en)
used = {}
for f in glob.glob(R + '{sections,snippets,layout,templates}/**/*.liquid', recursive=True) + glob.glob(R + 'sections/*.liquid') + glob.glob(R + 'snippets/*.liquid') + glob.glob(R + 'layout/*.liquid'):
    t = open(f, encoding='utf8').read()
    for m in re.finditer(r"'([a-z0-9_]+\.[a-z0-9_.]+)'\s*\|\s*t\b", t):
        used.setdefault(m.group(1), set()).add(f.replace(R, ''))
missing_es = sorted(k for k in used if k not in fe)
missing_en = sorted(k for k in used if k not in fn)
only_es = sorted(set(fe) - set(fn)); only_en = sorted(set(fn) - set(fe))
empty = sorted(k for k, v in list(fe.items()) + list(fn.items()) if isinstance(v, str) and not v.strip())
print('keys used:', len(used), '| es keys:', len(fe), '| en keys:', len(fn))
print('MISSING in es:', len(missing_es)); [print('  ', k, sorted(used[k])[:2]) for k in missing_es[:40]]
print('MISSING in en:', len(missing_en)); [print('  ', k) for k in missing_en[:40]]
print('only in es:', len(only_es)); [print('  ', k) for k in only_es[:30]]
print('only in en:', len(only_en)); [print('  ', k) for k in only_en[:30]]
print('empty values:', len(empty)); [print('  ', k) for k in empty[:20]]
