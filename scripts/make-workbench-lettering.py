"""Generate fixed workbench phrase artwork and static number comparisons.

Supply the same locally licensed Normal OTF recorded in boot-lettering/sources.json.
No font or reusable glyph table is emitted.
"""
import argparse
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import ImageFont

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', required=True, type=Path)
args = parser.parse_args()
font = TTFont(args.font)
units = font['head'].unitsPerEm
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
layout = ImageFont.truetype(str(args.font), units)

def phrase(text, tracking):
    pen = SVGPathPen(glyphs)
    x = 0
    for i, char in enumerate(text):
        glyphs[cmap[ord(char)]].draw(TransformPen(pen, (1, 0, 0, -1, x, units * .8)))
        advance = layout.getlength(char)
        if i + 1 < len(text):
            advance += layout.getlength(text[i:i+2]) - layout.getlength(char) - layout.getlength(text[i+1]) + tracking * units
        x += advance
    return {'text': text, 'width': x / units, 'units': units, 'path': pen.getCommands()}

fixed = {key: phrase(text, .065) for key, text in {
    'daily': 'RHINE LAB / DAILY TERMINAL',
    'workspace': 'PERSONAL WORKSPACE',
    'session': 'SESSION AUTHORIZED',
    'user': 'JOYCE MOORE',
    'replay': 'REINITIALIZE',
}.items()}
(root / 'src/workbench-lettering-art.json').write_text(json.dumps(fixed, separators=(',', ':')) + '\n')
review = root / 'reference/workbench-typography'
review.mkdir(parents=True, exist_ok=True)
for text in ['08:42', '25:00', '128', '01 / 05']:
    art = phrase(text, -.02)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {art["width"] * units} {units}"><path fill="#161714" d="{art["path"]}"/></svg>'
    (review / (text.replace(':', '-').replace(' / ', '-') + '.svg')).write_text(svg)
(review / 'source.json').write_text(json.dumps({'sha256': hashlib.sha256(args.font.read_bytes()).hexdigest(), 'weight': 'Normal', 'note': 'Fixed comparison samples only; production numeric typography unchanged.'}, indent=2))
