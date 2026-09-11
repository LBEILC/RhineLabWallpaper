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
  return {
    text: host.textContent.trim(),
    art: host.querySelector('svg') !== null,
    live: host.querySelector('.wb-name-live') !== null,
  };
};
const readFooter = () => {
  const host = document.querySelector('#session-name');
  const art = host.querySelector('svg.wb-name-art');
  const live = host.querySelector('.wb-name-live');
  const text = host.querySelector('.wb-lettering-text');
  let alignment = null;
  if (art && live) {
    const artRect = art.getBoundingClientRect();
    const liveRect = live.getBoundingClientRect();
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    live.append(probe);
    const probeRect = probe.getBoundingClientRect();
    alignment = {
      art: +((artRect.top + artRect.height * 0.8) - liveRect.top).toFixed(2),
      live: +(probeRect.bottom - liveRect.top).toFixed(2),
    };
    probe.remove();
  }
  return {
    artGroups: art ? art.querySelectorAll('g').length : 0,
    artWidth: art ? parseFloat(art.style.width) : null,
    artVisible: art ? getComputedStyle(art).display !== 'none' : false,
    fixedArt: host.querySelectorAll('.wb-lettering > svg:not(.wb-name-art)').length,
    live: live ? live.textContent : null,
    liveFont: live ? getComputedStyle(live).fontFamily.split(',')[0].replace(/"/g, '') : null,
    archiveText: text ? text.textContent : null,
    alignment,
    // The artwork must follow the theme ink, never the SVG default black.
    ink: getComputedStyle(host).color,
    glyphFill: art?.querySelector('path') ? getComputedStyle(art.querySelector('path')).fill : null,
    fixedFill: host.querySelector('.wb-lettering > svg:not(.wb-name-art) path') ? getComputedStyle(host.querySelector('.wb-lettering > svg:not(.wb-name-art) path')).fill : null,
  };
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
  const children = phrase ? [...phrase.children] : [];
  const prefix = children.filter(child => child.classList.contains('boot-phrase-letter') && !child.hidden);
  const tail = children.find(child => child.classList.contains('boot-phrase-tail') && !child.hidden);
  const tailChildren = tail ? [...tail.children].filter(child => !child.hidden) : [];
  const glyphs = tailChildren.filter(child => child.classList.contains('boot-name-glyph'));
  const live = tailChildren.find(child => child.classList.contains('boot-phrase-live'));
  const stage = document.querySelector('#stage');
  const scale = stage.getBoundingClientRect().width / stage.offsetWidth || 1;
  let alignment = null,
    baseline = null;
  if (glyphs.length && prefix.length) {
    const cell = prefix[prefix.length - 1].getBoundingClientRect();
    const glyph = glyphs[0].getBoundingClientRect();
    alignment = {
      top: +((glyph.top - cell.top) / scale).toFixed(3),
      height: +(glyph.height / scale).toFixed(3),
      prefixHeight: +(cell.height / scale).toFixed(3),
    };
  }
  if (live && prefix.length) {
    const cell = prefix[prefix.length - 1].getBoundingClientRect();
    const liveRect = live.getBoundingClientRect();
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    live.append(probe);
    const probeRect = probe.getBoundingClientRect();
    baseline = {
      artwork: +(((cell.top + cell.height * 0.8) - liveRect.top) / scale).toFixed(2),
      live: +((probeRect.bottom - liveRect.top) / scale).toFixed(2),
    };
    probe.remove();
  }
  const state = {
    // The clipped label carries the whole line; the phrase nodes are aria-hidden
    // drawings, and the host name repeats only the part it renders.
    text: auth.querySelector('.boot-phrase-label').textContent,
    fallback: auth.classList.contains('boot-lettering-fallback'),
    phrase: phrase ? phrase.dataset.phrase : null,
    letters: prefix.length,
    glyphs: glyphs.length,
    drawn: glyphs.filter(cell => cell.querySelector('svg path')).length,
    glyphFill: glyphs.length && glyphs[0].querySelector('path') ? getComputedStyle(glyphs[0].querySelector('path')).fill : null,
    ink: getComputedStyle(auth).color,
    live: live ? live.textContent : null,
    liveFont: live ? getComputedStyle(live).fontFamily.split(',')[0].replace(/"/g, '') : null,
    alignment,
    baseline,
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
    results.footerLatin = readFooter();
    results.openingCustom = await opening();
    // The user-facing case: a Chinese operator name must not restyle the
    // authored "ID CONFIRMED :" prefix.
    push({ sessionname: { value: '赫默' } });
    await wait(250);
    results.footerChinese = readFooter();
    results.openingChinese = await opening();
    // A mixed name draws the Latin run and keeps the rest in the page font.
    push({ sessionname: { value: '赫默 KAL\\u2019TSIT' } });
    await wait(250);
    results.openingMixed = await opening();

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
    results.footerRenamed = readFooter();

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
    results.footerDefault = readFooter();
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
  const glyphs = JSON.parse(await readFile("src/name-glyph-art.json", "utf8")).letters;
  const artworkWidth = (text, tracking) => {
    let x = 0;
    [...text].forEach((char, i) => { if (i) x += tracking; x += glyphs[char].width; });
    return x;
  };
  assert.deepEqual(data.startup.name, { text: "KAL'TSIT", art: true, live: false }, "A host name keeps an artwork form in the footer");
  assert.equal(data.startup.dark, true, "The schedule decides the theme at startup, not the manual colour");
  assert.equal(data.startup.manual, "light", "The manual value stays stored as the base");
  assert.equal(data.startup.autotheme, true);
  // Footer, English name: the same outlined typeface as the authored phrases.
  assert.equal(data.footerLatin.artGroups, 8, "Every footer letter is drawn from the outlined glyph set");
  assert.equal(data.footerLatin.artVisible, true, "The footer shows the artwork instead of the page font");
  assert.equal(data.footerLatin.fixedArt, 0, "A host name does not reuse the authored JOYCE MOORE drawing");
  assert.equal(data.footerLatin.live, null, "An English name needs no live text");
  assert.equal(data.footerLatin.glyphFill, data.footerLatin.ink, "Outlined names follow the theme ink, not SVG black");
  assert.ok(Math.abs(data.footerLatin.artWidth - artworkWidth("KAL'TSIT", 0.065)) < 0.001, `footer artwork width ${data.footerLatin.artWidth}em`);
  assert.equal(data.footerLatin.archiveText, "KAL'TSIT", "The plain-text form stays available for the archive footer");
  // Opening, English name.
  assert.equal(data.openingCustom.text, "ID CONFIRMED : KAL'TSIT", "The opening types the host name");
  assert.equal(data.openingCustom.fallback, false, "A custom name no longer restyles the whole line");
  assert.equal(data.openingCustom.phrase, "identity", "The authored identity phrase stays in charge");
  assert.equal(data.openingCustom.letters, 15, "Only the outlined 'ID CONFIRMED : ' prefix is drawn");
  assert.equal(data.openingCustom.glyphs, 8, "The English name is drawn from the outlined glyphs");
  assert.equal(data.openingCustom.drawn, 8, "Every glyph cell carries an outlined path");
  assert.equal(data.openingCustom.live, null, "No page-font text is used for an English name");
  assert.equal(data.openingCustom.glyphFill, data.openingCustom.ink, "Opening name glyphs follow the identity line colour");
  assert.ok(Math.abs(data.openingCustom.alignment.top) < 0.05, `name glyphs share the prefix cell top (${data.openingCustom.alignment.top}px)`);
  assert.equal(data.openingCustom.alignment.height, data.openingCustom.alignment.prefixHeight, "Name glyph cells keep the 1em cell");
  assert.ok(data.openingCustom.fontSize === "21.35px", "The mixed line keeps the identity metrics");
  assert.ok(data.openingCustom.width > 150 && data.openingCustom.opacity === "1", `opening line measured ${data.openingCustom.width}px at opacity ${data.openingCustom.opacity}`);
  // Footer, Chinese name: the page font is the only source.
  assert.equal(data.footerChinese.artGroups, 0, "A Chinese name has no outlined form");
  assert.equal(data.footerChinese.live, "赫默");
  assert.equal(data.footerChinese.liveFont, "MiSans", "The live part uses the bundled MiSans");
  assert.equal(data.footerChinese.archiveText, null, "A Chinese name has no separate plain-text form to switch between");
  // Opening, Chinese name.
  assert.equal(data.openingChinese.text, "ID CONFIRMED : 赫默");
  assert.equal(data.openingChinese.fallback, false, "A Chinese name also keeps the outlined prefix");
  assert.equal(data.openingChinese.phrase, "identity");
  assert.equal(data.openingChinese.letters, 15);
  assert.equal(data.openingChinese.glyphs, 0);
  assert.equal(data.openingChinese.live, "赫默");
  assert.equal(data.openingChinese.liveFont, "MiSans");
  const baselineGap = data.openingChinese.baseline ? data.openingChinese.baseline.artwork - data.openingChinese.baseline.live : null;
  assert.ok(baselineGap !== null && Math.abs(baselineGap) <= 0.35, `live baseline sits ${baselineGap}px from the outlined baseline`);
  // Opening, mixed name.
  assert.equal(data.openingMixed.text, "ID CONFIRMED : 赫默 KAL\u2019TSIT");
  assert.equal(data.openingMixed.letters, 15);
  assert.equal(data.openingMixed.glyphs, 9, "The Latin half is drawn, the space included");
  assert.equal(data.openingMixed.drawn, 8, "Spaces keep their advance without a path");
  assert.equal(data.openingMixed.live, "赫默", "The Chinese half stays live text");
  assert.equal(data.openingDefault.text, "ID CONFIRMED : JOYCE MOORE");
  assert.equal(data.openingDefault.fallback, false, "The default name still renders the shipped phrase artwork");
  assert.equal(data.openingDefault.phrase, "identity");
  assert.equal(data.openingDefault.letters, 26, "Every authored letter of the default phrase is revealed");
  assert.equal(data.openingDefault.glyphs, 0, "The default name shows no host tail");
  assert.ok(data.openingDefault.width > 150, `default phrase measured ${data.openingDefault.width}px`);
  assert.equal(data.switchedToLight.dark, false, "Crossing into the light window switches at runtime");
  assert.equal(data.manualDuringSchedule.dark, true, "A manual colour applies at once, without being fought by the next tick");
  assert.equal(data.scheduleReasserted.dark, false, "The next boundary re-asserts the scheduled theme");
  assert.deepEqual(data.renamed, { text: "Dr. Kal\u2019tsit & <b>", art: true, live: false }, "Renaming applies live and keeps the outlined form");
  assert.equal(data.footerRenamed.artGroups, 15, "Punctuation and mixed case are outlined too, spaces excepted");
  assert.equal(data.footerRenamed.glyphFill, data.footerRenamed.ink, "The light theme repaints outlined names as well");
  assert.ok(Math.abs(data.footerRenamed.artWidth - artworkWidth("Dr. Kal\u2019tsit & <b>", 0.065)) < 0.001, `renamed footer width ${data.footerRenamed.artWidth}em`);
  assert.equal(data.footerRenamed.archiveText, "Dr. Kal\u2019tsit & <b>", "Host text is escaped in the plain-text form as well");
  assert.equal(data.settings.intro, "Dr. Kal\u2019tsit & <b>", "The settings surface shows the current identity");
  assert.ok(data.settings.schedule.startsWith("Wallpaper Engine 已按时间自动切换：暗色 ") && data.settings.schedule.endsWith("。"), `settings note: ${data.settings.schedule}`);
  assert.deepEqual(data.cleared, { text: "JOYCE MOORE", art: true, live: false }, "An empty host value restores the shipped name and artwork");
  assert.equal(data.footerDefault.artGroups, 0, "The default name returns to its single authored path");
  assert.equal(data.footerDefault.fixedArt, 1);
  assert.equal(data.footerDefault.fixedFill, data.footerDefault.ink, "The authored artwork keeps its theme colour too");
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
