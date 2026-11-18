/* Build-time SEO, share pages and PNG previews for the standalone Index.
 * Source of truth remains the arrays inside index.html; adding a verified link
 * creates its share page, metadata, sitemap entry and preview on the next build.
 * Uses Node built-ins only, so the standalone Vercel project needs no packages.
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const ORIGIN = "https://index.chaos.fail";
const DESCRIPTION = "Find medical lectures, tutorials, CBLs, practical materials and Medics 44 questions by year, module and subject.";
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (value, limit = 150) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const slug = text => String(text).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "resource";
const pathFor = (kind, module, id) => kind === "questions" ? "/questions/q" + module + "-" + slug(id) : "/material/m" + module + "-" + slug(kind) + "-" + slug(id);
const metaJson = data => JSON.stringify(data).replace(/</g, "\\u003c");
const sourceUrl = record => typeof record[0] === "string" && /^ZatOona46\/\d+$/.test(record[0])
  ? "https://t.me/" + record[0]
  : "https://t.me/zatooona44/" + encodeURIComponent(String(record[0]));
const questionUrl = record => "https://t.me/medics_44_mcq/" + encodeURIComponent(String(record[0]));
function getArray(rawHtml, name) {
  // Normalize Windows CRLF checkouts; `;\n` terminators only exist in LF content.
  const html = rawHtml.replace(/\r\n/g, "\n");
  const prefix = "const " + name + "=";
  const start = html.indexOf(prefix);
  if (start === -1) throw new Error("Missing catalogue array " + name);
  const from = start + prefix.length;
  const end = html.indexOf(";\n", from);
  if (end === -1) throw new Error("Unterminated catalogue array " + name);
  return JSON.parse(html.slice(from, end));
}

// Tiny dependency-free 5x7 raster font, designed for English/category labels.
// Arabic titles are preserved in HTML, Open Graph text and structured data.
const GLYPHS = {
 "A":["01110","10001","10001","11111","10001","10001","10001"],
 "B":["11110","10001","10001","11110","10001","10001","11110"],
 "C":["01111","10000","10000","10000","10000","10000","01111"],
 "D":["11110","10001","10001","10001","10001","10001","11110"],
 "E":["11111","10000","10000","11110","10000","10000","11111"],
 "F":["11111","10000","10000","11110","10000","10000","10000"],
 "G":["01111","10000","10000","10111","10001","10001","01111"],
 "H":["10001","10001","10001","11111","10001","10001","10001"],
 "I":["11111","00100","00100","00100","00100","00100","11111"],
 "J":["00111","00010","00010","00010","10010","10010","01100"],
 "K":["10001","10010","10100","11000","10100","10010","10001"],
 "L":["10000","10000","10000","10000","10000","10000","11111"],
 "M":["10001","11011","10101","10101","10001","10001","10001"],
 "N":["10001","11001","10101","10011","10001","10001","10001"],
 "O":["01110","10001","10001","10001","10001","10001","01110"],
 "P":["11110","10001","10001","11110","10000","10000","10000"],
 "Q":["01110","10001","10001","10001","10101","10010","01101"],
 "R":["11110","10001","10001","11110","10100","10010","10001"],
 "S":["01111","10000","10000","01110","00001","00001","11110"],
 "T":["11111","00100","00100","00100","00100","00100","00100"],
 "U":["10001","10001","10001","10001","10001","10001","01110"],
 "V":["10001","10001","10001","10001","10001","01010","00100"],
 "W":["10001","10001","10001","10101","10101","10101","01010"],
 "X":["10001","10001","01010","00100","01010","10001","10001"],
 "Y":["10001","10001","01010","00100","00100","00100","00100"],
 "Z":["11111","00001","00010","00100","01000","10000","11111"],
 "0":["01110","10011","10101","10101","11001","10001","01110"],
 "1":["00100","01100","00100","00100","00100","00100","01110"],
 "2":["11110","00001","00001","01110","10000","10000","11111"],
 "3":["11110","00001","00001","01110","00001","00001","11110"],
 "4":["10010","10010","10010","11111","00010","00010","00010"],
 "5":["11111","10000","10000","11110","00001","00001","11110"],
 "6":["01111","10000","10000","11110","10001","10001","01110"],
 "7":["11111","00001","00010","00100","01000","01000","01000"],
 "8":["01110","10001","10001","01110","10001","10001","01110"],
 "9":["01110","10001","10001","01111","00001","00001","11110"],
 "-":["00000","00000","00000","11111","00000","00000","00000"],
 "/":["00001","00001","00010","00100","01000","10000","10000"],
 ".":["00000","00000","00000","00000","00000","01100","01100"],
 "&":["01100","10010","10100","01000","10101","10010","01101"],
 ":":["00000","01100","01100","00000","01100","01100","00000"],
 " ":["00000","00000","00000","00000","00000","00000","00000"]
};
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const CRC_TABLE = Array.from({ length: 256 }, (_, idx) => {
  let c = idx;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crcBytes = Buffer.concat([name, bytes]);
  let crc = 0xffffffff;
  for (const b of crcBytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, crcBytes, checksum]);
}
function png(label, category, detail) {
  const width = 1200, height = 630, stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  const setPixel = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * stride + 1 + x * 3;
    pixels[p] = rgb[0]; pixels[p + 1] = rgb[1]; pixels[p + 2] = rgb[2];
  };
  const base = Buffer.alloc(width * 3);
  for (let i = 0; i < base.length; i += 3) { base[i] = 24; base[i + 1] = 25; base[i + 2] = 27; }
  const raised = Buffer.from(base);
  for (let i = 0; i < raised.length; i += 3) { raised[i] = 31; raised[i + 1] = 32; raised[i + 2] = 34; }
  for (let y = 0; y < height; y++) (y < 15 || y > 544 ? raised : base).copy(pixels, y * stride + 1);
  const write = (value, x, y, scale = 6, color = [229, 229, 225], max = 35) => {
    const ascii = String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toUpperCase().slice(0, max);
    for (let i = 0; i < ascii.length; i++) {
      const glyph = GLYPHS[ascii[i]] || GLYPHS[" "];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== "1") continue;
        for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) setPixel(x + (i * 6 + col) * scale + xx, y + row * scale + yy, color);
      }
    }
  };
  write("CHAOS INDEX", 70, 75, 5, [184, 184, 180], 30);
  write(label, 70, 220, 8, [242, 242, 238], 21);
  write(category, 72, 355, 5, [179, 181, 184], 36);
  write(detail, 72, 445, 4, [146, 149, 153], 48);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(pixels, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}
const css = ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#121212;color:#ededed;font:16px/1.55 system-ui,"Segoe UI",sans-serif}main{width:min(100% - 40px,780px);margin:0 auto;padding:55px 0 100px}a{color:#e2e2e2;text-underline-offset:4px}a:focus-visible{outline:3px solid #aab9d1;outline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:45px;font-size:14px}h1{font-size:clamp(27px,5vw,42px);line-height:1.2;letter-spacing:-.03em}h2{font-size:21px}p,.muted,small{color:#b1b1b1}li{padding:8px 0;border-bottom:1px solid #303030}li a{display:inline-block}ul{padding-left:23px}.action{display:inline-block;background:#272727;border:1px solid #525252;border-radius:7px;padding:12px 19px;margin:14px 0;text-decoration:none;min-height:44px}.action:hover{background:#383838}.tag{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#aab0b5}.metadata{margin:22px 0;padding:14px 18px;border:1px solid #3d3d3d;border-radius:8px;background:#1a1a1a}a:active{opacity:.8}@media(prefers-color-scheme:light){:root{color-scheme:light}body{background:#fafaf8;color:#242424}a{color:#252525}p,.muted,small{color:#676767}li{border-color:#e1e1df}.metadata{background:#fff;border-color:#ddd}.action{background:#fff;border-color:#ccc}.action:hover{background:#eee}}';
function head(title, description, url, image, schema, robots = "index,follow,max-image-preview:large") {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escape(title) + '</title><meta name="description" content="' + escape(description) + '">' +
    '<meta name="robots" content="' + robots + '">' +
    '<link rel="canonical" href="' + escape(url) + '">' +
    '<meta property="og:type" content="article"><meta property="og:site_name" content="Chaos Index">' +
    '<meta property="og:title" content="' + escape(title) + '"><meta property="og:description" content="' + escape(description) + '">' +
    '<meta property="og:url" content="' + escape(url) + '"><meta property="og:image" content="' + escape(image) + '">' +
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="' + escape(title) + '">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + escape(title) + '">' +
    '<meta name="twitter:description" content="' + escape(description) + '"><meta name="twitter:image" content="' + escape(image) + '">' +
    '<script type="application/ld+json">' + metaJson(schema) + '</script><style>' + css + '</style></head><body>';
}
function crumb(items) {
  return { "@type": "BreadcrumbList", itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) };
}
function makeSchema(title, description, url, moduleUrl, moduleName, type, date) {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "LearningResource", name: title, description, url, learningResourceType: type, isAccessibleForFree: true, inLanguage: ["en", "ar"], ...(date ? { datePublished: date } : {}) },
    crumb([["Index", ORIGIN + "/"], [moduleName, ORIGIN + moduleUrl], [title, url]])
  ] };
}
function sitemapEntry(path, date) {
  return "<url><loc>" + escape(ORIGIN + path) + "</loc>" + (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? "<lastmod>" + date + "</lastmod>" : "") + "</url>";
}
export async function buildSeo(root, output) {
  const source = await readFile(join(root, "index.html"), "utf8");
  const M = getArray(source, "M"), D = getArray(source, "D"), Q = getArray(source, "Q");
  await Promise.all(["og", "module", "material", "questions"].map(p => mkdir(join(output, p), { recursive: true })));
  const list = [sitemapEntry("/")];
  const modulePaths = M.map((m, i) => "/module/" + (i + 1) + "-" + slug(m[0]));
  const moduleLists = M.map(() => []);
  const pages = [];
  const images = [];
  const addPage = (p, body, image) => { pages.push([join(output, p.slice(1) + ".html"), body]); images.push([join(output, "og", p.slice(1).replace(/\//g, "-") + ".png"), image]); };
  const addRecord = (entry, kind) => {
    const i = entry[1], m = M[i], isQuestion = kind === "questions";
    if (!m) throw new Error("Invalid module index for share page");
    const type = isQuestion ? "Questions" : (entry[3][0].toUpperCase() + entry[3].slice(1));
    const title = short(isQuestion ? entry[5] || "Practice questions" : entry[4] || entry[5] || type, 145);
    const subject = short(entry[2], 70);
    const path = pathFor(kind, i, entry[0]), url = ORIGIN + path;
    const src = isQuestion ? questionUrl(entry) : sourceUrl(entry);
    const image = ORIGIN + "/og/" + path.slice(1).replace(/\//g, "-") + ".png";
    const description = short(type + " · " + subject + " · Year " + m[1] + " · " + m[0] + ". Original Telegram study source.", 175);
    const date = !isQuestion && /^\d{4}-\d{2}-\d{2}$/.test(entry[6]) ? entry[6] : "";
    const html = head(title + " · Chaos Index", description, url, image, makeSchema(title, description, url, modulePaths[i], m[0], type, date), "noindex,follow") +
      '<main><nav aria-label="Breadcrumb"><a href="/">Index</a><span aria-hidden="true"> / </span><a href="' + modulePaths[i] + '">' + escape(m[0]) + '</a></nav>' +
      '<div class="tag">Year ' + m[1] + ' · ' + escape(type) + '</div><h1 dir="auto">' + escape(title) + '</h1>' +
      '<p dir="auto">' + escape(subject) + ' · ' + escape(m[0]) + '</p>' +
      '<div class="metadata"><p>Open the original material on Telegram. Chaos Index links to the source; files are not rehosted here.</p>' +
      '<a class="action" href="' + escape(src) + '" target="_blank" rel="noopener noreferrer">Open original ' + escape(type.toLowerCase()) + '</a></div>' +
      '<p><a href="/">Browse the full index</a></p></main></body></html>';
    addPage(path, html, png(subject, "YEAR " + m[1] + " / " + m[0], type + " / " + entry[0]));
    moduleLists[i].push({ path, title, type, subject });
  };
  for (const entry of D) addRecord(entry, String(entry[3]));
  for (const entry of Q) addRecord(entry, "questions");
  for (let i = 0; i < M.length; i++) {
    const m = M[i], path = modulePaths[i], url = ORIGIN + path, image = ORIGIN + "/og/" + path.slice(1).replace(/\//g, "-") + ".png";
    const description = "Year " + m[1] + " " + m[0] + " lectures, tutorials, practical resources and questions.";
    const schema = { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: m[0], description, url, isPartOf: ORIGIN + "/" },
      crumb([["Index", ORIGIN + "/"], [m[0], url]])
    ] };
    const rows = moduleLists[i].map(item => '<li><span class="tag">' + escape(item.type) + '</span> — <a href="' + item.path + '" dir="auto">' + escape(item.title) + '</a> <small>· ' + escape(item.subject) + '</small></li>').join("");
    addPage(path, head(m[0] + " · Chaos Index", description, url, image, schema) +
      '<main><nav aria-label="Breadcrumb"><a href="/">Index</a></nav><div class="tag">Year ' + m[1] + '</div><h1>' + escape(m[0]) +
      '</h1><p>' + escape(moduleLists[i].length) + ' verified source links and question sets.</p><ul>' + rows +
      '</ul><p><a href="/">Return to index</a></p></main></body></html>',
      png(m[0], "YEAR " + m[1] + " / STUDY MATERIAL", "LECTURES / TUTORIALS / QUESTIONS"));
    list.push(sitemapEntry(path));
  }
  images.push([join(output, "og", "index.png"), png("MEDICAL STUDY", "CHAOS INDEX", "LECTURES / QUESTIONS / PRACTICAL")]);
  const jobs = [...pages, ...images];
  // Batch writes to avoid exceeding open-file limits on Vercel build machines.
  for (let at = 0; at < jobs.length; at += 32) await Promise.all(jobs.slice(at, at + 32).map(([file, data]) => writeFile(file, data)));
  const homeSchema = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Chaos Index", description: DESCRIPTION, url: ORIGIN + "/", isAccessibleForFree: true, inLanguage: ["en", "ar"] };
  let home = source.replace('<meta name="robots" content="noindex">', '<meta name="robots" content="index,follow,max-image-preview:large">')
    .replace('<meta name="description" content="Chaos Index: medical module learning materials and practice questions.">',
      '<meta name="description" content="' + escape(DESCRIPTION) + '">')
    .replace("<title>Chaos Index</title>", "<title>Chaos Index · Medical lectures and questions</title>");
  const extras = '<link rel="canonical" href="' + ORIGIN + '/">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Chaos Index">' +
    '<meta property="og:title" content="Chaos Index · Medical lectures and questions">' +
    '<meta property="og:description" content="' + escape(DESCRIPTION) + '"><meta property="og:url" content="' + ORIGIN + '/">' +
    '<meta property="og:image" content="' + ORIGIN + '/og/index.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta property="og:image:alt" content="Chaos Index medical study library">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + ORIGIN + '/og/index.png">' +
    '<script type="application/ld+json">' + metaJson(homeSchema) + '</script>';
  home = home.replace("</head>", extras + "</head>");
  await Promise.all([
    writeFile(join(output, "index.html"), home),
    writeFile(join(output, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + list.join("") + "</urlset>"),
    writeFile(join(output, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /offline\nSitemap: " + ORIGIN + "/sitemap.xml\n")
  ]);
  for (const name of ["404.html", "500.html", "offline.html", "offline-game.js", "index-enhance.js"]) {
    await copyFile(join(root, name), join(output, name));
  }
  console.log("Index SEO: generated " + (D.length + Q.length) + " material pages, " + M.length + " module pages and matching OG images.");
}
