import fs from "node:fs";
import {
  buildBusinessIndex,
  getEventVenueSlugs,
  getNextOccurrenceDate,
  isRecurringEvent,
  withResolvedEventLocation
} from "../src/utils/eventDirectory.js";
import { businessStateCode } from "../src/utils/businessState.js";

const geographyDirectory = JSON.parse(fs.readFileSync("public/data/local-geography-directory.json", "utf8"));
const businessDirectory = JSON.parse(fs.readFileSync("public/data/local-business-directory.json", "utf8"));
const eventDirectory = JSON.parse(fs.readFileSync("public/data/local-event-directory.json", "utf8"));

const entity = (geographyDirectory.entities ?? []).find((item) => item.slug === "grayson-county-tx");
if (!entity) throw new Error("Grayson County entity not found");

const allGeography = geographyDirectory.entities ?? [];
const allBusinesses = businessDirectory.businesses ?? [];
const allEvents = eventDirectory.events ?? [];
const businessIndex = buildBusinessIndex(allBusinesses);
const normalize = (value) => String(value ?? "").trim().toLowerCase();
const normalizeCity = (value) => normalize(value)
  .replace(/,\s*(?:tx|texas|ok|oklahoma)\b.*$/i, "")
  .replace(/-(?:tx|ok)$/i, "")
  .trim();
const toArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
const now = new Date();
const chicagoDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(date);
const todayCentral = chicagoDate(now);
const eventStartDate = (event = {}) => event.start_datetime?.slice(0, 10) || "";
const eventEndDate = (event = {}) => event.end_datetime?.slice(0, 10) || "";

const state = allGeography.find((item) =>
  item.publish_ready === true && item.entity_type === "state" && item.slug === entity.state_slug
) ?? null;
const stateCode = businessStateCode({ state: state?.abbreviation || state?.name || entity.state_slug });
const childCities = allGeography
  .filter((item) => item.publish_ready === true && item.entity_type === "city")
  .filter((item) => item.county_slug === entity.slug || item.parent_slug === entity.slug);
const countyNames = new Set([entity.name, entity.official_name, entity.slug].map(normalize).filter(Boolean));

const cityFromLocationText = (value) => {
  const match = String(value ?? "").match(/,\s*([^,]+),\s*(?:TX|Texas|OK|Oklahoma)\b/i);
  if (match?.[1]) return match[1].trim();
  const serviceAreaMatch = String(value ?? "").match(/^([^,]+),\s*(?:TX|Texas|OK|Oklahoma)\b/i);
  return serviceAreaMatch?.[1]?.trim() || "";
};
const cityValuesForRecord = (record = {}, includeServiceArea = true) => [
  record.city_slug,
  record.city,
  cityFromLocationText(record.address),
  cityFromLocationText(record.full_address),
  cityFromLocationText(record.formatted_address),
  ...(includeServiceArea ? [cityFromLocationText(record.service_area_or_location)] : [])
].map(normalizeCity).filter(Boolean);
const recordDirectlyReferencesCounty = (record = {}) => {
  const directCountyValues = [record.county_slug, record.county, record.county_name, record.countyName]
    .map(normalize)
    .filter(Boolean);
  if (directCountyValues.some((value) => countyNames.has(value))) return true;
  const related = [
    ...toArray(record.related_geography_slugs),
    ...toArray(record.geography_slugs),
    ...toArray(record.tags)
  ].map(normalize);
  return related.some((value) => countyNames.has(value));
};
const seedCountyBusinesses = allBusinesses
  .filter((business) => business.publish_ready === true)
  .filter((business) => !stateCode || businessStateCode(business) === stateCode)
  .filter(recordDirectlyReferencesCounty);
const declaredCountyCities = [
  ...toArray(entity.city_names),
  ...toArray(entity.community_names),
  ...toArray(entity.covered_cities),
  ...toArray(entity.member_cities)
];
const countyCityNames = new Set([
  ...declaredCountyCities.map(normalizeCity),
  ...childCities.flatMap((city) => [normalizeCity(city.name), normalizeCity(city.slug)]),
  ...seedCountyBusinesses.flatMap((business) => cityValuesForRecord(business, false))
].filter(Boolean));
const recordReferencesCounty = (record = {}) => {
  if (recordDirectlyReferencesCounty(record)) return true;
  return cityValuesForRecord(record).some((value) => countyCityNames.has(value));
};
const countyBusinesses = allBusinesses
  .filter((business) => business.publish_ready === true)
  .filter((business) => !stateCode || businessStateCode(business) === stateCode)
  .filter(recordReferencesCounty);
const countyBusinessSlugs = new Set(countyBusinesses.map((business) => business.slug).filter(Boolean));

