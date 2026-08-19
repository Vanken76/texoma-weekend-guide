import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = new URL("https://texomaweekendguide.com/");
const DIST_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const SITEMAP_PATH = path.join(DIST_DIR, "sitemap.xml");
const MAX_URLS = 50_000;

const escapeXml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() || null;
};

const hasNoindex = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].some(({ 0: tag }) => {
  const name = getAttribute(tag, "name");
  const content = getAttribute(tag, "content");
  return name?.toLowerCase() === "robots" && /(?:^|[,\s])noindex(?:$|[,\s])/i.test(content || "");
});

const getCanonicalUrl = (html) => {
  for (const { 0: tag } of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = getAttribute(tag, "rel");
    if (!rel || !rel.toLowerCase().split(/\s+/).includes("canonical")) continue;
    const href = getAttribute(tag, "href");
    if (!href) continue;

    try {
      const url = new URL(href, SITE_URL);
      url.hash = "";
      url.search = "";
      return url;
    } catch {
      return null;
    }
  }
  return null;
};

const listHtmlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(absolute);
  }

  return files;
};

const shouldExcludeCanonical = (url) => {
  if (url.origin !== SITE_URL.origin) return true;
  if (/^\/admin(?:\/|-|$)/i.test(url.pathname)) return true;
  if (url.pathname === "/404" || url.pathname === "/404.html" || url.pathname === "/404/") return true;
  return false;
};

const htmlFiles = await listHtmlFiles(DIST_DIR);
if (!htmlFiles.length) throw new Error("Sitemap generation failed: no built HTML files found in dist/.");

const urls = new Set();

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  if (hasNoindex(html)) continue;

  const canonical = getCanonicalUrl(html);
  if (!canonical || shouldExcludeCanonical(canonical)) continue;
  urls.add(canonical.href);
}

if (!urls.size) throw new Error("Sitemap generation failed: no canonical indexable URLs were found.");
if (urls.size > MAX_URLS) {
  throw new Error(`Sitemap generation failed: ${urls.size} URLs exceed the single-sitemap limit of ${MAX_URLS}.`);
}

const sortedUrls = [...urls].sort((a, b) => {
  if (a === SITE_URL.href) return -1;
  if (b === SITE_URL.href) return 1;
  return a.localeCompare(b);
});

const xml = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
  ...sortedUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
  "</urlset>",
  ""
].join("\n");

await writeFile(SITEMAP_PATH, xml, "utf8");
console.log(`Generated sitemap.xml with ${sortedUrls.length} canonical indexable URLs.`);
