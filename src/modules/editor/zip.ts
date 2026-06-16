import zlib from "zlib";

type ZipEntry = { name: string; data: Buffer };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date: Date) => {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, date: day & 0xffff };
};

/**
 * Builds a ZIP archive (deflate-compressed) from the given entries using only Node's
 * built-in zlib — no third-party archiver dependency required.
 */
const createZip = (entries: ZipEntry[]): Buffer => {
  const { time, date } = dosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    localHeader.writeUInt16LE(8, 8); // method: deflate
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // method
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16); // central dir offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const findEndOfCentralDirectory = (buf: Buffer): number => {
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
};

/**
 * Reads a ZIP archive (stored or deflate entries) into file entries using only Node's
 * built-in zlib. Directory entries are skipped; names keep their forward-slash paths.
 */
const readZip = (buf: Buffer): ZipEntry[] => {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error("not a valid zip (end of central directory not found)");

  const totalEntries = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("corrupt local file header");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      let data: Buffer;
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = zlib.inflateRawSync(compressed);
      else throw new Error(`unsupported compression method ${method} for "${name}"`);
      entries.push({ name, data });
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

export { createZip, readZip, type ZipEntry };
