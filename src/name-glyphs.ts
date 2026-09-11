// Operator names are host data, so the Latin characters are shipped as outlined
// graphics (scripts/make-name-glyphs.py) instead of a font binary. Characters
// outside that set stay live text in the page font.
import art from "./name-glyph-art.json";

export type NameGlyph = { width: number; path: string };
export type NameRun = { artwork: boolean; text: string };

const letters = art.letters as Record<string, NameGlyph | undefined>;
export const nameGlyphUnits = art.units;

export function nameGlyph(char: string): NameGlyph | undefined {
  return letters[char];
}

/** Consecutive characters that share one drawing or one live text run. */
export function nameRuns(value: string): NameRun[] {
  const runs: NameRun[] = [];
  for (const char of value) {
    const artwork = Boolean(letters[char]);
    const previous = runs[runs.length - 1];
    if (previous && previous.artwork === artwork) previous.text += char;
    else runs.push({ artwork, text: char });
  }
  return runs;
}

export function nameRunWidth(text: string) {
  let width = 0;
  for (const char of text) width += letters[char]?.width ?? 0;
  return width;
}
