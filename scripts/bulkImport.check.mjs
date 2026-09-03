// Exercises lib/bulkImport.ts against the shapes real files actually take.
// Run: npx tsx scripts/bulkImport.check.mjs
import { parseBulkCsv, parseBulkJson, parseBulkFile, computeTraitRarity, parseCsvRows } from "../lib/bulkImport.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got      ${a}\n       expected ${e}`}`);
}

// A description containing a comma is the single most common way a naive
// CSV split breaks, and quoted quotes are how spreadsheets escape.
const csv = [
  'name,description,price,image,trait:Background,trait:Eyes',
  'Sword #1,"A sharp, curved blade",0.05,sword1.png,Blue,Green',
  'Sword #2,"He said ""hello""",0.1,sword2.png,Red,',
  '',
  'Sword #3,Plain,0,sword3.png,,Gold',
].join("\n");

const csvResult = parseBulkCsv(csv);
check("csv: parses every non-blank row", csvResult.drafts.length, 3);
check("csv: comma inside quotes survives", csvResult.drafts[0].description, "A sharp, curved blade");
check("csv: doubled quotes unescape", csvResult.drafts[1].description, 'He said "hello"');
check("csv: traits collected", csvResult.drafts[0].traits, [
  { trait_type: "Background", value: "Blue" },
  { trait_type: "Eyes", value: "Green" },
]);
check("csv: empty trait cell is absent, not blank", csvResult.drafts[1].traits, [
  { trait_type: "Background", value: "Red" },
]);
check("csv: zero price is allowed", csvResult.drafts[2].priceEth, 0);
check("csv: no spurious errors", csvResult.errors, []);

// CRLF, because files coming off Windows spreadsheets have it.
check("csv: CRLF rows", parseCsvRows("a,b\r\n1,2\r\n").length, 2);

const bad = parseBulkCsv("name,image\n,missing.png\nOK,\n");
check("csv: reports bad rows by their real line number", bad.errors.map((e) => e.row), [2, 3]);
check("csv: keeps good rows out of errors", bad.drafts.length, 0);

// The JSON a metadata generator emits for IPFS, unchanged.
const json = JSON.stringify([
  { name: "Ape #1", description: "One", image: "ipfs://QmAbc/1.png", price: 0.2,
    attributes: [{ trait_type: "Fur", value: "Gold" }, { trait_type: "Hat", value: "" }] },
  { name: "Ape #2", image: "./2.png", price: "0.3", attributes: [{ trait_type: "Fur", value: "Gold" }] },
]);
const jsonResult = parseBulkJson(json);
check("json: ipfs uri reduced to filename", jsonResult.drafts[0].image, "1.png");
check("json: relative path reduced to filename", jsonResult.drafts[1].image, "2.png");
check("json: blank attribute value dropped", jsonResult.drafts[0].traits, [{ trait_type: "Fur", value: "Gold" }]);
check("json: string price coerced", jsonResult.drafts[1].priceEth, 0.3);
check("json: { items: [...] } wrapper", parseBulkJson('{"items":[{"name":"Ape","image":"a.png"}]}').drafts.length, 1);
// The 2-character floor matches the single-item create form, so a batch
// cannot slip in names the one-at-a-time flow would have rejected.
check("json: one-character name rejected", parseBulkJson('{"items":[{"name":"A","image":"a.png"}]}').errors.length, 1);
check("json: malformed reports rather than throws", parseBulkJson("{oops").errors.length, 1);

check("dispatch: .json", parseBulkFile("meta.json", json).drafts.length, 2);
check("dispatch: .csv", parseBulkFile("meta.csv", csv).drafts.length, 3);
check("dispatch: sniffs unlabelled json", parseBulkFile("meta.txt", json).drafts.length, 2);

const rarity = computeTraitRarity(jsonResult.drafts);
check("rarity: shared trait across both items is 100%", rarity.get("Fur:Gold"), 100);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
