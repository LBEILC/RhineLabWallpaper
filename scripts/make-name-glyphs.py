"""Export outlined Latin glyph artwork so host-provided names can use the same
design typeface as the authored opening phrases.

The opening identity line and the workbench footer were fixed phrases before;
the operator name is host data, so arbitrary Latin letters must be drawable
without shipping the font. This script outlines one graphic per character with
fontTools and writes paths only: no font binaries, no glyph name or metrics
tables, and no kerning/GPOS data. Non-Latin characters stay live text at
runtime, which is why the CJK set is not exported.

Requires fonttools. Supply the same locally licensed Normal OTF recorded in
verification/boot-lettering/sources.json:

  python scripts/make-name-glyphs.py --font path/to/Novecentosanswide-Normal.otf
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/font-comparison/python'))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

WEIGHT = 'Normal'
SOURCES = ROOT / 'verification/boot-lettering/sources.json'

# Printable ASCII covers names, digits and punctuation. Latin-1 letters add the
# common accented names; the trailing marks are the ones names actually use.
CODEPOINTS = (
    list(range(0x20, 0x7F))
    + [c for c in range(0xC0, 0x100) if c not in (0xD7, 0xF7)]
    + [0xB0, 0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', required=True, type=Path)
    args = parser.parse_args()

    tracked = json.loads(SOURCES.read_text(encoding='utf-8'))[WEIGHT]
    digest = hashlib.sha256(args.font.read_bytes()).hexdigest()
    if digest != tracked['sha256']:
        raise SystemExit(
            f'{args.font.name} sha256 {digest} does not match the recorded '
            f"{WEIGHT} source {tracked['sha256']}; refusing to outline a different font."
        )

    font = TTFont(args.font)
    units = font['head'].unitsPerEm
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    letters = {}
    for codepoint in CODEPOINTS:
        if codepoint not in cmap:
            continue
        glyph_name = cmap[codepoint]
        pen = SVGPathPen(glyphs)
        # A fixed graphic cell, with its baseline 0.8 em from the top: the same
        # frame the authored phrases use.
        glyphs[glyph_name].draw(TransformPen(pen, (1, 0, 0, -1, 0, units * .8)))
        letters[chr(codepoint)] = {
            'width': round(hmtx[glyph_name][0] / units, 6),
            'path': pen.getCommands(),
        }
    font.close()

    art = {'weight': WEIGHT, 'units': units, 'letters': letters}
    target = ROOT / 'src/name-glyph-art.json'
    target.write_text(json.dumps(art, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    record = {
        'filename': args.font.name,
        'sha256': digest,
        'weight': WEIGHT,
        'units': units,
        'characters': len(letters),
        'note': 'Outlined graphics only. No font binary, glyph names, metrics or kerning tables are emitted.',
    }
    (ROOT / 'verification/boot-lettering/name-glyphs.json').write_text(
        json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(f'{len(letters)} outlined characters: {target.stat().st_size} bytes. No font files emitted.')


if __name__ == '__main__':
    main()
