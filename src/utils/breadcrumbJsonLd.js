import {
  buildSchemaId,
  pruneJsonLd,
  toAbsoluteUrl,
  withSchemaContext
} from "./jsonLd.js";

const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

export const buildBreadcrumbJsonLd = ({ items = [], siteUrl } = {}) => {
  const normalizedItems = asArray(items)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const url = toAbsoluteUrl(item.url || item.item, siteUrl);
      if (!name) return null;

      return pruneJsonLd({
        "@type": "ListItem",
        position: index + 1,
        name,
        item: url
      }) || null;
    })
    .filter(Boolean);

  if (normalizedItems.length < 2) return null;

  const canonicalItem = normalizedItems.at(-1)?.item || normalizedItems.at(-2)?.item || "/";

  return withSchemaContext({
    "@type": "BreadcrumbList",
    "@id": buildSchemaId(canonicalItem, "breadcrumb", siteUrl),
    itemListElement: normalizedItems
  });
};
