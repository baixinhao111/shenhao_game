"""Slice a 3x3 icon sheet, remove the white background (rembg), trim, pad square, save webp.

usage: python3 scripts/assets/cut_sheet.py SHEET.png client/public/assets/ui/icons name1,name2,...(9 names, '-' = skip) [size=256]
requires: pip install rembg pillow   (downloads the isnet-general-use model on first run)
"""
import sys, os
from PIL import Image
from rembg import remove, new_session

sheet, outdir, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
size = int(sys.argv[4]) if len(sys.argv) > 4 else 256
os.makedirs(outdir, exist_ok=True)
s = new_session('isnet-general-use')
im = Image.open(sheet).convert('RGB')
W, H = im.size
cw, ch = W // 3, H // 3
for i, name in enumerate(names):
    if not name or name == '-':
        continue
    r, c = divmod(i, 3)
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    cut = remove(cell, session=s)
    # harden faint alpha noise
    a = cut.getchannel('A').point(lambda v: 0 if v < 12 else v)
    cut.putalpha(a)
    bbox = a.getbbox()
    cut = cut.crop(bbox)
    side = int(max(cut.size) * 1.06)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(cut, ((side - cut.width) // 2, (side - cut.height) // 2))
    sq = sq.resize((size, size), Image.LANCZOS)
    sq.save(os.path.join(outdir, name + '.webp'), 'WEBP', quality=90, method=6)
    print('saved', name)
