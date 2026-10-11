/**
 * Binds the screenshots into one PDF: a cover, a table of contents, then every
 * desktop capture followed by every mobile capture, one per page, each page
 * cut to the screenshot's own proportions so nothing is cropped or squashed.
 *
 *   node screenshots/scripts/build-pdf.mjs        (from core/, after capture.mjs)
 *
 * Reads screenshots/manifest.json; writes screenshots/platform-screenshots.pdf
 * (screenshots embedded as quality-88 JPEG; the PNGs in the folder are the
 * lossless originals).
 * Also checks every image: a capture that is missing, empty or a single flat
 * colour is reported and the script exits non-zero.
 */
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const core = path.resolve(root, "..");
const require = createRequire(path.join(core, "package.json"));
const { chromium } = require("playwright");

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const logo = readFileSync(path.join(core, "src/app/icon.svg"), "utf8");

/** Width and height from a PNG's header. */
function pngSize(file) {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// ------------------------------------------------------------ the pages

const SECTIONS = [
  { kind: "desktop", label: "Desktop", detail: "1440 × 900 browser window", width: 297 },
  { kind: "mobile", label: "Mobile", detail: "390 × 844 phone screen", width: 150 },
];
const MARGIN = 8; // mm
const BAND = 13; // mm, the title above each screenshot
const MAX_HEIGHT = 5000; // mm; PDF pages top out at 200 in (5080 mm)

const shots = [];
const missing = [];
for (const section of SECTIONS) {
  for (const record of manifest.filter((r) => r.kind === section.kind)) {
    const file = path.join(root, section.kind, record.file);
    if (!existsSync(file)) {
      missing.push({ ...record, why: record.notes.join("; ") || "no file" });
      continue;
    }
    const { w, h } = pngSize(file);
    const inner = section.width - 2 * MARGIN;
    let imgW = inner;
    let imgH = (inner * h) / w;
    const room = MAX_HEIGHT - 2 * MARGIN - BAND;
    if (imgH > room) {
      imgW = (imgW * room) / imgH;
      imgH = room;
    }
    shots.push({
      ...record,
      section,
      src: `${section.kind}/${record.file}`,
      px: { w, h },
      imgW,
      imgH,
      pageH: Math.ceil(2 * MARGIN + BAND + imgH + 1),
    });
  }
}

// Page numbers are fixed by the layout: cover, contents, then for each
// section a divider page and one page per screenshot, then the notes page.
const ROWS_PER_TOC_PAGE = 36;
const tocRows = [];
for (const section of SECTIONS) {
  tocRows.push({ header: section });
  for (const shot of shots.filter((s) => s.section === section)) tocRows.push({ shot });
}
if (missing.length) tocRows.push({ notes: true });
const tocPages = Math.ceil(tocRows.length / ROWS_PER_TOC_PAGE);

let pageNo = 1 + tocPages;
for (const section of SECTIONS) {
  section.page = ++pageNo;
  for (const shot of shots.filter((s) => s.section === section)) shot.page = ++pageNo;
}
const notesPage = missing.length ? ++pageNo : null;

const now = new Date();
const dateEn = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "Asia/Tehran",
}).format(now);
const dateFa = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "long",
  timeZone: "Asia/Tehran",
}).format(now);
const time = new Intl.DateTimeFormat("en-GB", {
  timeStyle: "short",
  timeZone: "Asia/Tehran",
}).format(now);

const pageRules = shots
  .map((s, i) => `@page s${i} { size: ${s.section.width}mm ${s.pageH}mm; margin: 0; }`)
  .join("\n");

const tocHtml = [];
for (let p = 0; p < tocPages; p += 1) {
  const rows = tocRows.slice(p * ROWS_PER_TOC_PAGE, (p + 1) * ROWS_PER_TOC_PAGE);
  tocHtml.push(`<section class="sheet a4 toc">
  <h2>Contents${tocPages > 1 ? ` <span>${p + 1} / ${tocPages}</span>` : ""}</h2>
  <ol>${rows
    .map((row) => {
      if (row.header) {
        return `<li class="head"><a href="#${row.header.kind}">${row.header.label} <small>${row.header.detail}</small></a><b>${row.header.page}</b></li>`;
      }
      if (row.notes) {
        return `<li class="head"><a href="#notes">Pages that could not be captured</a><b>${notesPage}</b></li>`;
      }
      const s = row.shot;
      const flag = s.status === "ok" ? "" : ` <em>(see note)</em>`;
      return `<li><a href="#${s.section.kind}-${s.file}"><i>${s.file.slice(0, 2)}</i>${escape(s.title)}${flag}</a><b>${s.page}</b></li>`;
    })
    .join("\n")}</ol>
</section>`);
}

