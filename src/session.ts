// Session identity: the operator name carried by the terminal.
// The default keeps the authored Novecento phrase artwork ("JOYCE MOORE");
// a host-provided name is rendered as live text instead.
export const defaultSessionName = "JOYCE MOORE";
/** Longer names would overflow the single-line identity and footer slots. */
export const sessionNameLimit = 24;

/** Host input is a single short line: strip control characters and collapse spaces. */
export function normalizeSessionName(value: unknown): string {
  if (typeof value !== "string") return defaultSessionName;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return defaultSessionName;
  // Count code points so a limit never splits a surrogate pair or emoji.
  return Array.from(cleaned).slice(0, sessionNameLimit).join("");
}

let current = defaultSessionName;

export function setSessionName(value: unknown) {
  current = normalizeSessionName(value);
}

export function sessionName() {
  return current;
}

/** True while the shipped phrase artwork still matches the displayed name. */
export function isDefaultSessionName() {
  return current === defaultSessionName;
}
