"""Turn a recorded playthrough (scripts/demo/record.js output) into client/src/demo/demoData.json.

usage: node scripts/demo/record.js /tmp/rec.json   (server running on :3080)
       python3 scripts/demo/build_demo_data.py /tmp/rec.json
Story volumes are stored once and stripped from every recorded state to keep the bundle small.
"""
import json, os, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'client', 'src', 'demo', 'demoData.json')
d = json.load(open(src))
vols = d['initial']['stories']['volumes']

def strip(st):
    st = json.loads(json.dumps(st))
    st['stories'].pop('volumes', None)
    return st

data = {'volumes': vols, 'initial': strip(d['initial']), 'steps': {}, 'extras': d['extras']}
for k, v in d['steps'].items():
    v = dict(v)
    v['state'] = strip(v['state'])
    data['steps'][k] = v
s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open(out, 'w').write(s)
print('wrote', out, len(s.encode()) // 1024, 'KB')
