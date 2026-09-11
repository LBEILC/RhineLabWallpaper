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
  // transpileModule preserves the original quote style, so accept both.
  const specs = new Set([...outputText.matchAll(/from\s*["'](\.[^"']+)["']/g)].map(match => match[1]));
  const resolved = new Map();
  for (const spec of specs) {
    const target = resolve(dirname(key), spec);
    resolved.set(spec, target.endsWith(".json")
      ? jsonModuleUrl(target)
      : await moduleUrl(/\.ts$/.test(target) ? target : `${target}.ts`));
  }
  code = code.replace(/(from\s*)(["'])(\.[^"']+)\2/g, (match, prefix, quote, spec) => `${prefix}${quote}${resolved.get(spec)}${quote}`);
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

/* ------------------------------------------------------- workbench text --- */
const { workbenchLettering } = await load("src/workbench-lettering.ts");
const fixed = workbenchLettering("user");
assert.ok(fixed.includes("wb-lettering-text") && fixed.includes("<svg"), "The default name keeps its authored artwork");
assert.ok(!fixed.includes("wb-lettering-custom"));
assert.ok(workbenchLettering("user", "JOYCE MOORE").includes("wb-lettering-text"), "An identical host value also keeps the artwork");
const custom = workbenchLettering("user", "KAL'TSIT <b>&");
assert.ok(custom.startsWith('<span class="wb-lettering-custom">'), "Other names are rendered as live text");
assert.ok(custom.includes("KAL&#39;TSIT &lt;b&gt;&amp;"), "Host text is escaped before it reaches the footer");
assert.ok(!custom.includes("<b>"));
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
