"""Package client/dist-demo into a self-contained artifact folder.
- inlines the JS/CSS bundle into index.html
- converts public/assets images to compact webp and rewrites references
- absolute /assets/ paths -> relative assets/
"""
import os, re, glob, shutil
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'client')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)

# 1) images
renames = {}
for src in glob.glob(f'{ROOT}/public/assets/**/*', recursive=True):
    if os.path.isdir(src):
        continue
    rel = os.path.relpath(src, f'{ROOT}/public')  # assets/...
    base, ext = os.path.splitext(rel)
    dst_rel = base + '.webp'
    dst = os.path.join(OUT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if ext.lower() == '.webp':
        shutil.copy(src, dst)
        continue
    im = Image.open(src)
    has_alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
    im = im.convert('RGBA' if has_alpha else 'RGB')
    limit = 1400 if '/characters/' in rel else 1100 if '/bg/' in rel else 760
    im.thumbnail((limit, limit), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6)
    renames['/' + rel] = dst_rel

# 2) bundle
html = open(f'{ROOT}/dist-demo/index.html').read()
js_path = glob.glob(f'{ROOT}/dist-demo/build/*.js')[0]
css_path = glob.glob(f'{ROOT}/dist-demo/build/*.css')[0]
js = open(js_path).read()
css = open(css_path).read()

def fix(text):
    for old, new in renames.items():
        text = text.replace(old, new)
    # any remaining absolute asset refs (already-webp ui icons etc.)
    text = re.sub(r'(?<![\w.])/assets/', 'assets/', text)
    return text

js = fix(js).replace('</script', '<\\/script')
css = fix(css)

fonts = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Oswald:wght@500;600&display=swap" rel="stylesheet">'
)
page_css = ':root{color-scheme:dark;background:#05070f}html,body{height:100%;background:#05070f;color:#f4efe4}'
html = (
    '<meta charset="utf-8">\n<title>天枢神豪 试玩</title>\n'
    '<meta name="theme-color" content="#0A0F1F">\n'
    + fonts + '\n'
    + f'<style>{page_css}{css}</style>\n'
    + '<div id="root"></div>\n'
    + f'<script type="module">{js}</script>\n'
)
open(os.path.join(OUT, 'index.html'), 'w').write(html)

total = sum(os.path.getsize(f) for f in glob.glob(f'{OUT}/**/*', recursive=True) if os.path.isfile(f))
files = [f for f in glob.glob(f'{OUT}/**/*', recursive=True) if os.path.isfile(f)]
print('files', len(files), 'total MB', round(total / 1e6, 2), 'html KB', os.path.getsize(f'{OUT}/index.html') // 1024)
leftover = re.findall(r'["\'(]/assets/[^"\')]+', html)
print('leftover abs refs', leftover[:5])
