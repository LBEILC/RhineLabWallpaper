import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Tiny loader for the project's TypeScript modules: transpile, then point every
// relative import at another data URL so the whole graph can be evaluated here.
const cache = new Map();
function jsonModuleUrl(file) {
  return `data:text/javascript;base64,${Buffer.from(`export default ${readFileSync(file, "utf8")}`).toString("base64")}`;
}
async function moduleUrl(file) {
  const key = resolve(file);
  if (cache.has(key)) return cache.get(key);
  const { outputText } = ts.transpileModule(readFileSync(key, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  let code = outputText;
  // transpileModule preserves the original quote style, so accept both, and
  // rewrite side-effect imports (`import "./x.css"`) as well as `from` clauses.
  const specs = new Set([...outputText.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)].map(match => match[1]));
  const resolved = new Map();
  for (const spec of specs) {
    const target = resolve(dirname(key), spec);
    resolved.set(spec, target.endsWith(".json")
      ? jsonModuleUrl(target)
      : target.endsWith(".css")
        ? `data:text/javascript,export default undefined`
        : await moduleUrl(/\.ts$/.test(target) ? target : `${target}.ts`));
  }
  code = code.replace(/((?:from|import)\s*)(["'])(\.[^"']+)\2/g, (match, prefix, quote, spec) => `${prefix}${quote}${resolved.get(spec)}${quote}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  cache.set(key, url);
  return url;
}
const load = async file => import(await moduleUrl(file));

/* ---------------------------------------------------------------- name --- */
const session = await load("src/session.ts");
assert.equal(session.sessionName(), "JOYCE MOORE", "Default identity keeps the shipped name");
assert.equal(session.normalizeSessionName(undefined), "JOYCE MOORE");
assert.equal(session.normalizeSessionName(null), "JOYCE MOORE");
assert.equal(session.normalizeSessionName(42), "JOYCE MOORE");
assert.equal(session.normalizeSessionName("   "), "JOYCE MOORE", "An empty host value falls back, never blanks the slot");
assert.equal(session.normalizeSessionName("\n\t\u0000 "), "JOYCE MOORE");
assert.equal(session.normalizeSessionName("  Kal'tsit \n\t Saria "), "Kal'tsit Saria", "Control characters and runs of spaces collapse");
assert.equal(session.normalizeSessionName("a".repeat(40)), "a".repeat(session.sessionNameLimit));
assert.equal(Array.from(session.normalizeSessionName("🎛".repeat(30))).length, 24, "The limit counts code points, not UTF-16 units");
session.setSessionName("KAL'TSIT");
assert.equal(session.sessionName(), "KAL'TSIT");
assert.equal(session.isDefaultSessionName(), false);
session.setSessionName("");
assert.equal(session.sessionName(), "JOYCE MOORE");
assert.equal(session.isDefaultSessionName(), true);

/* ---------------------------------------------------- glyph artwork --- */
const glyphArt = JSON.parse(readFileSync("src/name-glyph-art.json", "utf8"));
assert.equal(glyphArt.units, 1000);
assert.equal(glyphArt.weight, "Normal", "Names use the same weight as the authored phrases");
for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;'\"-–—/()&+!?@#%*·’‘“”…éüñ") {
  assert.ok(glyphArt.letters[char], `${char} is exported as outlined artwork`);
}
assert.ok(!glyphArt.letters["赫"] && !glyphArt.letters["あ"], "CJK stays live text instead of being exported");
const bootArt = JSON.parse(readFileSync("src/boot-lettering-art.json", "utf8"));
bootArt.identity.text.split("").forEach((char, i) => {
  assert.equal(glyphArt.letters[char].path, bootArt.identity.letters[i].path, `${char} reuses the authored phrase outline`);
  assert.equal(glyphArt.letters[char].width, bootArt.identity.letters[i].width, `${char} keeps the authored advance width`);
});
const nameRecord = JSON.parse(readFileSync("verification/boot-lettering/name-glyphs.json", "utf8"));
const bootSources = JSON.parse(readFileSync("verification/boot-lettering/sources.json", "utf8"));
assert.equal(nameRecord.sha256, bootSources.Normal.sha256, "The glyph artwork records the licensed Normal source");
assert.equal(nameRecord.characters, Object.keys(glyphArt.letters).length);

/* ------------------------------------------------------- workbench text --- */
const { workbenchLettering } = await load("src/workbench-lettering.ts");
const fixed = workbenchLettering("user");
assert.ok(fixed.includes("wb-lettering-text") && fixed.includes("<svg"), "The default name keeps its authored artwork");
assert.ok(workbenchLettering("user", "JOYCE MOORE").includes("wb-lettering-text"), "An identical host value also keeps the artwork");
const latinName = workbenchLettering("user", "KAL'TSIT");
assert.ok(latinName.includes('class="wb-lettering"><span class="wb-lettering-text">KAL&#39;TSIT</span>'), "Latin names keep the artwork markup and escape host text");
assert.ok(latinName.includes('class="wb-name-art"') && latinName.includes('<g transform="translate('), "Latin names are drawn from the outlined glyphs");
assert.ok(!latinName.includes("wb-name-live"), "Latin names need no live text");
const cjkName = workbenchLettering("user", "赫默");
assert.equal(cjkName, '<span class="wb-name-live">赫默</span>', "A Chinese name stays live text in the page font");
const mixedName = workbenchLettering("user", "赫默 <b>A");
assert.ok(mixedName.indexOf("wb-name-live") < mixedName.indexOf("wb-name-art"), "Runs keep the typed order");
assert.ok(mixedName.includes("&lt;b&gt;"), "Host text is escaped before it reaches the footer");
assert.ok(!mixedName.includes("<b>"));
for (const key of ["session", "replay"]) assert.ok(workbenchLettering(key).includes("<svg"), `${key} stays a fixed phrase`);

/* ------------------------------------------------------------ opening --- */
const { bootMotion } = await load("src/boot-motion.ts");
const authAt = name => {
  session.setSessionName(name);
  return bootMotion(8.6).auth; // frame 340: the identity name has finished typing
};
assert.equal(authAt("JOYCE MOORE"), "ID CONFIRMED : JOYCE MOORE");
assert.equal(authAt("KAL'TSIT"), "ID CONFIRMED : KAL'TSIT");
assert.equal(authAt("赫默"), "ID CONFIRMED : 赫默");
const longName = "A".repeat(24);
assert.equal(authAt(longName), `ID CONFIRMED : ${longName}`, "A long name still finishes inside the original window");
session.setSessionName("KAL'TSIT");
assert.equal(bootMotion(5.9).auth, "", "Typing still starts empty before its frame window");
assert.ok(bootMotion(8.6).auth.length > bootMotion(8.4).auth.length, "The reveal stays progressive");
session.setSessionName("JOYCE MOORE");
assert.equal(bootMotion(8.6).auth, "ID CONFIRMED : JOYCE MOORE", "Restoring the default keeps the original phrase");

/* ------------------------------------------------- opening lettering --- */
// Minimal element stub: enough for BootLettering's own DOM surface.
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.hidden = false;
    this._classes = new Set();
    this._text = "";
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.classList = {
      add: name => { this._classes.add(name); },
      toggle: (name, on) => { if (on) this._classes.add(name); else this._classes.delete(name); },
      contains: name => this._classes.has(name),
    };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  set textContent(value) { this._text = value; }
  get textContent() { return this._text; }
}
globalThis.document = { createElement: tag => new FakeNode(tag), createElementNS: (namespace, tag) => new FakeNode(tag) };
const { BootLettering } = await load("src/boot-lettering.ts");
const readLettering = host => {
  const label = host.children[0];
  const shown = host.children.slice(1).filter(node => !node.hidden);
  const phrase = shown[0];
  const tail = phrase?.children.find(child => child.className === "boot-phrase-tail");
  const parts = tail && !tail.hidden ? tail.children : [];
  return {
    fallback: host.classList.contains("boot-lettering-fallback"),
    phrase: phrase?.dataset.phrase ?? null,
    letters: phrase ? phrase.children.filter(child => child.className === "boot-phrase-letter" && !child.hidden).length : 0,
    // Tail characters drawn as outlined cells, and the rest as live text.
    outlined: parts.filter(child => child.className.includes("boot-name-glyph")).length,
    outlinedWidths: parts.filter(child => child.className.includes("boot-name-glyph")).map(child => child.style.width),
    live: parts.filter(child => child.className === "boot-phrase-live").map(child => child.textContent).join(""),
    label: label.textContent,
  };
};
const host = new FakeNode("span");
const lettering = new BootLettering(host, ["identity", "request"]);
// Expected cell widths come from the glyph artwork itself, never from a guess.
const widthsFor = text => Array.from(text, char => `${glyphArt.letters[char].width}em`);
lettering.setText("ID CONFIRMED");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 12, outlined: 0, outlinedWidths: [], live: "", label: "ID CONFIRMED" });
lettering.setText("ID CONFIRMED : ");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 15, outlined: 0, outlinedWidths: [], live: "", label: "ID CONFIRMED : " }, "The authored prefix is revealed letter by letter");
lettering.setText("ID CONFIRMED : JOYCE MOORE");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 26, outlined: 0, outlinedWidths: [], live: "", label: "ID CONFIRMED : JOYCE MOORE" }, "The default name keeps the outlined artwork end to end");
lettering.setText("ID CONFIRMED : JOY");
assert.equal(readLettering(host).outlined, 0, "A partial default name still reveals artwork letters");
lettering.setText("ID CONFIRMED : KAL'TSIT");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 15, outlined: 8, outlinedWidths: widthsFor("KAL'TSIT"), live: "", label: "ID CONFIRMED : KAL'TSIT" }, "Every English letter is drawn from the outlined glyph set");
lettering.setText("ID CONFIRMED : Dr. Kal'tsit");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 15, outlined: 12, outlinedWidths: widthsFor("Dr. Kal'tsit"), live: "", label: "ID CONFIRMED : Dr. Kal'tsit" }, "Mixed case and punctuation keep their outlined text");
lettering.setText("ID CONFIRMED : 赫默");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 15, outlined: 0, outlinedWidths: [], live: "赫默", label: "ID CONFIRMED : 赫默" }, "A Chinese name keeps the outlined prefix and stays live text");
lettering.setText("ID CONFIRMED : 赫默 KAL'TSIT");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "identity", letters: 15, outlined: 9, outlinedWidths: widthsFor(" KAL'TSIT"), live: "赫默", label: "ID CONFIRMED : 赫默 KAL'TSIT" }, "A mixed name draws the Latin run and keeps the rest as text");
lettering.setText("ID CONFIRMED : 赫默");
lettering.setText("ID CONFIRMED : ");
assert.equal(readLettering(host).live, "", "Clearing the name removes the tail again");
assert.equal(readLettering(host).outlined, 0);
lettering.setText("REQUEST RECEIVED");
assert.deepEqual(readLettering(host), { fallback: false, phrase: "request", letters: 16, outlined: 0, outlinedWidths: [], live: "", label: "REQUEST RECEIVED" }, "Other authored phrases are unaffected");
lettering.setText("UNKNOWN PHRASE");
assert.deepEqual(readLettering(host), { fallback: true, phrase: null, letters: 0, outlined: 0, outlinedWidths: [], live: "", label: "UNKNOWN PHRASE" }, "Text outside every phrase still uses the readable fallback");
assert.ok(!host.children[2].children.some(child => child.className === "boot-phrase-tail"), "Only the identity phrase carries a host tail");

