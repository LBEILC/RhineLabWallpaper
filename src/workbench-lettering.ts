import artwork from './workbench-lettering-art.json';
import { escapeHtml } from './html';

/**
 * Fixed phrases keep their authored Novecento artwork. The operator name can be
 * changed from Wallpaper Engine, so any other value stays live text.
 */
export function workbenchLettering(key: keyof typeof artwork, text?: string) {
  const art = artwork[key];
  if (text !== undefined && text !== art.text)
    return `<span class="wb-lettering-custom">${escapeHtml(text)}</span>`;
  return `<span class="wb-lettering"><span class="wb-lettering-text">${art.text}</span><svg aria-hidden="true" focusable="false" viewBox="0 0 ${art.width * art.units} ${art.units}" style="width:${art.width}em"><path fill="currentColor" d="${art.path}"/></svg></span>`;
}
