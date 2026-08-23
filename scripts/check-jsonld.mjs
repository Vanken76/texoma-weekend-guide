import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEventJsonLd,
  getEventJsonLdEligibility,
  serializeJsonLd,
  toAbsoluteUrl
} from "../src/utils/jsonLd.js";
import {
  buildBusinessJsonLd,
  getBusinessJsonLdEligibility
} from "../src/utils/businessJsonLd.js";
import { getBusinessSchemaTypeDecision } from "../src/utils/businessSchemaType.js";
import { buildBreadcrumbJsonLd } from "../src/utils/breadcrumbJsonLd.js";
import {
  buildBusinessIndex,
  getEventVenueSlugs,
  resolveEventLocation,
  toArray
} from "../src/utils/eventDirectory.js";
import {
  buildBusinessRelationshipJsonLd,
  buildEventRelationshipJsonLd
} from "../src/utils/schemaRelationships.js";
import { buildSiteOrganizationJsonLd } from "../src/utils/siteOrganizationJsonLd.js";
import { buildSiteWebSiteJsonLd } from "../src/utils/siteWebSiteJsonLd.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = new URL("https://texomaweekendguide.com/");
const MAX_PRINTED_WARNINGS = 120;

const loadJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(ROOT, relativePath), "utf8")
);

const businessDirectory = loadJson("public/data/local-business-directory.json");
const eventDirectory = loadJson("public/data/local-event-directory.json");
const businesses = Array.isArray(businessDirectory.businesses) ? businessDirectory.businesses : [];
const events = Array.isArray(eventDirectory.events) ? eventDirectory.events : [];
const businessBySlug = buildBusinessIndex(businesses);

const errors = [];
const warnings = [];
const notes = [];
const stats = {
  publishedBusinesses: 0,
  publishedEvents: 0,
  businessJsonLd: 0,
  eventJsonLd: 0,
  suppressedEventJsonLd: 0,
  businessMapperFallbacks: 0,
  relationshipNodes: 0
};

const addIssue = (bucket, code, entityType, entityId, message) => {
  bucket.push({ code, entityType, entityId: entityId || "(unknown)", message });
};

const error = (code, type, id, message) => addIssue(errors, code, type, id, message);
const warn = (code, type, id, message) => addIssue(warnings, code, type, id, message);
const note = (code, type, id, message) => addIssue(notes, code, type, id, message);

const validDate = (value) => Boolean(value) && !Number.isNaN(Date.parse(value));

const parseSerializedNode = (node, entityType, entityId, label, { allowEmpty = false } = {}) => {
  if (!node) return null;
  let serialized = "";
  try {
    serialized = serializeJsonLd(node);
  } catch (cause) {
    error("jsonld_serialize_failed", entityType, entityId, `${label} serialization threw: ${cause?.message || cause}`);
    return null;
  }

  if (!serialized) {
    if (allowEmpty) return null;
    error("jsonld_empty_serialization", entityType, entityId, `${label} produced an empty serialization.`);
    return null;
  }

  try {
    return JSON.parse(serialized);
  } catch (cause) {
    error("jsonld_parse_failed", entityType, entityId, `${label} did not round-trip through JSON.parse: ${cause?.message || cause}`);
    return null;
  }
};

const checkDuplicateKeys = (records, keyName, typeName) => {
  const seen = new Map();
  for (const record of records) {
    const key = String(record?.[keyName] || "").trim();
    if (!key) continue;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
  }
  for (const [key, count] of seen) {
    if (count > 1) error("duplicate_slug", typeName, key, `${count} records use the same ${keyName}.`);
  }
};

checkDuplicateKeys(businesses, "slug", "business");
checkDuplicateKeys(events, "event_slug", "event");

const publishedBusinesses = businesses.filter((business) => business?.publish_ready === true);
const publishedEvents = events.filter((event) => event?.publish_ready === true);
stats.publishedBusinesses = publishedBusinesses.length;
stats.publishedEvents = publishedEvents.length;