/* --------------------------------------------------------- auto theme --- */
const auto = await load("src/auto-theme.ts");
const at = (hour, minute) => new Date(2026, 8, 11, hour, minute, 0);
const nightly = { ...auto.defaultAutoTheme, enabled: true }; // dark 19:00 → light 07:00
assert.equal(auto.autoThemeTarget(auto.defaultAutoTheme, at(20, 0)), null, "Disabled keeps the manual choice");
assert.equal(auto.autoThemeTarget(nightly, at(18, 59)), "light");
assert.equal(auto.autoThemeTarget(nightly, at(19, 0)), "dark", "The dark boundary is inclusive");
assert.equal(auto.autoThemeTarget(nightly, at(23, 59)), "dark");
assert.equal(auto.autoThemeTarget(nightly, at(0, 0)), "dark", "The window wraps past midnight");
assert.equal(auto.autoThemeTarget(nightly, at(6, 59)), "dark");
assert.equal(auto.autoThemeTarget(nightly, at(7, 0)), "light", "The light boundary is inclusive");
const daytime = { enabled: true, darkHour: 12, darkMinute: 30, lightHour: 14, lightMinute: 45 };
assert.equal(auto.autoThemeTarget(daytime, at(12, 29)), "light");
assert.equal(auto.autoThemeTarget(daytime, at(12, 30)), "dark", "A same-day window works too");
assert.equal(auto.autoThemeTarget(daytime, at(14, 44)), "dark");
assert.equal(auto.autoThemeTarget(daytime, at(14, 45)), "light");
assert.equal(auto.autoThemeTarget({ enabled: true, darkHour: 8, darkMinute: 15, lightHour: 8, lightMinute: 15 }, at(8, 15)), null, "Equal times keep the manual choice");
assert.deepEqual(auto.autoThemeFromProperties({}), auto.defaultAutoTheme);
assert.deepEqual(
  auto.autoThemeFromProperties({ autotheme: { value: true }, darkstarthour: { value: 21 }, darkstartminute: { value: 30 }, lightstarthour: { value: 6 }, lightstartminute: { value: 15 } }),
  { enabled: true, darkHour: 21, darkMinute: 30, lightHour: 6, lightMinute: 15 },
);
assert.equal(auto.autoThemeFromProperties({ autotheme: { value: "true" } }).enabled, false, "Only a real host bool enables the schedule");
assert.deepEqual(
  auto.autoThemeFromProperties({ darkstarthour: { value: 99 }, darkstartminute: { value: -4 }, lightstarthour: { value: NaN }, lightstartminute: { value: "30" } }),
  { enabled: false, darkHour: 23, darkMinute: 0, lightHour: 7, lightMinute: 30 },
  "Out-of-range and malformed values clamp or fall back to the documented defaults",
);
assert.deepEqual(auto.autoThemeFromProperties({ sessionname: { value: "x" } }), auto.defaultAutoTheme, "Unrelated properties cannot reset the schedule");
assert.equal(auto.autoThemeSchedule({ enabled: true, darkHour: 19, darkMinute: 0, lightHour: 7, lightMinute: 5 }), "暗色 19:00 / 亮色 07:05");

