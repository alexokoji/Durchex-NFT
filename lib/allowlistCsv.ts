const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type ParsedAllowlistRow = { address: string; label: string };

export type AllowlistCsvResult = {
  rows: ParsedAllowlistRow[];
  /** Rows that held no valid 0x… address (headers, blanks, typos), capped for display. */
  skipped: string[];
  skippedCount: number;
  /** Addresses that appeared more than once in the same file. */
  duplicatesInFile: number;
};

/** Split one CSV line, honouring "quoted, values" and both , and ; separators. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === "," || char === ";" || char === "\t")) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim().replace(/^"|"$/g, "").trim());
}

/**
 * Parse an uploaded allowlist CSV. Deliberately forgiving about shape: a
 * header row, a plain one-address-per-line list, or an export with extra
 * columns all work — every row is scanned for the first cell that looks
 * like an EVM address, and the next non-empty cell (if any) becomes the
 * label. Rows without an address are reported back rather than dropped
 * silently, so the admin can see a bad paste immediately.
 */
export function parseAllowlistCsv(text: string, maxRows = 200_000): AllowlistCsvResult {
  const seen = new Set<string>();
  const rows: ParsedAllowlistRow[] = [];
  const skipped: string[] = [];
  let skippedCount = 0;
  let duplicatesInFile = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (rows.length >= maxRows) break;

    const cells = splitLine(line);
    const addressIndex = cells.findIndex((cell) => ADDRESS_PATTERN.test(cell));
    if (addressIndex === -1) {
      skippedCount += 1;
      if (skipped.length < 10) skipped.push(line.slice(0, 120));
      continue;
    }

    const address = cells[addressIndex].toLowerCase();
    if (seen.has(address)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(address);

    const label = cells.find((cell, index) => index !== addressIndex && cell.length > 0) ?? "";
    rows.push({ address, label: label.slice(0, 120) });
  }

  return { rows, skipped, skippedCount, duplicatesInFile };
}
