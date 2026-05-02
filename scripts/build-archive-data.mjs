import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHEET_ID = "1ODiDNe9V6n56ipXfhEawY_QKi7aY6HwIzw1wuLyO-kE";
const RANGE = "A1:AX1000";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const IMAGE_DIR = path.join(ROOT, "assets", "pens");
const OUTPUT_FILE = path.join(DATA_DIR, "pens.json");
const PLACEHOLDER_NAME = "photo-unavailable.jpg";

const sheetUrl = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
sheetUrl.searchParams.set("tqx", "out:json");
sheetUrl.searchParams.set("range", RANGE);

await mkdir(DATA_DIR, { recursive: true });
await mkdir(IMAGE_DIR, { recursive: true });

const sheet = await fetchSheet(sheetUrl);
const pens = [];
const usedSlugs = new Map();
const downloadedImages = new Map();

for (const [index, tableRow] of sheet.table.rows.entries()) {
  const row = tableRow.c || [];
  const name = cleanText(getCell(row, 1));
  const sourceImage = cleanImage(getCell(row, 12));
  const releaseDate = normalizeDate(getCell(row, 47));

  if (!name || !sourceImage) continue;

  const baseSlug = slugify(name) || `pen-${index + 1}`;
  const slug = uniqueSlug(baseSlug, usedSlugs);
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
  const image = await localizeImage(sourceImage, slug, downloadedImages);

  pens.push({
    id: slug,
    name,
    releaseDate,
    year,
    image,
  });
}

pens.sort((a, b) => {
  if (a.releaseDate && b.releaseDate && a.releaseDate !== b.releaseDate) {
    return b.releaseDate.localeCompare(a.releaseDate);
  }

  return a.name.localeCompare(b.name);
});

await writeFile(`${OUTPUT_FILE}`, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  count: pens.length,
  pens,
}, null, 2)}\n`);

console.log(`Wrote ${pens.length} pens to ${path.relative(ROOT, OUTPUT_FILE)}`);
console.log(`Images stored in ${path.relative(ROOT, IMAGE_DIR)}`);

async function fetchSheet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch sheet: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const json = text
    .replace(/^\/\*O_o\*\/\s*/, "")
    .replace(/^google\.visualization\.Query\.setResponse\(/, "")
    .replace(/\);?\s*$/, "");

  const data = JSON.parse(json);
  if (data.status !== "ok" || !data.table?.rows) {
    throw new Error("Sheet response did not include archive rows.");
  }

  return data;
}

async function localizeImage(sourceImage, slug, downloadedImages) {
  if (downloadedImages.has(sourceImage)) {
    return downloadedImages.get(sourceImage);
  }

  const url = new URL(sourceImage);
  const originalExtension = path.extname(url.pathname).toLowerCase();
  const extension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(originalExtension)
    ? originalExtension
    : ".jpg";
  const fileName = sourceImage.includes("PhotoUnavailable")
    ? PLACEHOLDER_NAME
    : `${slug}${extension}`;
  const outputPath = path.join(IMAGE_DIR, fileName);
  const relativePath = `assets/pens/${fileName}`;

  const response = await fetch(sourceImage);
  if (!response.ok) {
    console.warn(`Using placeholder for ${slug}: ${response.status} ${sourceImage}`);
    return `assets/pens/${PLACEHOLDER_NAME}`;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
  downloadedImages.set(sourceImage, relativePath);
  return relativePath;
}

function getCell(row, index) {
  const cell = row[index];
  if (!cell) return "";
  return cell.f || cell.v || "";
}

function cleanText(value) {
  return value ? String(value).trim() : "";
}

function cleanImage(value) {
  return cleanText(value).split(",")[0].trim();
}

function normalizeDate(value) {
  if (!value) return "";

  const text = String(value);
  const googleDate = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);

  if (googleDate) {
    const year = Number(googleDate[1]);
    const month = Number(googleDate[2]) + 1;
    const day = Number(googleDate[3]);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(baseSlug, usedSlugs) {
  const count = usedSlugs.get(baseSlug) || 0;
  usedSlugs.set(baseSlug, count + 1);
  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
}
