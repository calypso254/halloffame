import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data", "pens.json");
const CSV_FILE = path.join(ROOT, "ProductExport-1777755110.csv");

const archive = JSON.parse(await readFile(DATA_FILE, "utf8"));
const csv = await readFile(CSV_FILE, "utf8");
const rows = parseCsv(csv);
const products = new Map();

for (const row of rows) {
  const name = normalizeText(row["Product Title"]);
  if (!name) continue;

  const key = matchKey(name);
  const product = products.get(key) || {
    productId: clean(row["Product Id"]),
    handle: clean(row["Product Handle"]),
    type: clean(row["Product Type"]),
    category: clean(row["Product Category"]),
    collectionTitles: splitList(row["Collection Titles"]),
    tags: splitList(row["Product Tags"]),
    description: normalizeText(row["Product Description (Plain Text)"]),
    createdAt: clean(row["Product Created At"]),
    publishedAt: clean(row["Product Published At"]),
    variants: [],
  };

  const variant = {
    variantId: clean(row["Variant Id"]),
    title: clean(row["Variant Title"]),
    sku: clean(row["Variant Sku"]),
    option1: clean(row["Variant Option1 Value"]),
    option2: clean(row["Variant Option2 Value"]),
    option3: clean(row["Variant Option3 Value"]),
  };

  if (Object.values(variant).some(Boolean)) {
    product.variants.push(variant);
  }

  products.set(key, product);
}

let enrichedCount = 0;

archive.pens = archive.pens.map((pen) => {
  const details = products.get(matchKey(pen.name));
  if (!details) return pen;

  enrichedCount += 1;
  return {
    ...pen,
    handle: details.handle || pen.id,
    description: details.description,
    tags: details.tags,
    collectionTitles: details.collectionTitles,
    product: {
      productId: details.productId,
      type: details.type,
      category: details.category,
      createdAt: details.createdAt,
      publishedAt: details.publishedAt,
    },
    variants: uniqueVariants(details.variants),
  };
});

archive.enrichedAt = new Date().toISOString();
archive.enrichedFrom = path.basename(CSV_FILE);

await writeFile(DATA_FILE, `${JSON.stringify(archive, null, 2)}\n`);

console.log(`Enriched ${enrichedCount} archive pens from ${path.basename(CSV_FILE)}`);
console.log(`Wrote ${path.relative(ROOT, DATA_FILE)}`);

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function splitList(value) {
  return clean(value)
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function uniqueVariants(variants) {
  const seen = new Set();
  return variants.filter((variant) => {
    const key = `${variant.variantId}|${variant.sku}|${variant.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value) {
  return clean(value)
    .replace(/\u00a0/g, " ")
    .replace(/Â/g, "")
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€"/g, "-")
    .replace(/â€“/g, "-")
    .replace(/â€¦/g, "...")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/([.!?,])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}
