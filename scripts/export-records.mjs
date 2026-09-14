import fs from "node:fs/promises";
import { loadContent, archiveText } from "./archive-content.mjs";

// Validate the entire input before writing any downloads.
const { records } = await loadContent();
const english = await loadContent("en-US");
const output = new URL("../public/archives/", import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const record of records) {
  await fs.writeFile(
    new URL(`RHINE-LAB-${record.id}.txt`, output),
    archiveText(record),
    "utf8",
  );
}
console.log(`Prepared ${records.length} downloadable archive records.`);

const englishOutput = new URL("en/", output);
await fs.mkdir(englishOutput, { recursive: true });
for (const record of english.records) {
  await fs.writeFile(new URL(`RHINE-LAB-${record.id}.txt`, englishOutput), archiveText(record, "en-US"), "utf8");
}
console.log(`Prepared ${english.records.length} English archive downloads.`);
