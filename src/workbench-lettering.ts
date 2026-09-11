import artwork from './workbench-lettering-art.json';

/** Fixed phrases only: retain real text for accessibility and archive mode. */
export function workbenchLettering(key: keyof typeof artwork) {
  const art = artwork[key];
  return `<span class="wb-lettering"><span class="wb-lettering-text">${art.text}</span><svg aria-hidden="true" focusable="false" viewBox="0 0 ${art.width * art.units} ${art.units}" style="width:${art.width}em"><path fill="currentColor" d="${art.path}"/></svg></span>`;
}
