/**
 * Regenerates the raster brand images from SVG:
 *   src/app/apple-icon.png  (180×180, home-screen icon on iOS)
 *   src/app/favicon.ico     (16/32/48, what browsers ask for by default)
 *   public/og.png           (1200×630, default link preview)
 *
 * Run once after changing the artwork: `node scripts/brand-images.mjs`.
 * The admin can replace the link preview from /admin/site without this.
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const icon = await readFile("src/app/icon.svg");
await writeFile(
  "src/app/apple-icon.png",
  await sharp(icon, { density: 400 }).resize(180, 180).png().toBuffer(),
);

// An ICO is a small directory of images; since Windows Vista each entry may
// simply be a PNG, which every current browser reads.
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((size) => sharp(icon, { density: 400 }).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(pngs[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[index].length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...pngs]));

const hat =
  '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>';
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.78" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#d98c1f" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#d98c1f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="1" r="0.6">
      <stop offset="0" stop-color="#26a08a" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#26a08a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#141211"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>
  <rect x="960" y="90" width="150" height="150" rx="34" fill="#d98c1f"/>
  <g transform="translate(990 120) scale(3.75)" fill="none" stroke="#141211" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${hat}</g>
  <text x="1110" y="380" text-anchor="start" font-family="Tahoma, 'Segoe UI', sans-serif" font-weight="700" font-size="104" fill="#ffffff" direction="rtl">رستوکار</text>
  <text x="1110" y="460" text-anchor="start" font-family="Tahoma, 'Segoe UI', sans-serif" font-size="40" fill="#d6d3d1" direction="rtl">منوی دیجیتال، سفارش‌گیری و گزارش سود رستوران</text>
  <text x="90" y="560" font-family="'Segoe UI', Arial, sans-serif" font-size="34" fill="#d98c1f">restokar.ir</text>
</svg>`;
await writeFile("public/og.png", await sharp(Buffer.from(og)).png().toBuffer());
process.stdout.write("wrote apple-icon.png, favicon.ico and public/og.png\n");
