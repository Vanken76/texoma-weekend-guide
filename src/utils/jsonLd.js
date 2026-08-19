const DEFAULT_SITE_URL = "https://texomaweekendguide.com/";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const EVENT_STATUS_URLS = {
  canceled: "https://schema.org/EventCancelled",
  postponed: "https://schema.org/EventPostponed"
};

const isPlainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && !(value instanceof Date);

const firstNonEmpty = (...values) => values.find((value) => {
  if (value === undefined || value === null) return false;
  return typeof value === "string" ? Boolean(value.trim()) : true;
}) ?? null;

const normalizeUsState = (value) => String(value || "").trim().toUpperCase();

const inferAddressCountry = (state) => {
  const normalized = normalizeUsState(state);
  if (["TX", "TEXAS", "OK", "OKLAHOMA"].includes(normalized)) return "US";
  return null;
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

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

export const buildEventJsonLd = ({
  event = {},
  resolvedLocation = {},
  siteUrl = DEFAULT_SITE_URL,
  canonicalPath = null
} = {}) => {
  const eventName = firstNonEmpty(event.event_name, event.name);
  const startDate = firstNonEmpty(event.start_datetime, event.startDate);
  if (!eventName || !startDate) return null;

  const eventPath = canonicalPath || (event.event_slug ? `/events/${event.event_slug}/` : null);
  const canonicalUrl = toAbsoluteUrl(eventPath, siteUrl);
  const venueName = firstNonEmpty(
    resolvedLocation.venueName,
    resolvedLocation.primaryVenue?.business_name,
    event.venue_name,
    event.location_name
  );
  const streetAddress = firstNonEmpty(
    resolvedLocation.address,
    event.address,
    event.street_address
  );
  const addressLocality = firstNonEmpty(resolvedLocation.city, event.city);
  const addressRegion = firstNonEmpty(resolvedLocation.state, event.state);
  const postalCode = firstNonEmpty(
    resolvedLocation.postalCode,
    event.postal_code,
    event.zip_code
  );
  const latitude = numberOrNull(firstNonEmpty(resolvedLocation.latitude, event.latitude));
  const longitude = numberOrNull(firstNonEmpty(resolvedLocation.longitude, event.longitude));
  const hasAddressDetails = Boolean(streetAddress || addressLocality || addressRegion || postalCode);

  if (!canonicalUrl || !hasAddressDetails) return null;

  const address = {
    "@type": "PostalAddress",
    streetAddress,
    addressLocality,
    addressRegion,
    postalCode,
    addressCountry: inferAddressCountry(addressRegion)
  };

  const geo = latitude !== null && longitude !== null
    ? { "@type": "GeoCoordinates", latitude, longitude }
    : null;

  const location = {
    "@type": "Place",
    name: venueName,
    address,
    geo
  };

  const image = toAbsoluteUrlList(
    [event.image_url, event.image].filter(Boolean),
    siteUrl
  );

  return withSchemaContext({
    "@type": "Event",
    "@id": buildSchemaId(canonicalUrl, "event", siteUrl),
    name: eventName,
    startDate,
    endDate: firstNonEmpty(event.end_datetime, event.endDate),
    eventStatus: EVENT_STATUS_URLS[event.status] || "https://schema.org/EventScheduled",
    location,
    image,
    description: firstNonEmpty(event.description, event.short_description),
    url: canonicalUrl
  });
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