for (const business of publishedBusinesses) {
  const id = business.slug || business.business_name || "(publish-ready business)";
  if (!business.slug) error("missing_slug", "business", id, "Publish-ready business has no slug and cannot receive a canonical detail URL.");
  if (!String(business.business_name || business.name || "").trim()) {
    error("missing_name", "business", id, "Publish-ready business has no business_name/name.");
  }

  const eligibility = getBusinessJsonLdEligibility({ business, siteUrl: SITE_URL });
  if (!eligibility.eligible) {
    warn("business_schema_suppressed", "business", id, `Business JSON-LD suppressed: ${eligibility.reasons.join(", ")}.`);
    continue;
  }

  const decision = getBusinessSchemaTypeDecision(business);
  if (decision.fallback) {
    stats.businessMapperFallbacks += 1;
    warn(
      "business_type_fallback",
      "business",
      id,
      `Schema type fell back to ${decision.schemaType}; categories: ${decision.categoryTerms.join(" | ") || "(none)"}.`
    );
  }

  const node = buildBusinessJsonLd({ business, siteUrl: SITE_URL });
  const parsed = parseSerializedNode(node, "business", id, "Business JSON-LD");
  if (!parsed) continue;
  stats.businessJsonLd += 1;

  if (parsed["@context"] !== "https://schema.org") error("bad_context", "business", id, "Business JSON-LD is missing the Schema.org @context.");
  if (!parsed["@type"]) error("missing_type", "business", id, "Business JSON-LD has no @type.");
  if (!parsed["@id"]) error("missing_id", "business", id, "Business JSON-LD has no stable @id.");
  if (!parsed.name) error("missing_name_output", "business", id, "Business JSON-LD has no name.");
  if (!parsed.url) error("missing_url_output", "business", id, "Business JSON-LD has no canonical TWG URL.");

  const officialUrls = [
    business.website,
    business.facebook_url || business.facebook,
    business.instagram_url || business.instagram,
    business.youtube_url || business.youtube,
    business.tiktok_url || business.tiktok
  ].filter(Boolean);
  for (const value of officialUrls) {
    if (!toAbsoluteUrl(value, SITE_URL)) warn("invalid_official_url", "business", id, `Could not normalize official URL: ${value}`);
  }

  const relationshipNode = buildBusinessRelationshipJsonLd({
    business,
    businessBySlug,
    relatedEvents: [],
    siteUrl: SITE_URL
  });
  if (relationshipNode) {
    if (parseSerializedNode(relationshipNode, "business", id, "Business relationship JSON-LD", { allowEmpty: true })) {
      stats.relationshipNodes += 1;
    }
  }
}

const intentionalEventSuppressions = new Set([
  "recurring_series_requires_occurrence_pages",
  "multiple_physical_venues_require_separate_events"
]);

for (const event of publishedEvents) {
  const id = event.event_slug || event.event_name || "(publish-ready event)";
  if (!event.event_slug) error("missing_slug", "event", id, "Publish-ready event has no event_slug and cannot receive a canonical detail URL.");
  if (!String(event.event_name || event.name || "").trim()) error("missing_name", "event", id, "Publish-ready event has no event_name/name.");

  const venueSlugs = getEventVenueSlugs(event);
  for (const venueSlug of venueSlugs) {
    if (!businessBySlug.has(venueSlug)) {
      warn("unresolved_venue", "event", id, `Venue slug does not resolve to a directory record: ${venueSlug}`);
    }
  }
  if (event.host_business_slug && !businessBySlug.has(event.host_business_slug)) {
    warn("unresolved_host", "event", id, `host_business_slug does not resolve: ${event.host_business_slug}`);
  }
  for (const partnerSlug of toArray(event.partner_business_slugs)) {
    if (partnerSlug && !businessBySlug.has(partnerSlug)) {
      warn("unresolved_partner", "event", id, `partner_business_slugs entry does not resolve: ${partnerSlug}`);
    }
  }

  if (event.start_datetime && !validDate(event.start_datetime)) {
    warn("invalid_start_datetime", "event", id, `start_datetime is not parseable: ${event.start_datetime}`);
  }
  if (event.end_datetime && !validDate(event.end_datetime)) {
    warn("invalid_end_datetime", "event", id, `end_datetime is not parseable: ${event.end_datetime}`);
  } else if (validDate(event.start_datetime) && validDate(event.end_datetime) && Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) {
    warn("end_before_start", "event", id, "end_datetime is earlier than start_datetime; the generator will omit endDate.");
  }
  if (event.ticket_url && !toAbsoluteUrl(event.ticket_url, SITE_URL)) {
    warn("invalid_ticket_url", "event", id, `Could not normalize ticket_url: ${event.ticket_url}`);
  }

  const resolvedLocation = resolveEventLocation(event, businessBySlug);
  const eligibility = getEventJsonLdEligibility({ event, resolvedLocation, siteUrl: SITE_URL });
  if (!eligibility.eligible) {
    stats.suppressedEventJsonLd += 1;
    const intentionalOnly = eligibility.reasons.length > 0
      && eligibility.reasons.every((reason) => intentionalEventSuppressions.has(reason));
    const message = `Event JSON-LD suppressed: ${eligibility.reasons.join(", ")}.`;
    if (intentionalOnly) note("event_schema_intentionally_suppressed", "event", id, message);
    else warn("event_schema_suppressed", "event", id, message);
    continue;
  }

  const hostBusiness = event.host_business_slug ? businessBySlug.get(event.host_business_slug) : null;
  const node = buildEventJsonLd({ event, resolvedLocation, hostBusiness, siteUrl: SITE_URL });
  const parsed = parseSerializedNode(node, "event", id, "Event JSON-LD");
  if (!parsed) continue;
  stats.eventJsonLd += 1;

  if (parsed["@context"] !== "https://schema.org") error("bad_context", "event", id, "Event JSON-LD is missing the Schema.org @context.");
  if (parsed["@type"] !== "Event") error("bad_type", "event", id, `Event JSON-LD has unexpected @type: ${parsed["@type"]}`);
  if (!parsed["@id"]) error("missing_id", "event", id, "Event JSON-LD has no stable @id.");
  if (!parsed.name) error("missing_name_output", "event", id, "Event JSON-LD has no name.");
  if (!parsed.startDate) error("missing_start_output", "event", id, "Event JSON-LD has no startDate.");
  if (!parsed.location?.address) error("missing_location_output", "event", id, "Eligible Event JSON-LD has no location.address.");
  if (!parsed.url) error("missing_url_output", "event", id, "Event JSON-LD has no canonical TWG URL.");

  const relationshipNode = buildEventRelationshipJsonLd({ event, hostBusiness, siteUrl: SITE_URL });
  if (relationshipNode) {
    if (parseSerializedNode(relationshipNode, "event", id, "Event relationship JSON-LD", { allowEmpty: true })) {
      stats.relationshipNodes += 1;
    }
  }
}

