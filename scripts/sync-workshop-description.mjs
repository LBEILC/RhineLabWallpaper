// Keep the Workshop description in sync in every place that carries it.
//
//   node scripts/sync-workshop-description.mjs
//   node scripts/sync-workshop-description.mjs "D:\...\myprojects\rhine-lab-workshop\project.json"
//
// Source of truth: docs/WORKSHOP-DESCRIPTION.txt
// Targets: wallpaper/project.json plus any project.json paths passed on the command line.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = "docs/WORKSHOP-DESCRIPTION.txt";
const text = (await readFile(source, "utf8")).replace(/\r\n/g, "\n").replace(/\s+$/, "");
if (!text.includes("【Rhine Lab · 莱茵生命交互桌面】"))
  throw new Error(`${source} does not look like the Workshop description`);

const bullets = text.match(/^• .+$/gm) ?? [];
const dates = text.match(/^\d{4}\.\d{2}\.\d{2}$/gm) ?? [];
if (!text.includes("GitHub") || !text.includes("【Rhine Lab · Interactive Desktop】"))
  throw new Error(`${source} must include both languages and mention GitHub for details`);
if (/(?:https?:\/\/|www\.)[^\s]*github|github\.com\//i.test(text))
  throw new Error(`${source} must mention GitHub without including a link`);

const targets = ["wallpaper/project.json", ...process.argv.slice(2)];
for (const target of targets) {
  const path = resolve(target);
  const raw = await readFile(path, "utf8");
  const pattern = /("description"\s*:\s*)("(?:[^"\\]|\\.)*")/;
  const match = raw.match(pattern);
  if (!match) throw new Error(`${path} has no replaceable description field`);

  const current = JSON.parse(match[2]);
  if (current === text) {
    console.log(`unchanged  ${path} (${text.length} chars)`);
    continue;
  }

  const updated = raw.replace(
    pattern,
    (_match, prefix) => `${prefix}${JSON.stringify(text)}`,
  );
  JSON.parse(updated); // fail loudly before touching the file
  await writeFile(path, updated);
  console.log(
    `updated    ${path} (${text.length} chars, ${bullets.length} updates, dates ${dates.join(" / ")})`,
  );
}
