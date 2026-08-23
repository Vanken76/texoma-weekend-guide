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

const coordinateOrNull = (value, minimum, maximum) => {
  const number = numberOrNull(value);
  return number !== null && number >= minimum && number <= maximum ? number : null;
};

const isValidDateValue = (value) => {
  if (!value) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
};

const uniqueStrings = (values) => [...new Set(
  (Array.isArray(values) ? values : values ? [values] : [])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
)];

const isRecurringEventRecord = (event = {}) => event.recurring === true || event.status === "recurring";

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

export const getEventJsonLdEligibility = ({
  event = {},
  resolvedLocation = {},
  siteUrl = DEFAULT_SITE_URL,
  canonicalPath = null
} = {}) => {
  const reasons = [];
  const eventName = firstNonEmpty(event.event_name, event.name);
  const startDate = firstNonEmpty(event.start_datetime, event.startDate);
  const eventPath = canonicalPath || (event.event_slug ? `/events/${event.event_slug}/` : null);
  const canonicalUrl = toAbsoluteUrl(eventPath, siteUrl);
  const venueName = firstNonEmpty(
    resolvedLocation.venueName,
    resolvedLocation.primaryVenue?.business_name,
    event.venue_name,
    event.location_name
  );
  const streetAddress = firstNonEmpty(resolvedLocation.address, event.address, event.street_address);
  const addressLocality = firstNonEmpty(resolvedLocation.city, event.city);
  const addressRegion = firstNonEmpty(resolvedLocation.state, event.state);
  const venueSlugs = uniqueStrings(resolvedLocation.venueSlugs);
  const hasUsableAddress = Boolean(streetAddress || (addressLocality && addressRegion));

  if (!eventName) reasons.push("missing_event_name");
  if (!isValidDateValue(startDate)) reasons.push("invalid_start_date");
  if (!canonicalUrl) reasons.push("missing_canonical_url");
  if (!venueName) reasons.push("missing_location_name");
  if (!hasUsableAddress) reasons.push("insufficient_location");
  if (isRecurringEventRecord(event)) reasons.push("recurring_series_requires_occurrence_pages");
  if (venueSlugs.length > 1) reasons.push("multiple_physical_venues_require_separate_events");

  return {
    eligible: reasons.length === 0,
    reasons,
    canonicalUrl
  };
};

export const buildEventOffer = ({ event = {}, siteUrl = DEFAULT_SITE_URL } = {}) => {
  const ticketUrl = toAbsoluteUrl(event.ticket_url, siteUrl);
  const explicitPrice = numberOrNull(firstNonEmpty(event.price, event.minimum_price, event.lowest_price));
  const price = String(event.cost_type || "").toLowerCase() === "free"
    ? 0
    : explicitPrice !== null && explicitPrice >= 0
      ? explicitPrice
      : null;

  if (!ticketUrl && price === null) return null;

  return pruneJsonLd({
    "@type": "Offer",
    url: ticketUrl,
    price,
    priceCurrency: price !== null ? firstNonEmpty(event.price_currency, "USD") : null
  }) || null;
};

export const buildEventOrganizer = ({
  event = {},
  hostBusiness = null,
  siteUrl = DEFAULT_SITE_URL
} = {}) => {
  if (hostBusiness?.business_name) {
    return pruneJsonLd({
      "@type": "Organization",
      name: hostBusiness.business_name,
      url: toAbsoluteUrl(hostBusiness.website, siteUrl)
    }) || null;
  }

  const explicitType = event.organizer_type === "Person" || event.organizer_type === "Organization"
    ? event.organizer_type
    : null;
  if (!explicitType || !event.organizer_name) return null;

  return pruneJsonLd({
    "@type": explicitType,
    name: event.organizer_name,
    url: toAbsoluteUrl(event.organizer_url, siteUrl)
  }) || null;
};

export const buildEventJsonLd = ({
  event = {},
  resolvedLocation = {},
  hostBusiness = null,
  siteUrl = DEFAULT_SITE_URL,
  canonicalPath = null
} = {}) => {
  const eligibility = getEventJsonLdEligibility({ event, resolvedLocation, siteUrl, canonicalPath });
  if (!eligibility.eligible) return null;

  const eventName = firstNonEmpty(event.event_name, event.name);
  const startDate = firstNonEmpty(event.start_datetime, event.startDate);
  const rawEndDate = firstNonEmpty(event.end_datetime, event.endDate);
  const endDate = isValidDateValue(rawEndDate) && Date.parse(rawEndDate) >= Date.parse(startDate)
    ? rawEndDate
    : null;
  const canonicalUrl = eligibility.canonicalUrl;
  const venueName = firstNonEmpty(
    resolvedLocation.venueName,
    resolvedLocation.primaryVenue?.business_name,
    event.venue_name,
    event.location_name
  );
  const streetAddress = firstNonEmpty(resolvedLocation.address, event.address, event.street_address);
  const addressLocality = firstNonEmpty(resolvedLocation.city, event.city);
  const addressRegion = firstNonEmpty(resolvedLocation.state, event.state);
  const postalCode = firstNonEmpty(resolvedLocation.postalCode, event.postal_code, event.zip_code);
  const latitude = coordinateOrNull(firstNonEmpty(resolvedLocation.latitude, event.latitude), -90, 90);
  const longitude = coordinateOrNull(firstNonEmpty(resolvedLocation.longitude, event.longitude), -180, 180);

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

  const image = toAbsoluteUrlList([event.image_url, event.image].filter(Boolean), siteUrl);
  const offers = buildEventOffer({ event, siteUrl });
  const organizer = buildEventOrganizer({ event, hostBusiness, siteUrl });

  return withSchemaContext({
    "@type": "Event",
    "@id": buildSchemaId(canonicalUrl, "event", siteUrl),
    name: eventName,
    startDate,
    endDate,
    eventStatus: EVENT_STATUS_URLS[event.status] || "https://schema.org/EventScheduled",
    location,
    image,
    description: firstNonEmpty(event.description, event.short_description),
    url: canonicalUrl,
    offers,
    organizer
  });
};

const schemaTypes = (node) => {
  const value = node?.["@type"];
  return Array.isArray(value) ? value : value ? [value] : [];
};

const hasRequiredGoogleEventFields = (node) => Boolean(
  firstNonEmpty(node?.name)
  && isValidDateValue(node?.startDate)
  && node?.location
);

export const sanitizeGoogleJsonLd = (value) => {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => sanitizeGoogleJsonLd(item))
      .filter((item) => item !== undefined);
    return cleaned.length ? cleaned : undefined;
  }

  if (!isPlainObject(value)) return value;

  const entries = Object.entries(value)
    .map(([key, item]) => [key, sanitizeGoogleJsonLd(item)])
    .filter(([, item]) => item !== undefined);
  const cleaned = entries.length ? Object.fromEntries(entries) : undefined;
  if (!cleaned) return undefined;

  // Google treats every JSON-LD node typed as Event as a candidate Event result,
  // even when it was intended only as a lightweight relationship reference.
  // Suppress partial Event nodes so relationship markup cannot create critical
  // missing-name/startDate/location errors. Full Event nodes remain untouched.
  if (schemaTypes(cleaned).includes("Event") && !hasRequiredGoogleEventFields(cleaned)) {
    return undefined;
  }

  return cleaned;
};

export const serializeJsonLd = (value) => {
  const cleaned = pruneJsonLd(sanitizeGoogleJsonLd(pruneJsonLd(value)));
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
