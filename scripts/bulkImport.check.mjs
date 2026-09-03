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

// ERC-1155: the contract rejects a zero supply or a zero price outright,
// so both must fail parsing rather than one signature into the batch.
const editionCsv = [
  'name,price,image,supply,trait:Metal',
  'Silver Sword,0.05,silver.png,500,Silver',
  'Gold Sword,0.10,gold.png,,Gold',
  'Free Sword,0,free.png,100,Iron',
].join("\n");

const asEdition = parseBulkCsv(editionCsv, "ERC1155");
check("1155: reads the supply column", asEdition.drafts[0].supply, 500);
check("1155: only the valid row survives", asEdition.drafts.length, 1);
check("1155: missing supply and zero price both rejected", asEdition.errors.map((e) => e.row), [3, 4]);

// The same file under ERC-721 is entirely valid: supply is meaningless
// there and a zero price just means "created but not listed".
const as721 = parseBulkCsv(editionCsv, "ERC721");
check("721: same file passes, supply ignored", as721.drafts.length, 3);
check("721: zero price allowed", as721.drafts[2].priceEth, 0);

check(
  "1155: json supply via totalSupply alias",
  parseBulkJson('[{"name":"Ape","image":"a.png","price":0.1,"totalSupply":25}]', "ERC1155").drafts[0].supply,
  25
);
check(
  "1155: json missing supply rejected",
  parseBulkJson('[{"name":"Ape","image":"a.png","price":0.1}]', "ERC1155").errors.length,
  1
);
check("dispatch: standard is forwarded", parseBulkFile("m.csv", editionCsv, "ERC1155").drafts.length, 1);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
