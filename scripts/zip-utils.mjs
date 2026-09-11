// Minimal ZIP read/write helpers built on node:zlib only.
// The release package must be creatable on a bare Node install (no new dependencies)
// and verifiable without external tools such as 7-Zip or Compress-Archive.
import { deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const UTF8_FLAG = 0x0800;
// Fixed timestamp keeps the archive byte-identical for identical input.
const DEFAULT_DATE = Date.UTC(2026, 0, 1, 0, 0, 0);

// Formats that are already compressed: storing them beats re-deflating.
const PRECOMPRESSED = new Set([
  ".woff2",
  ".woff",
  ".glb",
  ".gltf",
  ".gif",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ogg",
  ".mp3",
  ".wav",
  ".m4a",
  ".mp4",
  ".webm",
  ".zip",
  ".gz",
  ".pdf",
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++)
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPrecompressed(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && PRECOMPRESSED.has(name.slice(dot).toLowerCase());
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      (date.getUTCSeconds() >> 1),
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

/**
 * Build a ZIP archive from `{ name, data }` entries.
 * Entry names use forward slashes and are stored with the UTF-8 flag set.
 */
export function createZip(entries, { date = new Date(DEFAULT_DATE) } = {}) {
  const stamp = dosDateTime(date);
  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.name.includes("\\"))
      throw new Error(`Zip entry must use forward slashes: ${entry.name}`);
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data);
    const crc = crc32(raw);

    let method = 0;
    let payload = raw;
    if (!isPrecompressed(entry.name)) {
      const deflated = deflateRawSync(raw, { level: 9 });
      if (deflated.length < raw.length) {
        method = 8;
        payload = deflated;
      }
    }

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_HEADER, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    chunks.push(header, nameBuffer, payload);
    directory.push({
      nameBuffer,
      method,
      crc,
      payload: payload.length,
      raw: raw.length,
      offset,
    });
    offset += header.length + nameBuffer.length + payload.length;
  }

  const centralChunks = [];
  let centralSize = 0;
  for (const item of directory) {
    const record = Buffer.alloc(46);
    record.writeUInt32LE(CENTRAL_HEADER, 0);
    record.writeUInt16LE(20, 4); // version made by (MS-DOS)
    record.writeUInt16LE(20, 6); // version needed
    record.writeUInt16LE(UTF8_FLAG, 8);
    record.writeUInt16LE(item.method, 10);
    record.writeUInt16LE(stamp.time, 12);
    record.writeUInt16LE(stamp.date, 14);
    record.writeUInt32LE(item.crc, 16);
    record.writeUInt32LE(item.payload, 20);
    record.writeUInt32LE(item.raw, 24);
    record.writeUInt16LE(item.nameBuffer.length, 28);
    record.writeUInt16LE(0, 30); // extra length
    record.writeUInt16LE(0, 32); // comment length
    record.writeUInt16LE(0, 34); // disk number
    record.writeUInt16LE(0, 36); // internal attributes
    record.writeUInt32LE(0, 38); // external attributes
    record.writeUInt32LE(item.offset, 42);
    centralChunks.push(record, item.nameBuffer);
    centralSize += record.length + item.nameBuffer.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...centralChunks, end]);
}

/** Read every entry of a ZIP archive, verifying size and CRC32 on the way. */
export function readZip(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  let cursor = centralOffset;

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER)
      throw new Error(`Broken central directory at entry ${i}`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    if (!(flags & UTF8_FLAG) && /[^\x20-\x7e]/.test(name))
      throw new Error(`Non-ASCII zip entry without UTF-8 flag: ${name}`);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER)
      throw new Error(`Broken local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = Buffer.from(payload);
    else if (method === 8) data = inflateRawSync(payload);
    else
      throw new Error(`Unsupported compression method ${method} for ${name}`);

    if (data.length !== uncompressedSize)
      throw new Error(
        `Size mismatch for ${name}: ${data.length} != ${uncompressedSize}`,
      );
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`);

    entries.push({ name, method, crc, compressedSize, uncompressedSize, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minimum; i--) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL) return i;
  }
  throw new Error("End of central directory record not found");
}
