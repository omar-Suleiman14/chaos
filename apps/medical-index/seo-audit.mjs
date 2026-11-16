/* Standalone deployment health gate. Run after node build.mjs. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "dist");
const read = p => readFile(join(out, p), "utf8");
const page = await read("index.html");
const map = await read("sitemap.xml");
const robots = await read("robots.txt");
assert.match(page, /<h1 class="sr-only-index">/, "Home needs a server-rendered heading");
assert.match(page, /name="robots" content="index,follow,max-image-preview:large"/);
assert.match(page, /rel="canonical" href="https:\/\/index\.chaos\.fail\/"/);
assert.match(page, /property="og:image" content="https:\/\/index\.chaos\.fail\/og\/index\.png"/);
assert.match(page, /application\/ld\+json/);
assert.match(page, /src="\/index-enhance\.js"/);
assert.doesNotMatch(page, /name="robots" content="noindex"/);
assert.match(robots, /^Sitemap: https:\/\/index\.chaos\.fail\/sitemap\.xml$/m);
assert.match(robots, /^Disallow: \/admin$/m);
assert.match(await read("admin/index.html"), /noindex,nofollow/);
assert.match(await read("404.html"), /This page doesn't exist/);
assert.match(await read("500.html"), /This page couldn't load/);
assert.match(await read("offline.html"), /id="offlineGame"/);
assert.match(await read("module/1-general-anatomy-histology.html"), /CollectionPage/);
assert.match(await read("material/m0-lecture-37.html"), /LearningResource/);
assert.match(await read("questions/q0-88.html"), /medics_44_mcq/);
const entries = [...map.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
// The catalogue changes daily; never hardcode the material count.
const source = await readFile("index.html", "utf8");
function count(name) {
  const begin = source.indexOf("const " + name + "=");
  assert.ok(begin !== -1);
  const from = begin + name.length + 7;
  const end = source.indexOf(";\\n", from);
  return JSON.parse(source.slice(from, end)).length;
}
assert.equal(entries.length, 1 + count("M") + count("D") + count("Q"), "Every catalogue item should have a crawlable page");
assert.equal(new Set(entries).size, entries.length, "Canonical URLs must be unique");
for (const file of ["og/index.png", "og/module-1-general-anatomy-histology.png", "og/material-m0-lecture-37.png", "og/questions-q0-88.png"]) {
  const bytes = await readFile(join(out, file));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  assert.ok((await stat(join(out, file))).size > 1000);
}
console.log("Index SEO, accessibility baseline, error routes and PNG previews passed.");