const bodyHtml = [];
for (const section of SECTIONS) {
  const count = shots.filter((s) => s.section === section).length;
  bodyHtml.push(`<section class="sheet a4 divider" id="${section.kind}">
  <p class="kicker">Part ${SECTIONS.indexOf(section) + 1}</p>
  <h2>${section.label}</h2>
  <p>${section.detail} · ${count} screenshots</p>
</section>`);
  shots.forEach((s, i) => {
    if (s.section !== section) return;
    const notes = s.notes.length
      ? `<span class="note">${escape(s.notes.join("; "))}</span>`
      : "";
    bodyHtml.push(`<section class="sheet shot" style="page: s${i}" id="${s.section.kind}-${s.file}">
  <header><strong>${escape(s.title)}</strong><span>${section.label} · ${s.file} · ${escape(s.url)}</span>${notes}<b>${s.page}</b></header>
  <img src="${s.src}" style="width:${s.imgW.toFixed(2)}mm;height:${s.imgH.toFixed(2)}mm" alt="">
</section>`);
  });
}

const notesHtml = missing.length
  ? `<section class="sheet a4 toc" id="notes">
  <h2>Pages that could not be captured</h2>
  <ul class="missing">${missing
    .map(
      (m) =>
        `<li><strong>${escape(m.title)}</strong> (${m.kind}) — ${escape(m.why)}<br><code>${escape(m.url)}</code></li>`,
    )
    .join("")}</ul>
</section>`
  : "";

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Restokar — platform screenshots</title>
<style>
@page { size: 210mm 297mm; margin: 0; }
${pageRules}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Segoe UI", Tahoma, sans-serif; color: #141211; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { break-after: page; position: relative; overflow: hidden; }
.sheet:last-child { break-after: auto; }
.a4 { width: 210mm; height: 297mm; padding: 22mm 20mm; }

