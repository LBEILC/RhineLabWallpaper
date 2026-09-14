import content from "../content/archives.json" with { type: "json" };
import english from "../content/archives.en.json" with { type: "json" };
import { language, localeEvent } from "./i18n";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
}

// Preserve record object identities and array indices used by the live scene.
// Navigation always uses the canonical source; translated labels are display data.
export const records: ArchiveRecord[] = content.records.map((record, index) =>
  Object.defineProperties({}, Object.fromEntries(Object.keys(record).map(key => [key, {
    enumerable: true,
    get: () => (language() === "en-US" ? english.records[index] : record)[key as keyof ArchiveRecord],
  }]))) as ArchiveRecord,
);
const categorySets = [["全部档案", ...content.categories], ["All archives", ...english.categories]];
export const categories = [...categorySets[0]];
export const archiveColumns = [...content.columns];
export const categoryIndex = (value: string) => Math.max(...categorySets.map(set => set.indexOf(value)));
window.addEventListener(localeEvent, () => {
  categories.splice(0, categories.length, ...categorySets[language() === "en-US" ? 1 : 0]);
  archiveColumns.splice(0, archiveColumns.length, ...(language() === "en-US" ? english.columns : content.columns));
});

export function columnFiles(lane: number) {
  return content.records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === content.columns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = content.columns.indexOf(content.records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
