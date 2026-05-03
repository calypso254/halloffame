import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_CSV = path.join(ROOT, "ProductExport-1777755110.csv");
const DATA_DIR = path.join(ROOT, "data");
const IMAGE_DIR = path.join(ROOT, "assets", "pens");
const JSON_OUTPUT = path.join(DATA_DIR, "pens.json");
const CSV_OUTPUT = path.join(DATA_DIR, "pengems-hall-of-fame.csv");
const PLACEHOLDER_NAME = "photo-unavailable.jpg";

await mkdir(DATA_DIR, { recursive: true });
await mkdir(IMAGE_DIR, { recursive: true });

const csv = await readFile(SOURCE_CSV, "utf8");
const rows = parseCsv(csv);
const products = new Map();
const downloadedImages = new Map();
const usedIds = new Set();

for (const row of rows) {
  const name = normalizeText(row["Product Title"]);
  const tags = splitList(row["Product Tags"]);

  if (!name || !tags.includes("hall-of-fame")) continue;

  const key = matchKey(name);
  const product = products.get(key) || {
    name,
    productId: clean(row["Product Id"]),
    handle: clean(row["Product Handle"]),
    type: clean(row["Product Type"]),
    category: clean(row["Product Category"]),
    collectionTitles: splitList(row["Collection Titles"]),
    tags,
    description: normalizeText(row["Product Description (Plain Text)"]),
    createdAt: clean(row["Product Created At"]),
    publishedAt: clean(row["Product Published At"]),
    sourceImages: cleanImages(row["Product Image"]),
    variants: [],
  };

  const variant = {
    variantId: clean(row["Variant Id"]),
    title: clean(row["Variant Title"]),
    sku: clean(row["Variant Sku"]),
    inventoryQuantity: toNumber(row["Variant Inventory Quantity"]),
    option1: clean(row["Variant Option1 Value"]),
    option2: clean(row["Variant Option2 Value"]),
    option3: clean(row["Variant Option3 Value"]),
    sourceImage: cleanImage(row["Variant Image"]),
  };

  if (Object.values(variant).some((value) => value !== "" && value !== null)) {
    product.variants.push(variant);
  }

  products.set(key, product);
}

const pens = [];

for (const product of products.values()) {
  const baseId = slugify(product.handle || product.name);
  const id = uniqueId(baseId, usedIds);
  const releaseDate = normalizeDate(product.createdAt);
  const gallery = [];

  for (const [index, sourceImage] of product.sourceImages.entries()) {
    const image = await localizeImage(sourceImage, index === 0 ? id : `${id}-${index + 1}`, downloadedImages);
    if (image && !gallery.includes(image)) gallery.push(image);
  }

  const image = gallery[0] || `assets/pens/${PLACEHOLDER_NAME}`;
  const variants = [];

  for (const variant of uniqueVariants(product.variants)) {
    variants.push({
      ...variant,
      image: variant.sourceImage
        ? await localizeImage(variant.sourceImage, `${id}-${slugify(variant.option1 || variant.title || variant.variantId)}`, downloadedImages)
        : "",
    });
    delete variants[variants.length - 1].sourceImage;
  }

  pens.push({
    id,
    name: product.name,
    releaseDate,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    image,
    images: gallery,
    handle: product.handle || id,
    description: product.description,
    tags: product.tags,
    collectionTitles: product.collectionTitles,
    product: {
      productId: product.productId,
      type: product.type,
      category: product.category,
      createdAt: product.createdAt,
      publishedAt: product.publishedAt,
    },
    variants,
  });
}

pens.sort((a, b) => {
  if (a.releaseDate && b.releaseDate && a.releaseDate !== b.releaseDate) {
    return b.releaseDate.localeCompare(a.releaseDate);
  }

  if (a.releaseDate && !b.releaseDate) return -1;
  if (!a.releaseDate && b.releaseDate) return 1;
  return a.name.localeCompare(b.name);
});

const archive = {
  updatedAt: new Date().toISOString(),
  source: path.basename(SOURCE_CSV),
  count: pens.length,
  pens,
};

await writeFile(JSON_OUTPUT, `${JSON.stringify(archive, null, 2)}\n`);
await writeFile(CSV_OUTPUT, buildCustomerCsv(pens));

console.log(`Wrote ${pens.length} pens to ${path.relative(ROOT, JSON_OUTPUT)}`);
console.log(`Wrote customer CSV to ${path.relative(ROOT, CSV_OUTPUT)}`);
console.log(`Images stored in ${path.relative(ROOT, IMAGE_DIR)}`);

async function localizeImage(sourceImage, id, downloadedImages) {
  if (!sourceImage) return `assets/pens/${PLACEHOLDER_NAME}`;
  if (downloadedImages.has(sourceImage)) return downloadedImages.get(sourceImage);

  try {
    const url = new URL(sourceImage);
    const originalExtension = path.extname(url.pathname).toLowerCase();
    const extension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(originalExtension)
      ? originalExtension
      : ".jpg";
    const fileName = sourceImage.includes("PhotoUnavailable")
      ? PLACEHOLDER_NAME
      : `${id}${extension}`;
    const outputPath = path.join(IMAGE_DIR, fileName);
    const relativePath = `assets/pens/${fileName}`;

    if (await fileExists(outputPath)) {
      downloadedImages.set(sourceImage, relativePath);
      return relativePath;
    }

    const response = await fetch(sourceImage);

    if (!response.ok) {
      console.warn(`Using placeholder for ${id}: ${response.status} ${sourceImage}`);
      return `assets/pens/${PLACEHOLDER_NAME}`;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);
    downloadedImages.set(sourceImage, relativePath);
    return relativePath;
  } catch {
    return `assets/pens/${PLACEHOLDER_NAME}`;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildCustomerCsv(pens) {
  const rows = [["Pen Name", "Release Date", "Year", "Handle", "Image"]];

  for (const pen of pens) {
    rows.push([
      pen.name,
      pen.releaseDate,
      pen.year || "",
      pen.handle,
      pen.image,
    ]);
  }

  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

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

function cleanImages(value) {
  return clean(value)
    .split(",")
    .map((image) => image.trim())
    .filter(Boolean);
}

function cleanImage(value) {
  return clean(value).split(",")[0].trim();
}

function normalizeDate(value) {
  if (!value) return "";

  const isoDate = clean(value).match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoDate) return isoDate[1];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function uniqueId(baseId, usedIds) {
  let id = baseId || "pen";
  let index = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  usedIds.add(id);
  return id;
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}