// ----- Current county-template event universe -----
const countyDirectoryIsRecurring = (event = {}) => event.recurring === true;
const countyDirectoryNextOccurrenceDate = (event = {}) => {
  const eventDate = eventStartDate(event);
  if (!eventDate) return null;
  if (!countyDirectoryIsRecurring(event)) {
    const endDate = eventEndDate(event) || eventDate;
    if (endDate < todayCentral) return null;
    return eventDate >= todayCentral ? eventDate : todayCentral;
  }
  return getNextOccurrenceDate(event, { fromDate: todayCentral });
};
const countyDirectoryIsCurrent = (event = {}) => {
  if (event.active === false) return false;
  if (countyDirectoryIsRecurring(event)) return Boolean(countyDirectoryNextOccurrenceDate(event));
  if (event.end_datetime) {
    const end = new Date(event.end_datetime);
    return !Number.isNaN(end.getTime()) && end >= now;
  }
  return Boolean(eventStartDate(event) && eventStartDate(event) >= todayCentral);
};
const countyCurrentEvents = allEvents
  .filter((event) => event.publish_ready === true)
  .filter((event) => ["upcoming", "recurring"].includes(event.status))
  .filter(countyDirectoryIsCurrent)
  .map((event) => withResolvedEventLocation(event, businessIndex))
  .map((event) => ({ ...event, next_occurrence_date: countyDirectoryNextOccurrenceDate(event) }))
  .filter((event) => Boolean(event.next_occurrence_date));
const countyEvents = countyCurrentEvents.filter((event) => {
  if (recordReferencesCounty(event)) return true;
  return getEventVenueSlugs(event).some((slug) => countyBusinessSlugs.has(slug)) || countyBusinessSlugs.has(event.host_business_slug);
});
const countyFilterCities = [...new Set([
  ...countyCityNames,
  ...countyBusinesses.flatMap((business) => cityValuesForRecord(business, false)),
  ...countyEvents.flatMap((event) => cityValuesForRecord(event, false))
])].filter(Boolean).sort();
const countyFilterCitySet = new Set(countyFilterCities);
const businessCityValuesForCountyDirectory = (business = {}) => [
  business.city_slug,
  business.city,
  cityFromLocationText(business.address),
  cityFromLocationText(business.full_address),
  cityFromLocationText(business.formatted_address),
  cityFromLocationText(business.service_area_or_location),
  ...toArray(business.related_geography_slugs),
  ...toArray(business.geography_slugs),
  ...toArray(business.tags)
].map(normalizeCity).filter(Boolean);
const countyDirectoryVenueSlugs = (event = {}) => [
  ...toArray(event.venue_slugs),
  ...toArray(event.venue_slug),
  ...toArray(event.primary_venue_slug),
  ...toArray(event.host_business_slug)
].filter(Boolean);
const eventCityValuesForCountyDirectory = (event = {}) => {
  const directValues = [
    event.city_slug,
    event.city,
    cityFromLocationText(event.address),
    cityFromLocationText(event.full_address),
    cityFromLocationText(event.formatted_address),
    cityFromLocationText(event.location),
    ...toArray(event.related_geography_slugs),
    ...toArray(event.geography_slugs),
    ...toArray(event.tags)
  ].map(normalizeCity).filter(Boolean);
  const venueValues = countyDirectoryVenueSlugs(event)
    .flatMap((slug) => businessCityValuesForCountyDirectory(businessIndex.get(slug) ?? {}));
  return [...new Set([...directValues, ...venueValues])];
};
const countyDirectoryStateForEvent = (event = {}) => {
  const directState = businessStateCode(event);
  if (directState) return directState;
  for (const slug of countyDirectoryVenueSlugs(event)) {
    const venueState = businessStateCode(businessIndex.get(slug) ?? {});
    if (venueState) return venueState;
  }
  return "";
};
const countyCountSet = countyCurrentEvents.filter((event) =>
  eventCityValuesForCountyDirectory(event).some((city) => countyFilterCitySet.has(city))
  && (!stateCode || countyDirectoryStateForEvent(event) === stateCode)
);

