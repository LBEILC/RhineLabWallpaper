import artwork from './workbench-lettering-art.json';
import { escapeHtml } from './html';
import { nameGlyph, nameGlyphUnits, nameRuns } from './name-glyphs';

/** Tracking baked into the authored workbench phrases. */
const nameTracking = 0.065;

/**
 * Fixed phrases keep their authored Novecento artwork. The operator name can be
 * changed from Wallpaper Engine, so Latin characters are drawn from the shipped
 * glyph artwork and anything else stays live text in the page font.
 */
export function workbenchLettering(key: keyof typeof artwork, text?: string) {
  const art = artwork[key];
  if (text !== undefined && text !== art.text) return nameLettering(text);
  return `<span class="wb-lettering"><span class="wb-lettering-text">${art.text}</span><svg aria-hidden="true" focusable="false" viewBox="0 0 ${art.width * art.units} ${art.units}" style="width:${art.width}em"><path fill="currentColor" d="${art.path}"/></svg></span>`;
}

function nameArtwork(text: string) {
  const glyphs: string[] = [];
  let x = 0,
    index = 0;
  for (const char of text) {
    const glyph = nameGlyph(char);
    if (!glyph) continue;
    if (index++) x += nameTracking;
    if (glyph.path)
      // currentColor keeps the name on the theme ink instead of SVG black.
      glyphs.push(`<g transform="translate(${(x * nameGlyphUnits).toFixed(2)} 0)" fill="currentColor"><path d="${glyph.path}"/></g>`);
    x += glyph.width;
  }
  if (!glyphs.length) return "";
  return `<svg class="wb-name-art" aria-hidden="true" focusable="false" viewBox="0 0 ${(x * nameGlyphUnits).toFixed(2)} ${nameGlyphUnits}" style="width:${x}em">${glyphs.join("")}</svg>`;
}

function nameLettering(name: string) {
  return nameRuns(name)
    .map((run) => {
      const text = escapeHtml(run.text);
      const svg = run.artwork ? nameArtwork(run.text) : "";
      // A run without drawable outlines (spaces only) stays visible text.
      return svg
        ? `<span class="wb-lettering"><span class="wb-lettering-text">${text}</span>${svg}</span>`
        : `<span class="wb-name-live">${text}</span>`;
    })
    .join("");
}
