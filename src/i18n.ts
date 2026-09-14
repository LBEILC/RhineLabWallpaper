import english from "../content/ui.en.json";

export type Language = "zh-CN" | "en-US";
let current: Language = "zh-CN";
export const language = () => current;
export const localeEvent = "rhine-language-change";
const dictionary: Record<string, string> = english;

// Translate only authored literal segments. Interpolated names, tasks and media
// metadata never pass through the dictionary, even if they match a UI label.
export function translateLiteral(source: string): string {
  if (current === "zh-CN") return source;
  return source.replace(/[^<>"\r\n]+/g, part => {
    const key = part.trim();
    return Object.hasOwn(dictionary, key) ? part.replace(key, dictionary[key]) : part;
  });
}
export function tr(source: string | TemplateStringsArray, ...values: unknown[]): string {
  if (typeof source === "string") return translateLiteral(source);
  return source.reduce((result, part, index) => result + translateLiteral(part) + (index < values.length ? String(values[index]) : ""), "");
}

export function setLanguage(value: unknown): boolean {
  // Existing installations stay Chinese; invalid or missing partial updates do
  // not reset a valid choice. The host, not localStorage, owns this setting.
  if (value !== "zh-CN" && value !== "en-US") return false;
  if (value === current) return false;
  current = value;
  document.documentElement.lang = value;
  window.dispatchEvent(new Event(localeEvent));
  return true;
}

// Called once on newly created, authored chrome, before dynamic content is
// inserted. Keep the original strings and mutate text/attributes in place:
// no MutationObserver, DOM replacement, or translation of user content.
export function bindStaticTranslations(root: Element, exclude = ""): () => void {
  const bindings: (() => void)[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (exclude && node.parentElement?.closest(exclude)) continue;
    const source = node.nodeValue ?? "";
    if (/\p{Script=Han}/u.test(source)) bindings.push(() => {
      if (root.contains(node)) node.nodeValue = tr(source);
    });
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (exclude && element.closest(exclude)) continue;
    for (const name of ["aria-label", "title", "placeholder", "alt"]) {
      const source = element.getAttribute(name);
      if (source && /\p{Script=Han}/u.test(source)) bindings.push(() => {
        if (root === element || root.contains(element)) element.setAttribute(name, tr(source));
      });
    }
  }
  const refresh = () => bindings.forEach(update => update());
  refresh();
  window.addEventListener(localeEvent, refresh);
  return () => window.removeEventListener(localeEvent, refresh);
}