// ----- Exact src/pages/events.astro server universe -----
const directoryBusinessesBySlug = new Map(allBusinesses.map((business) => [business.slug, business]));
const directoryGetVenueSlugs = (event = {}) => [
  ...toArray(event.venue_slugs),
  ...toArray(event.venue_slug),
  ...toArray(event.primary_venue_slug),
  ...toArray(event.host_business_slug)
].filter(Boolean);
const directoryPrimaryVenueSlug = (event) => directoryGetVenueSlugs(event)[0] ?? null;
const directoryBusinessCityValues = (business = {}) => [
  business.city_slug,
  business.city,
  cityFromLocationText(business.address),
  cityFromLocationText(business.full_address),
  cityFromLocationText(business.formatted_address),
  cityFromLocationText(business.service_area_or_location),
  ...toArray(business.related_geography_slugs),
  ...toArray(business.geography_slugs),
  ...toArray(business.tags)
].map(normalizeCity).filter(Boolean);
const directoryEventCityValues = (event = {}) => {
  const directValues = [
    event.city_slug,
    event.city,
    cityFromLocationText(event.address),
    cityFromLocationText(event.full_address),
    cityFromLocationText(event.formatted_address),
    cityFromLocationText(event.location),
    ...toArray(event.related_geography_slugs),
    ...toArray(event.geography_slugs),
    ...toArray(event.tags)
  ].map(normalizeCity).filter(Boolean);
  const venueValues = directoryGetVenueSlugs(event)
    .flatMap((slug) => directoryBusinessCityValues(directoryBusinessesBySlug.get(slug) ?? {}));
  return [...new Set([...directValues, ...venueValues])];
};
const directoryWithVenueFallbacks = (event) => {
  const venueSlug = directoryPrimaryVenueSlug(event);
  const business = venueSlug ? directoryBusinessesBySlug.get(venueSlug) : null;
  return {
    ...event,
    venue_name: event.venue_name || event.location_name || business?.business_name || "",
    address: event.address || business?.address || null,
    city: event.city || business?.city || "",
    state: event.state || business?.state || "",
    postal_code: event.postal_code || business?.postal_code || null
  };
};
const directoryIsRecurring = (event) => event.recurring === true;
const directoryIsActive = (event) => event.active !== false;
const normalizeRule = (rule = "") => String(rule ?? "").trim().replace(/^RRULE:/i, "");
const parseRule = (rule = "") => Object.fromEntries(
  normalizeRule(rule).split(";").map((part) => part.split("=")).filter(([key, value]) => key && value)
);
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return chicagoDate(date);
};
const dayCode = (dateString) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(`${dateString}T12:00:00`).getDay()];
const dayCodeForDate = (date) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getDay()];
const matchesMonthlyByDayToken = (date, token) => {
  const match = String(token ?? "").match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!match || dayCodeForDate(date) !== match[2]) return false;
  if (!match[1]) return true;
  const ordinal = Number(match[1]);
  if (ordinal > 0) return Math.floor((date.getDate() - 1) / 7) + 1 === ordinal;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.floor((daysInMonth - date.getDate()) / 7) + 1 === Math.abs(ordinal);
};
const matchesMonthlyByDay = (target, rule) => {
  const tokens = String(rule.BYDAY ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!tokens.length || !tokens.some((token) => matchesMonthlyByDayToken(target, token))) return false;
  const positions = String(rule.BYSETPOS ?? "").split(",").map(Number).filter((value) => Number.isInteger(value) && value !== 0);
  if (!positions.length) return true;
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const candidates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const candidate = new Date(target.getFullYear(), target.getMonth(), day, 12);
    if (tokens.some((token) => matchesMonthlyByDayToken(candidate, token))) candidates.push(day);
  }
  return positions.some((position) => {
    const index = position > 0 ? position - 1 : candidates.length + position;
    return candidates[index] === target.getDate();
  });
};
const recurrenceEndDate = (event) => {
  if (event.recurrence_end_date) return event.recurrence_end_date;
  const until = parseRule(event.recurrence_rule).UNTIL;
  if (!until || !/^\d{8}/.test(until)) return null;
  return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
};
const rdates = (rule = "") => {
  const value = normalizeRule(rule).startsWith("RDATE:") ? normalizeRule(rule).slice(6) : "";
  return value.split(",").map((entry) => entry.slice(0, 8)).filter((entry) => /^\d{8}$/.test(entry)).map((entry) => `${entry.slice(0, 4)}-${entry.slice(4, 6)}-${entry.slice(6, 8)}`);
};
const occursOn = (eventDate, targetDate, recurrenceRule, recurrenceEnd) => {
  if (!eventDate || targetDate < eventDate || (recurrenceEnd && targetDate > recurrenceEnd)) return false;
  const normalized = normalizeRule(recurrenceRule);
  if (normalized.startsWith("RDATE:")) return rdates(recurrenceRule).includes(targetDate);
  const rule = parseRule(recurrenceRule);
  const frequency = rule.FREQ;
  if (!frequency) return targetDate === eventDate;
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL ?? "1", 10) || 1);
  const start = new Date(`${eventDate}T12:00:00`);
  const target = new Date(`${targetDate}T12:00:00`);
  const daysApart = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (frequency === "DAILY") return daysApart % interval === 0;
  if (frequency === "WEEKLY") {
    const allowedDays = (rule.BYDAY ?? dayCode(eventDate)).split(",");
    return allowedDays.includes(dayCode(targetDate)) && Math.floor(daysApart / 7) % interval === 0;
  }
  if (frequency === "MONTHLY") {
    const monthsApart = (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
    if (monthsApart < 0 || monthsApart % interval !== 0) return false;
    if (rule.BYMONTHDAY) return rule.BYMONTHDAY.split(",").map(Number).includes(target.getDate());
    if (rule.BYDAY) return matchesMonthlyByDay(target, rule);
    return target.getDate() === start.getDate();
  }
  if (frequency === "YEARLY") {
    const yearsApart = target.getFullYear() - start.getFullYear();
    return yearsApart >= 0 && yearsApart % interval === 0 && target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
  }
  return targetDate === eventDate;
};
const directoryNextOccurrenceDate = (event, fromDate = todayCentral) => {
  const eventDate = event.start_datetime?.slice(0, 10) ?? "";
  if (!eventDate) return null;
  if (!directoryIsRecurring(event)) {
    const endDate = event.end_datetime?.slice(0, 10) ?? eventDate;
    if (endDate < fromDate) return null;
    return eventDate >= fromDate ? eventDate : fromDate;
  }
  const endDate = recurrenceEndDate(event);
  const scanEnd = endDate && endDate < addDays(fromDate, 730) ? endDate : addDays(fromDate, 730);
  for (let date = fromDate; date <= scanEnd; date = addDays(date, 1)) {
    if (occursOn(eventDate, date, event.recurrence_rule ?? "", endDate ?? "")) return date;
  }
  return null;
};
const directoryIsCurrent = (event) => {
  if (!directoryIsActive(event)) return false;
  if (directoryIsRecurring(event)) return Boolean(directoryNextOccurrenceDate(event));
  if (event.end_datetime) return new Date(event.end_datetime) >= now;
  return Boolean(event.start_datetime && event.start_datetime.slice(0, 10) >= todayCentral);
};
const actualDirectoryEvents = allEvents
  .map(directoryWithVenueFallbacks)
  .map((event) => ({ ...event, city_values: directoryEventCityValues(event) }))
  .filter((event) => event.publish_ready === true)
  .filter((event) => ["upcoming", "recurring"].includes(event.status))
  .filter(directoryIsCurrent)
  .map((event) => ({ ...event, next_occurrence_date: directoryNextOccurrenceDate(event) }))
  .filter((event) => Boolean(event.next_occurrence_date));