/* ------------------------------------------------------------ host UI --- */
const project = JSON.parse(readFileSync("wallpaper/project.json", "utf8"));
const properties = project.general.properties;
assert.equal(properties.sessionname.type, "textinput");
assert.equal(properties.sessionname.value, "JOYCE MOORE", "The shipped default is unchanged");
assert.equal(properties.groupidentity.type, "group");
assert.equal(properties.autotheme.type, "bool");
assert.equal(properties.autotheme.value, false, "Scheduled switching is opt-in");
assert.equal(properties.darkstarthour.value, 19);
assert.equal(properties.lightstarthour.value, 7);
for (const key of ["darkstarthour", "darkstartminute", "lightstarthour", "lightstartminute"]) {
  assert.equal(properties[key].type, "slider");
  assert.equal(properties[key].condition, "autotheme.value == true", `${key} is hidden while the schedule is off`);
}
assert.equal(properties.darkstartminute.value, 0);
assert.equal(properties.lightstartminute.value, 0);
const orders = Object.values(properties).map(entry => entry.order);
assert.equal(new Set(orders).size, orders.length, "Every property keeps a unique order");
assert.ok(properties.darkstarthour.order > properties.colortheme.order && properties.lightstartminute.order < properties.groupworkbench.order, "Schedule controls live inside the opening group");

console.log("Login name normalization, footer/opening text, schedule boundaries, host fallbacks and property schema passed.");
