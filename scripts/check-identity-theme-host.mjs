// Real Wallpaper Engine host check for the login name and the scheduled
// light/dark switch. The built wallpaper is copied to a scratch project whose
// defaults enable the schedule, a probe is injected into index.html, and the
// host window reports back over loopback. The probe also replays host property
// callbacks, so live renaming and boundary crossings are covered without
// waiting for a real clock boundary.
//
//   node scripts/check-identity-theme-host.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const exe = "D:/Game/Steam/steamapps/common/wallpaper_engine/wallpaper64.exe";
const dir = resolve("verification/identity-theme/host");
const port = 5186;

const wrap = value => ((value % 1440) + 1440) % 1440;
const clock = minutes => ({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
const nowMinutes = () => { const date = new Date(); return date.getHours() * 60 + date.getMinutes(); };
// A ±60 minute window around the current local time is unambiguous even when it
// crosses midnight, so the expected decision does not depend on the run hour.
const darkWindow = { dark: clock(wrap(nowMinutes() - 60)), light: clock(wrap(nowMinutes() + 60)) };

await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
await cp("release/wallpaper", dir, { recursive: true });
const project = JSON.parse(await readFile(`${dir}/project.json`, "utf8"));
delete project.workshopid;
delete project.workshopurl;
const properties = project.general.properties;
properties.boot.value = false;                 // the archive surface carries the footer
properties.load3donstartup.value = false;      // no WebGL: the theme surface is immediate
properties.colortheme.value = "light";         // manual value the schedule must override
properties.sessionname.value = "KAL'TSIT";
properties.autotheme.value = true;
properties.darkstarthour.value = darkWindow.dark.hour;
properties.darkstartminute.value = darkWindow.dark.minute;
properties.lightstarthour.value = darkWindow.light.hour;
properties.lightstartminute.value = darkWindow.light.minute;
await writeFile(`${dir}/project.json`, JSON.stringify(project));

const probe = `<script>
const results = {};
const readName = () => {
  const host = document.querySelector('#session-name');
  return { text: host.textContent.trim(), live: host.querySelector('.wb-lettering-custom') !== null, artwork: host.querySelector('.wb-lettering svg') !== null };
};
const dark = () => document.documentElement.dataset.darkSurface === 'true';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const push = values => window.wallpaperPropertyListener.applyUserProperties(values);
// App time 8.75 s is frame 344: the identity name has finished typing and the
// line has not yet moved on to REQUEST RECEIVED.
const opening = async () => {
  window.rhine.seek(8.75);
  await wait(120);
  const auth = document.querySelector('#auth-message');
  const phrase = auth.querySelector('.boot-phrase:not([hidden])');
  const state = {
    text: auth.textContent,
    fallback: auth.classList.contains('boot-lettering-fallback'),
    phrase: phrase ? phrase.dataset.phrase : null,
    letters: phrase ? phrase.querySelectorAll('.boot-phrase-letter:not([hidden])').length : 0,
    fontSize: getComputedStyle(auth).fontSize,
    // Layout width in stage pixels: the host window scales the whole stage.
    width: auth.offsetWidth,
    opacity: getComputedStyle(document.querySelector('.auth-status')).opacity,
  };
  window.rhine.archive();
  await wait(200);
  return state;
};
const wrap = value => ((value % 1440) + 1440) % 1440;
const scheduleFor = mode => {
  const now = new Date(), minutes = now.getHours() * 60 + now.getMinutes();
  const start = wrap(mode === 'dark' ? minutes - 60 : minutes + 60);
  const end = wrap(mode === 'dark' ? minutes + 60 : minutes - 60);
  return { darkstarthour: { value: Math.floor(start / 60) }, darkstartminute: { value: start % 60 }, lightstarthour: { value: Math.floor(end / 60) }, lightstartminute: { value: end % 60 } };
};
let started = false;
const timer = setInterval(async () => {
  if (started || !window.rhine || !window.rhine.stats().ready) return;
  started = true;
  clearInterval(timer);
  try {
    await wait(400);
    const host = window.rhine.stats().wallpaper.properties;
    results.startup = { name: readName(), dark: dark(), manual: host.colortheme.value, autotheme: host.autotheme.value };
    results.openingCustom = await opening();

    push(scheduleFor('light'));
    await wait(400);
    results.switchedToLight = { dark: dark() };

    // A manual pick is honoured at once; the schedule only re-asserts when the
    // clock actually crosses the next configured boundary.
    push({ colortheme: { value: 'dark' } });
    await wait(400);
    results.manualDuringSchedule = { dark: dark() };

    push(scheduleFor('dark'));
    await wait(400);
    push(scheduleFor('light'));
    await wait(400);
    results.scheduleReasserted = { dark: dark() };

    push({ sessionname: { value: 'Dr. Kal\\u2019tsit & <b>' } });
    await wait(250);
    results.renamed = readName();

    document.querySelector('[data-action="settings"]').click();
    await wait(500);
    results.settings = {
      intro: document.querySelector('#settings-intro-name')?.textContent ?? null,
      schedule: document.querySelector('.theme-schedule')?.textContent ?? null,
    };
    document.querySelector('[data-action="close-modal"]')?.click();
    await wait(400);

    push({ sessionname: { value: '   ' } });
    await wait(250);
    results.cleared = readName();
    results.openingDefault = await opening();

    push({ autotheme: { value: false } });
    await wait(250);
    push({ colortheme: { value: 'dark' } });
    await wait(400);
    results.scheduleOff = { dark: dark() };
  } catch (error) {
    results.error = String((error && error.stack) || error);
  }
  await fetch('http://127.0.0.1:${port}/', { method: 'POST', body: JSON.stringify(results) });
}, 100);
</script>`;
const html = await readFile(`${dir}/index.html`, "utf8");
await writeFile(`${dir}/index.html`, html.replace("</head>", `${probe}</head>`));

let finish;
const received = new Promise(resolve => { finish = resolve; });
const server = createServer((request, response) => {
  let body = "";
  request.on("data", chunk => { body += chunk; });
  request.on("end", () => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.end("ok");
    try { finish(JSON.parse(body)); } catch {}
  });
});
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

const location = "Rhine Lab identity and schedule diagnostic";
const run = args => new Promise((done, fail) => {
  const child = spawn(exe, args, { windowsHide: true, stdio: "ignore" });
  child.once("error", fail);
  child.once("exit", done);
});
let timeout;
try {
  await run(["-control", "openWallpaper", "-file", `${dir}/project.json`, "-playInWindow", location, "-width", "640", "-height", "360", "-x", "-30000", "-y", "-30000"]);
  const data = await Promise.race([
    received,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Host timeout: no probe report within 40 s")), 40000); }),
  ]);
  console.log(JSON.stringify(data, null, 2));
  if (data.error) throw new Error(`Probe failed: ${data.error}`);
  assert.deepEqual(data.startup.name, { text: "KAL'TSIT", live: true, artwork: false }, "A host name replaces the fixed phrase artwork");
  assert.equal(data.startup.dark, true, "The schedule decides the theme at startup, not the manual colour");
  assert.equal(data.startup.manual, "light", "The manual value stays stored as the base");
  assert.equal(data.startup.autotheme, true);
  assert.equal(data.openingCustom.text, "ID CONFIRMED : KAL'TSIT", "The opening types the host name");
  assert.equal(data.openingCustom.fallback, true, "An unauthored name uses the readable text fallback");
  assert.equal(data.openingCustom.phrase, null, "No fixed phrase artwork is claimed for a custom name");
  assert.equal(data.openingCustom.fontSize, "21.35px", "The fallback keeps the identity line metrics");
  assert.ok(data.openingCustom.width > 150 && data.openingCustom.opacity === "1", `opening line measured ${data.openingCustom.width}px at opacity ${data.openingCustom.opacity}`);
  assert.equal(data.openingDefault.text, "ID CONFIRMED : JOYCE MOORE");
  assert.equal(data.openingDefault.fallback, false, "The default name still renders the shipped phrase artwork");
  assert.equal(data.openingDefault.phrase, "identity");
  assert.equal(data.openingDefault.letters, 26, "Every authored letter of the default phrase is revealed");
  assert.ok(data.openingDefault.width > 150, `default phrase measured ${data.openingDefault.width}px`);
  assert.equal(data.switchedToLight.dark, false, "Crossing into the light window switches at runtime");
  assert.equal(data.manualDuringSchedule.dark, true, "A manual colour applies at once, without being fought by the next tick");
  assert.equal(data.scheduleReasserted.dark, false, "The next boundary re-asserts the scheduled theme");
  assert.deepEqual(data.renamed, { text: "Dr. Kal\u2019tsit & <b>", live: true, artwork: false }, "Renaming applies live and stays plain text");
  assert.equal(data.settings.intro, "Dr. Kal\u2019tsit & <b>", "The settings surface shows the current identity");
  assert.ok(data.settings.schedule.startsWith("Wallpaper Engine 已按时间自动切换：暗色 ") && data.settings.schedule.endsWith("。"), `settings note: ${data.settings.schedule}`);
  assert.deepEqual(data.cleared, { text: "JOYCE MOORE", live: false, artwork: true }, "An empty host value restores the shipped name and artwork");
  assert.equal(data.scheduleOff.dark, true, "Turning the schedule off returns the manual colour");
  await mkdir("verification/identity-theme", { recursive: true });
  await writeFile("verification/identity-theme/host-results.json", `${JSON.stringify(data, null, 2)}\n`);
  console.log("Real host identity and scheduled theme switching passed.");
} finally {
  clearTimeout(timeout);
  server.close();
  await run(["-control", "closeWallpaper", "-location", location]);
  await rm(dir, { recursive: true, force: true });
}
