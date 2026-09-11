// Verify a packaged wallpaper release archive without external tools.
//
//   node scripts/check-wallpaper-release.mjs release/RhineLabWallpaper-latest.zip
//
// Checks the archive structure, every CRC (inside readZip), the embedded project.json,
// relative asset URLs, the absence of individually licensed fonts and the file list
// recorded by the build.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readZip } from "./zip-utils.mjs";

const FOLDER = "RhineLabWallpaper";
const argument = process.argv[2];

async function defaultArchive() {
  const files = (await readdir("release")).filter((name) =>
    name.endsWith(".zip"),
  );
  assert.ok(
    files.length,
    "No archive in release/ - run npm run pack:wallpaper first",
  );
  // Newest archive wins; names (dev / latest / v1.0.0) do not order by age.
  const stamped = await Promise.all(
    files.map(async (name) => ({
      name,
      time: (await stat(join("release", name))).mtimeMs,
    })),
  );
  stamped.sort((a, b) => a.time - b.time);
  return join("release", stamped.at(-1).name);
}

const archivePath = resolve(argument ?? (await defaultArchive()));
const entries = readZip(await readFile(archivePath));
const byName = new Map(entries.map((entry) => [entry.name, entry]));

for (const entry of entries) {
  assert.ok(
    !entry.name.includes("\\"),
    `Backslash in entry name: ${entry.name}`,
  );
  assert.ok(
    !entry.name.startsWith("/") && !entry.name.split("/").includes(".."),
    `Unsafe entry path: ${entry.name}`,
  );
  assert.ok(
    !/(^|\/)novecento(\/|$)/i.test(entry.name),
    `Individually licensed font packaged: ${entry.name}`,
  );
}

const projectEntries = entries.filter((entry) =>
  entry.name.startsWith(`${FOLDER}/`),
);
assert.ok(
  projectEntries.length > 100,
  `Expected the full project inside ${FOLDER}/, found ${projectEntries.length} entries`,
);
assert.ok(
  byName.has("INSTALL.txt"),
  "INSTALL.txt is missing from the archive root",
);

const read = (name) => {
  const entry = byName.get(name);
  assert.ok(entry, `${name} is missing from the archive`);
  return entry.data;
};

const project = JSON.parse(read(`${FOLDER}/project.json`).toString("utf8"));
assert.equal(project.type, "web");
assert.equal(project.file, "index.html");
assert.ok(
  byName.has(`${FOLDER}/${project.file}`),
  "project.json points at a missing main file",
);
assert.equal(
  project.general?.supportsaudioprocessing,
  true,
  "Audio processing flag is not in general",
);
assert.ok(
  Object.keys(project.general.properties ?? {}).length > 50,
  "User properties are missing",
);
if (project.preview)
  assert.ok(
    byName.has(`${FOLDER}/${project.preview}`),
    "Preview file declared in project.json is missing",
  );
assert.ok(byName.has(`${FOLDER}/LICENSE`), "LICENSE is missing");

const html = read(`${FOLDER}/index.html`).toString("utf8");
assert.ok(
  !/\b(?:src|href)=["']\//.test(html),
  "index.html contains root-relative URLs",
);
assert.ok(
  /src=["']\.\/assets\/index-[^"']+\.js["']/.test(html),
  "index.html does not reference the bundled script relatively",
);
assert.ok(
  /href=["']\.\/assets\/index-[^"']+\.css["']/.test(html),
  "index.html does not reference the bundled stylesheet relatively",
);

const recorded = JSON.parse(read(`${FOLDER}/build-files.json`).toString("utf8"))
  .map((file) => file.path)
  .sort();
const packaged = projectEntries
  .map((entry) => entry.name.slice(FOLDER.length + 1))
  .sort();
// The manifest is generated before itself, so it never lists its own entry.
assert.deepEqual(
  packaged.filter((name) => name !== "build-files.json"),
  recorded,
  "Archive contents differ from the build manifest",
);

const modelFiles = packaged.filter((name) => name.endsWith(".glb"));
assert.equal(
  modelFiles.length,
  2,
  `Expected two GLB models, found ${modelFiles.length}`,
);
const fontFiles = packaged.filter((name) => name.endsWith(".woff2"));
assert.ok(
  fontFiles.length > 500,
  `Expected the MiSans subset files, found ${fontFiles.length}`,
);
const archiveTexts = packaged.filter((name) =>
  /^archives\/RHINE-LAB-X-\d{3}\.txt$/.test(name),
);
assert.equal(
  archiveTexts.length,
  40,
  `Expected 40 exported archive texts, found ${archiveTexts.length}`,
);

const bytes = projectEntries.reduce(
  (total, entry) => total + entry.data.length,
  0,
);
console.log(
  `Checked ${archivePath.split(/[\\/]/).at(-1)}: ${projectEntries.length} project files, ` +
    `${modelFiles.length} GLB, ${fontFiles.length} woff2, ${(bytes / 1048576).toFixed(1)} MiB, all CRCs verified.`,
);
