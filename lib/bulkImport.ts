/**
 * Turning a creator's spreadsheet into items.
 *
 * Two formats, because the two audiences genuinely differ: CSV is what
 * comes out of a spreadsheet, and JSON is what comes out of a generator
 * script. Insisting on one would mean half the people importing had to
 * convert first, which is exactly the manual step bulk import exists to
 * remove.
 *
 * Both normalise to the same draft, and the JSON shape is deliberately the
 * ERC-721 metadata standard — `name`, `description`, `image`, `attributes`
 * — so the file a generator already produces for IPFS works unchanged.
 *
 * Nothing here touches the network or React: parsing is pure so the rules
 * can be tested directly, and so a malformed row is reported as a row
 * number rather than surfacing as a failed upload halfway through a batch.
 */
export interface BulkDraft {
  /** 1-based row as the creator sees it in their file, for error messages. */
  row: number;
  name: string;
  description: string;
  priceEth: number;
  /** The filename to match against an uploaded image. */
  image: string;
  traits: { trait_type: string; value: string }[];
}

export interface BulkParseResult {
  drafts: BulkDraft[];
  errors: { row: number; message: string }[];
}

/**
 * A single CSV record, respecting quotes.
 *
 * Splitting on commas is wrong the moment a description contains one, and
 * descriptions usually do. This handles quoted fields and the doubled-quote
 * escape ("" inside a quoted field), which is what spreadsheets emit.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n rather than emitting a blank row.
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing newline leaves one empty record; a genuinely blank line in
  // the middle is also noise rather than an item.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const NAME_KEYS = ["name", "title"];
const DESCRIPTION_KEYS = ["description", "desc"];
const PRICE_KEYS = ["price", "priceeth", "price_eth", "price (eth)"];
const IMAGE_KEYS = ["image", "file", "filename", "image_file", "asset"];

function pick(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

/**
 * CSV → drafts.
 *
 * Trait columns are named `trait:Background` (or `attribute:Background`),
 * which keeps an arbitrary number of traits expressible in a flat
 * spreadsheet without a nested format a spreadsheet cannot represent. An
 * empty trait cell means that item simply does not have the trait, rather
 * than having it set to blank — a distinction that matters for rarity.
 */
export function parseBulkCsv(text: string): BulkParseResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { drafts: [], errors: [{ row: 0, message: "The file is empty." }] };

  const header = rows[0].map((h) => h.trim());
  const normalised = header.map((h) => h.toLowerCase());
  const traitColumns = header
    .map((h, index) => ({ index, label: h.replace(/^(trait|attribute)\s*:\s*/i, "").trim(), isTrait: /^(trait|attribute)\s*:/i.test(h) }))
    .filter((c) => c.isTrait);

  const drafts: BulkDraft[] = [];
  const errors: BulkParseResult["errors"] = [];

  rows.slice(1).forEach((cells, index) => {
    const row = index + 2; // +1 for the header, +1 because creators count from 1
    const record: Record<string, string> = {};
    normalised.forEach((key, i) => {
      record[key] = cells[i] ?? "";
    });

    const draft: BulkDraft = {
      row,
      name: pick(record, NAME_KEYS),
      description: pick(record, DESCRIPTION_KEYS),
      priceEth: Number(pick(record, PRICE_KEYS) || 0),
      image: pick(record, IMAGE_KEYS),
      traits: traitColumns
        .map((c) => ({ trait_type: c.label, value: (cells[c.index] ?? "").trim() }))
        .filter((t) => t.trait_type !== "" && t.value !== ""),
    };

    const problem = validate(draft);
    if (problem) errors.push({ row, message: problem });
    else drafts.push(draft);
  });

  return { drafts, errors };
}

/**
 * JSON → drafts. Accepts a bare array or `{ items: [...] }`, and reads the
 * standard `attributes` array so a metadata file written for IPFS imports
 * as-is.
 */
export function parseBulkJson(text: string): BulkParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { drafts: [], errors: [{ row: 0, message: "That isn't valid JSON." }] };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown[] })?.items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!list) {
    return { drafts: [], errors: [{ row: 0, message: "Expected an array of items, or an object with an `items` array." }] };
  }

  const drafts: BulkDraft[] = [];
  const errors: BulkParseResult["errors"] = [];

  list.forEach((raw, index) => {
    const row = index + 1;
    const entry = (raw ?? {}) as Record<string, unknown>;
    const attributes = Array.isArray(entry.attributes)
      ? entry.attributes
      : Array.isArray(entry.traits)
        ? entry.traits
        : [];

    const draft: BulkDraft = {
      row,
      name: String(entry.name ?? entry.title ?? "").trim(),
      description: String(entry.description ?? "").trim(),
      priceEth: Number(entry.price ?? entry.priceEth ?? 0),
      // `image` in a metadata file is often a URI (ipfs://…, ./1.png).
      // Only the filename can be matched against an upload, so take that.
      image: String(entry.image ?? entry.file ?? entry.filename ?? "")
        .trim()
        .split("/")
        .pop() ?? "",
      traits: (attributes as Record<string, unknown>[])
        .map((a) => ({
          trait_type: String(a?.trait_type ?? a?.traitType ?? a?.type ?? "").trim(),
          value: String(a?.value ?? "").trim(),
        }))
        .filter((t) => t.trait_type !== "" && t.value !== ""),
    };

    const problem = validate(draft);
    if (problem) errors.push({ row, message: problem });
    else drafts.push(draft);
  });

  return { drafts, errors };
}

function validate(draft: BulkDraft): string | null {
  if (draft.name.length < 2) return "Needs a name of at least 2 characters.";
  if (!draft.image) return "Needs an image filename to match against your uploads.";
  if (!Number.isFinite(draft.priceEth) || draft.priceEth < 0) return "Price must be a number of 0 or more.";
  return null;
}

/** Dispatches on the file's extension, falling back to sniffing content. */
export function parseBulkFile(filename: string, text: string): BulkParseResult {
  if (/\.json$/i.test(filename)) return parseBulkJson(text);
  if (/\.csv$/i.test(filename)) return parseBulkCsv(text);
  return text.trim().startsWith("[") || text.trim().startsWith("{")
    ? parseBulkJson(text)
    : parseBulkCsv(text);
}

/**
 * Rarity as a percentage of the collection carrying each trait value.
 *
 * Only computable over a whole batch, which is exactly why creating items
 * one at a time never populated the `rarity` field the Item model has
 * always had.
 */
export function computeTraitRarity(drafts: BulkDraft[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    for (const trait of draft.traits) {
      const key = `${trait.trait_type}:${trait.value}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const rarity = new Map<string, number>();
  for (const [key, count] of counts) rarity.set(key, (count / drafts.length) * 100);
  return rarity;
}