const normalizeState = (value = "") => {
  const stateValue = String(value ?? "").trim().toLowerCase();
  if (stateValue === "texas") return "tx";
  if (stateValue === "oklahoma") return "ok";
  return stateValue;
};
const actualFilteredSet = actualDirectoryEvents.filter((event) =>
  event.city_values.some((city) => countyFilterCitySet.has(city))
  && (!stateCode || normalizeState(event.state) === stateCode)
);

const countyMap = new Map(countyCountSet.map((event) => [event.event_slug, event]));
const actualMap = new Map(actualFilteredSet.map((event) => [event.event_slug, event]));
const onlyCounty = [...countyMap.keys()].filter((slug) => !actualMap.has(slug));
const onlyActual = [...actualMap.keys()].filter((slug) => !countyMap.has(slug));
const rawBySlug = new Map(allEvents.map((event) => [event.event_slug, event]));

const describe = (slug) => {
  const raw = rawBySlug.get(slug) ?? {};
  const countyVersion = countyMap.get(slug) ?? {};
  const actualVersion = actualMap.get(slug) ?? {};
  return {
    slug,
    event_name: raw.event_name,
    raw_city: raw.city,
    raw_state: raw.state,
    venue_slugs: directoryGetVenueSlugs(raw),
    host_business_slug: raw.host_business_slug,
    county_city_values: eventCityValuesForCountyDirectory(countyVersion),
    county_state: countyDirectoryStateForEvent(countyVersion),
    directory_city_values: actualVersion.city_values ?? directoryEventCityValues(directoryWithVenueFallbacks(raw)),
    directory_state: actualVersion.state ?? directoryWithVenueFallbacks(raw).state,
    start_datetime: raw.start_datetime,
    end_datetime: raw.end_datetime,
    status: raw.status,
    recurring: raw.recurring
  };
};

console.log("=== GRAYSON COUNTY EVENT COUNT DIAGNOSTIC ===");
console.log("Now:", now.toISOString(), "Central date:", todayCentral);
console.log("State:", stateCode);
console.log("Filter cities:", countyFilterCities.join(" | "));
console.log("County-template count:", countyCountSet.length);
console.log("Actual events-page filtered count:", actualFilteredSet.length);
console.log("Only county-template:", JSON.stringify(onlyCounty.map(describe), null, 2));
console.log("Only events-page:", JSON.stringify(onlyActual.map(describe), null, 2));