const organizationNode = buildSiteOrganizationJsonLd(SITE_URL);
const websiteNode = buildSiteWebSiteJsonLd(SITE_URL);
const breadcrumbNode = buildBreadcrumbJsonLd({
  items: [
    { name: "Events", url: "/events/" },
    { name: "QA Example", url: "/events/qa-example/" }
  ],
  siteUrl: SITE_URL
});

const organizationParsed = parseSerializedNode(organizationNode, "site", "organization", "Organization JSON-LD");
const websiteParsed = parseSerializedNode(websiteNode, "site", "website", "WebSite JSON-LD");
const breadcrumbParsed = parseSerializedNode(breadcrumbNode, "site", "breadcrumb", "Breadcrumb JSON-LD");

if (organizationParsed && organizationParsed["@type"] !== "Organization") error("bad_site_organization", "site", "organization", "Homepage organization node is not @type Organization.");
if (websiteParsed && websiteParsed["@type"] !== "WebSite") error("bad_site_website", "site", "website", "Homepage website node is not @type WebSite.");
if (websiteParsed && websiteParsed.publisher?.["@id"] !== organizationParsed?.["@id"]) {
  error("publisher_id_mismatch", "site", "website", "WebSite.publisher @id does not match the Organization @id.");
}
if (breadcrumbParsed && breadcrumbParsed.itemListElement?.length !== 2) error("bad_breadcrumb", "site", "breadcrumb", "Breadcrumb test did not produce two ListItems.");

const printIssues = (label, items, limit = items.length) => {
  if (!items.length) return;
  console.log(`\n${label} (${items.length})`);
  for (const item of items.slice(0, limit)) {
    console.log(`- [${item.code}] ${item.entityType}:${item.entityId} — ${item.message}`);
  }
  if (items.length > limit) console.log(`- … ${items.length - limit} more ${label.toLowerCase()} omitted from console output.`);
};

console.log("TWG JSON-LD QA");
console.log(`Published businesses: ${stats.publishedBusinesses}`);
console.log(`Business entity nodes generated: ${stats.businessJsonLd}`);
console.log(`Business mapper fallbacks: ${stats.businessMapperFallbacks}`);
console.log(`Published events: ${stats.publishedEvents}`);
console.log(`Event entity nodes generated: ${stats.eventJsonLd}`);
console.log(`Event nodes intentionally/eligibility suppressed: ${stats.suppressedEventJsonLd}`);
console.log(`Relationship nodes exercised: ${stats.relationshipNodes}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Notes: ${notes.length}`);

printIssues("ERRORS", errors);
printIssues("WARNINGS", warnings, MAX_PRINTED_WARNINGS);
printIssues("NOTES", notes, 40);

if (errors.length > 0) {
  console.error("\nJSON-LD QA FAILED. Fix blocking errors before building/deploying.");
  process.exitCode = 1;
} else {
  console.log("\nJSON-LD QA PASSED. Warnings are visible for cleanup but do not block the build.");
}
