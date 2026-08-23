import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEventJsonLd, getEventJsonLdEligibility, serializeJsonLd } from "../src/utils/jsonLd.js";
import { buildBusinessJsonLd, LOCAL_BUSINESS_TYPES } from "../src/utils/businessJsonLd.js";
import { getBusinessSchemaTypeDecision } from "../src/utils/businessSchemaType.js";
import { buildBusinessIndex, resolveEventLocation } from "../src/utils/eventDirectory.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = new URL("https://texomaweekendguide.com/");
const load = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const businesses = load("public/data/local-business-directory.json").businesses ?? [];
const events = load("public/data/local-event-directory.json").events ?? [];
const businessBySlug = buildBusinessIndex(businesses);

const errors = [];
const warnings = [];
const push = (bucket, code, id, message) => bucket.push({ code, id, message });

const partialTopLevelEvent = serializeJsonLd({
  "@context": "https://schema.org",
  "@type": "Event",
  "@id": "https://texomaweekendguide.com/events/schema-guard-test/#event",
  organizer: { "@type": "Organization", name: "Schema Guard Test" }
});
if (partialTopLevelEvent) {
  push(errors, "partial_event_serialized", "schema-guard-top-level", "Serializer must suppress Event nodes missing Google's required name, startDate, or location fields.");
}

const nestedPartialEventText = serializeJsonLd({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Schema Guard Test",
  event: [{
    "@type": "Event",
    "@id": "https://texomaweekendguide.com/events/schema-guard-test/#event",
    name: "Schema Guard Test Event",
    url: "https://texomaweekendguide.com/events/schema-guard-test/"
  }]
});
if (nestedPartialEventText) {
  const nestedPartialEvent = JSON.parse(nestedPartialEventText);
  if (nestedPartialEvent.event) {
    push(errors, "nested_partial_event_serialized", "schema-guard-nested", "Serializer must remove partial Event relationship nodes without removing the surrounding valid entity.");
  }
}

const completeEventText = serializeJsonLd({
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Schema Guard Complete Event",
  startDate: "2026-08-23T12:00:00-05:00",
  location: {
    "@type": "Place",
    name: "Schema Guard Venue",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Denison",
      addressRegion: "TX",
      addressCountry: "US"
    }
  }
});
if (!completeEventText) {
  push(errors, "complete_event_suppressed", "schema-guard-complete", "Serializer must preserve complete Event nodes.");
}

for (const business of businesses.filter((item) => item?.publish_ready === true && item.slug)) {
  const node = buildBusinessJsonLd({ business, siteUrl: SITE_URL });
  if (!node) continue;
  const parsed = JSON.parse(serializeJsonLd(node));
  const decision = getBusinessSchemaTypeDecision(business);

  if (!parsed.name) push(errors, "business_missing_name", business.slug, "Generated business/place node has no name.");
  if (!parsed.url) push(errors, "business_missing_url", business.slug, "Generated business/place node has no canonical URL.");

  if (LOCAL_BUSINESS_TYPES.has(decision.schemaType)) {
    if (parsed.address?.["@type"] !== "PostalAddress") {
      push(warnings, "google_localbusiness_missing_address", business.slug, `${decision.schemaType} lacks the physical PostalAddress Google requires for Local Business rich-result eligibility.`);
    }
  }
}

for (const event of events.filter((item) => item?.publish_ready === true && item.event_slug)) {
  const resolvedLocation = resolveEventLocation(event, businessBySlug);
  const eligibility = getEventJsonLdEligibility({ event, resolvedLocation, siteUrl: SITE_URL });
  if (!eligibility.eligible) continue;

  const hostBusiness = event.host_business_slug ? businessBySlug.get(event.host_business_slug) : null;
  const node = buildEventJsonLd({ event, resolvedLocation, hostBusiness, siteUrl: SITE_URL });
  if (!node) {
    push(errors, "event_generator_returned_null", event.event_slug, "Event passed eligibility but generator returned null.");
    continue;
  }
  const serialized = serializeJsonLd(node);
  if (!serialized) {
    push(errors, "complete_event_failed_serialization", event.event_slug, "Eligible Event was unexpectedly suppressed during JSON-LD serialization.");
    continue;
  }
  const parsed = JSON.parse(serialized);

  if (parsed["@type"] !== "Event") push(errors, "event_bad_type", event.event_slug, "Generated node is not Event.");
  if (!parsed.name) push(errors, "event_missing_name", event.event_slug, "Google Event requires name.");
  if (!parsed.startDate) push(errors, "event_missing_start", event.event_slug, "Google Event requires startDate.");
  if (parsed.location?.["@type"] !== "Place") push(errors, "event_missing_place", event.event_slug, "Google Event requires location @type Place.");
  if (!parsed.location?.name) push(errors, "event_missing_location_name", event.event_slug, "Google Event requires location.name.");
  if (parsed.location?.address?.["@type"] !== "PostalAddress") push(errors, "event_missing_address", event.event_slug, "Google Event requires location.address as PostalAddress.");
}

console.log("TWG Google structured-data eligibility check");
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
for (const issue of errors) console.log(`ERROR [${issue.code}] ${issue.id}: ${issue.message}`);
for (const issue of warnings.slice(0, 150)) console.log(`WARN [${issue.code}] ${issue.id}: ${issue.message}`);

if (errors.length) process.exitCode = 1;
