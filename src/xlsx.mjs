import { inflateRawSync } from "node:zlib";

const TEXT_DECODER = new TextDecoder("utf-8");

export function readWorkbook(buffer) {
  const files = readZip(buffer);
  const workbook = readText(files, "xl/workbook.xml");
  const rels = readText(files, "xl/_rels/workbook.xml.rels");
  const sharedStrings = files.has("xl/sharedStrings.xml")
    ? parseSharedStrings(readText(files, "xl/sharedStrings.xml"))
    : [];

  const relTargets = parseRelationships(rels);
  const sheets = parseSheets(workbook);
  const out = {};

  for (const sheet of sheets) {
    const target = relTargets.get(sheet.rid);
    if (!target) continue;
    const path = normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    if (!files.has(path)) continue;
    out[sheet.name] = parseWorksheet(readText(files, path), sharedStrings);
  }

  return out;
}

function readZip(buffer) {
  const source = Buffer.from(buffer);
  const eocd = findEndOfCentralDirectory(source);
  const entryCount = source.readUInt16LE(eocd + 10);
  const centralOffset = source.readUInt32LE(eocd + 16);
  const files = new Map();
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (source.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid XLSX central directory.");
    }
    const method = source.readUInt16LE(offset + 10);
    const compressedSize = source.readUInt32LE(offset + 20);
    const uncompressedSize = source.readUInt32LE(offset + 24);
    const nameLength = source.readUInt16LE(offset + 28);
    const extraLength = source.readUInt16LE(offset + 30);
    const commentLength = source.readUInt16LE(offset + 32);
    const localOffset = source.readUInt32LE(offset + 42);
    const name = source.slice(offset + 46, offset + 46 + nameLength).toString("utf8");

    const localNameLength = source.readUInt16LE(localOffset + 26);
    const localExtraLength = source.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = source.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed, { finishFlush: 2 });
    else throw new Error(`Unsupported XLSX compression method: ${method}`);

    if (data.length !== uncompressedSize && uncompressedSize !== 0) {
      throw new Error(`Corrupt XLSX entry: ${name}`);
    }
    files.set(normalizeZipPath(name), data);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("File is not a valid XLSX workbook.");
}

function readText(files, path) {
  const data = files.get(normalizeZipPath(path));
  if (!data) throw new Error(`Missing XLSX file: ${path}`);
  return TEXT_DECODER.decode(data);
}

function normalizeZipPath(path) {
  const parts = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function parseRelationships(xml) {
  const map = new Map();
  for (const attrs of matchTags(xml, "Relationship")) {
    const id = attrs.Id || attrs.id;
    if (id && attrs.Target) map.set(id, attrs.Target);
  }
  return map;
}

function parseSheets(xml) {
  return matchTags(xml, "sheet").map((attrs) => ({
    name: decodeXml(attrs.name || ""),
    rid: attrs["r:id"]
  }));
}

function parseSharedStrings(xml) {
  return matchFullTags(xml, "si").map((si) => {
    const fragments = [];
    for (const textTag of matchFullTags(si, "t")) {
      fragments.push(decodeXml(stripTags(textTag)));
    }
    return fragments.join("");
  });
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  for (const rowXml of matchFullTags(xml, "row")) {
    const attrs = parseAttrs(rowXml.open);
    const rowNumber = Number(attrs.r || rows.length + 1);
    const cells = [];
    for (const cellXml of matchFullTags(rowXml.body, "c")) {
      const cellAttrs = parseAttrs(cellXml.open);
      const ref = cellAttrs.r || "";
      const colIndex = columnIndex(ref.replace(/\d+/g, ""));
      const raw = getCellRawValue(cellXml.body);
      let value = raw;
      if (cellAttrs.t === "s") value = sharedStrings[Number(raw)] || "";
      if (cellAttrs.t === "inlineStr") value = inlineString(cellXml.body);
      if (cellAttrs.t === "b") value = raw === "1" ? "TRUE" : "FALSE";
      cells[colIndex] = decodeXml(value);
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function getCellRawValue(xml) {
  const value = matchFullTags(xml, "v")[0]?.body;
  if (value !== undefined) return stripTags(value);
  const formulaString = matchFullTags(xml, "t")[0]?.body;
  return formulaString !== undefined ? stripTags(formulaString) : "";
}

function inlineString(xml) {
  return matchFullTags(xml, "t").map((tag) => decodeXml(stripTags(tag.body))).join("");
}

function matchTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}\\b([^>]*)/?>`, "gi");
  const out = [];
  let match;
  while ((match = regex.exec(xml))) out.push(parseAttrs(match[1]));
  return out;
}

function matchFullTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)</${tagName}>`, "gi");
  const out = [];
  let match;
  while ((match = regex.exec(xml))) {
    out.push({ open: match[1], body: match[2] });
  }
  return out;
}

function parseAttrs(text) {
  const attrs = {};
  const regex = /([:\w-]+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(text))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function stripTags(text) {
  return String(text || "").replace(/<[^>]*>/g, "");
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function columnIndex(column) {
  let total = 0;
  for (const char of column.toUpperCase()) {
    if (char < "A" || char > "Z") continue;
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, total - 1);
}