.cover { background: #141211; color: #f6efe4; display: flex; flex-direction: column; justify-content: space-between; padding: 26mm 22mm; }
.cover .logo { width: 22mm; height: 22mm; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 0 0 6mm; font-weight: 700; }
.cover h1 span { color: #d98c1f; }
.cover .lead { font-size: 13pt; line-height: 1.5; color: #d9cfc0; max-width: 150mm; margin: 0; }
.cover dl { display: grid; grid-template-columns: 38mm 1fr; gap: 3mm 6mm; font-size: 10.5pt; margin: 0; }
.cover dt { color: #a99c8a; }
.cover dd { margin: 0; }
.cover .fa { font-family: "Segoe UI", Tahoma, sans-serif; direction: rtl; unicode-bidi: isolate; }
.cover .bar { height: 2mm; background: #d98c1f; width: 30mm; margin-bottom: 8mm; }

.toc h2 { font-size: 20pt; margin: 0 0 8mm; }
.toc h2 span { font-size: 10pt; color: #8a7f70; font-weight: 400; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { display: flex; align-items: baseline; height: 6.4mm; font-size: 9.6pt; border-bottom: 0.2mm dotted #d8cfc2; }
.toc li a { flex: 1; color: inherit; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toc li i { font-style: normal; color: #8a7f70; display: inline-block; width: 8mm; font-variant-numeric: tabular-nums; }
.toc li b { font-weight: 400; color: #8a7f70; font-variant-numeric: tabular-nums; padding-left: 4mm; }
.toc li em { color: #b4561f; font-style: normal; font-size: 8.5pt; }
.toc li.head { height: 9mm; align-items: flex-end; padding-bottom: 1mm; font-size: 11.5pt; font-weight: 700; border-bottom: 0.4mm solid #d98c1f; margin-top: 2mm; }
.toc li.head small { font-weight: 400; color: #8a7f70; font-size: 9pt; margin-left: 2mm; }
.toc li.head b { font-weight: 700; color: #141211; }
.missing { font-size: 10pt; line-height: 1.5; padding-left: 5mm; }
.missing li { margin-bottom: 3mm; }
.missing code { color: #8a7f70; font-size: 9pt; }

.divider { display: flex; flex-direction: column; justify-content: center; background: #f6efe4; }
.divider .kicker { color: #b4741a; font-size: 11pt; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 3mm; }
.divider h2 { font-size: 40pt; margin: 0 0 4mm; }
.divider p { font-size: 12pt; color: #5a5146; margin: 0; }

.shot { padding: ${MARGIN}mm; background: #ffffff; }
.shot header { height: ${BAND}mm; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 3mm; overflow: hidden; padding-right: 10mm; position: relative; }
.shot header strong { font-size: 10.5pt; }
.shot header span { font-size: 7.5pt; color: #8a7f70; }
.shot header .note { color: #b4561f; width: 100%; font-size: 7pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shot header b { position: absolute; right: 0; top: 0; font-weight: 400; font-size: 8pt; color: #8a7f70; }
.shot img { display: block; margin: 0 auto; outline: 0.2mm solid #e4ddd2; }
</style></head><body>
<section class="sheet a4 cover">
  <div>
    <div class="logo">${logo}</div>
  </div>
  <div>
    <div class="bar"></div>
    <h1>Restokar<br><span>Platform screenshots</span></h1>
    <p class="lead">Every page of the restaurant-owner dashboard and the restaurant's public menu, as seen by a signed-in owner on an active subscription.</p>
  </div>
  <dl>
    <dt>Date</dt><dd>${dateEn}, ${time} Tehran · <span class="fa">${dateFa}</span></dd>
    <dt>Account</dt><dd>Demo owner of <span class="fa">«پیتزا تنور»</span> (pizza chain, 4 sites)</dd>
    <dt>Subscription</dt><dd>Chain plan (highest tier), active</dd>
    <dt>Captured</dt><dd>${shots.filter((s) => s.section.kind === "desktop").length} desktop + ${shots.filter((s) => s.section.kind === "mobile").length} mobile screenshots</dd>
    <dt>Language</dt><dd>Persian (the app's default), right-to-left</dd>
    <dt>Data</dt><dd>Local demo data only (npm run db:seed:demo); no real customers</dd>
  </dl>
</section>
${tocHtml.join("\n")}
${bodyHtml.join("\n")}
${notesHtml}
</body></html>`;

const htmlPath = path.join(root, "platform-screenshots.html");
writeFileSync(htmlPath, html);

// ------------------------------------------------------------ check + print

// file:// pages count as one origin here, so the canvas check may read pixels.
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--allow-file-access-from-files"],
});
const tab = await browser.newPage();
await tab.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await tab.evaluate(() => document.fonts.ready);

// Every image must have loaded and must not be one flat colour.
const checks = await tab.evaluate(async () => {
  const out = [];
  for (const img of document.querySelectorAll(".shot img")) {
    await img.decode().catch(() => {});
    const id = img.closest("section").id;
    if (!img.naturalWidth) {
      out.push({ id, problem: "image did not load" });
      continue;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = Math.max(1, Math.round((120 * img.naturalHeight) / img.naturalWidth));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += y;
      sq += y * y;
    }
    const sd = Math.sqrt(sq / n - (sum / n) ** 2);
    if (sd < 6) out.push({ id, problem: `looks blank (contrast ${sd.toFixed(1)})` });
  }
  return out;
});

// The PNGs stay lossless in the folder; the PDF carries high-quality JPEG
// copies, which keeps it a size that can be emailed (≈ a third of the PNGs).
await tab.evaluate(async () => {
  for (const img of document.querySelectorAll(".shot img")) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    img.src = canvas.toDataURL("image/jpeg", 0.88);
    await img.decode();
  }
});

const pdfPath = path.join(root, "platform-screenshots.pdf");
await tab.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
await browser.close();
rmSync(htmlPath);

const pages = (readFileSync(pdfPath, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? [])
  .length;
console.log(`PDF: ${pdfPath}`);
console.log(
  `     ${pages} pages (expected ${pageNo}), ${(statSync(pdfPath).size / 1e6).toFixed(1)} MB`,
);
console.log(`     ${shots.length} screenshots, ${missing.length} not captured`);
for (const m of missing) console.log(`  missing  ${m.kind} ${m.file}: ${m.why}`);
for (const c of checks) console.log(`  CHECK    ${c.id}: ${c.problem}`);
const flagged = manifest.filter((r) => r.status === "problem");
for (const r of flagged)
  console.log(`  flagged  ${r.kind} ${r.file}: ${r.notes.join("; ")}`);
process.exitCode = checks.length || missing.length || pages !== pageNo ? 1 : 0;
