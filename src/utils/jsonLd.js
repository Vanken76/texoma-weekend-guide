const DEFAULT_SITE_URL = "https://texomaweekendguide.com/";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const isPlainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && !(value instanceof Date);

export const normalizeSiteUrl = (siteUrl = DEFAULT_SITE_URL) => {
  try {
    const url = siteUrl instanceof URL ? new URL(siteUrl.href) : new URL(String(siteUrl || DEFAULT_SITE_URL));
    if (!HTTP_PROTOCOLS.has(url.protocol)) return new URL(DEFAULT_SITE_URL);
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return url;
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
};

export const toAbsoluteUrl = (value, siteUrl = DEFAULT_SITE_URL) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  try {
    const url = new URL(raw, normalizeSiteUrl(siteUrl));
    return HTTP_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const toAbsoluteUrlList = (values, siteUrl = DEFAULT_SITE_URL) => {
  const input = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(input.map((value) => toAbsoluteUrl(value, siteUrl)).filter(Boolean))];
};

export const buildSchemaId = (pathOrUrl, fragment, siteUrl = DEFAULT_SITE_URL) => {
  const absolute = toAbsoluteUrl(pathOrUrl, siteUrl);
  if (!absolute) return null;

  const url = new URL(absolute);
  if (fragment) url.hash = String(fragment).replace(/^#/, "");
  return url.href;
};

export const pruneJsonLd = (value) => {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();

  if (Array.isArray(value)) {
    const cleaned = value.map(pruneJsonLd).filter((item) => item !== undefined);
    return cleaned.length ? cleaned : undefined;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, pruneJsonLd(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return undefined;
};

export const withSchemaContext = (node) => {
  const cleaned = pruneJsonLd(node);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) return null;
  return { "@context": "https://schema.org", ...cleaned };
};

export const serializeJsonLd = (value) => {
  const cleaned = pruneJsonLd(value);
  if (cleaned === undefined) return "";

  return JSON.stringify(cleaned)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
};

export const jsonLdScriptProps = (value) => ({
  type: "application/ld+json",
  content: serializeJsonLd(value)
});

export { DEFAULT_SITE_URL };
