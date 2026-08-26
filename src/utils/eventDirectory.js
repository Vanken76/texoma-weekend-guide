import { chooseCoordinatePair } from "./locationCoordinates.js";

const DEFAULT_TIME_ZONE = "America/Chicago";
const PUBLIC_CURRENT_STATUSES = new Set(["upcoming", "recurring"]);
const businessIndexCache = new WeakMap();
const currentEventsCache = new WeakMap();
const venueEventsIndexCache = new WeakMap();
const localDateFormatterCache = new Map();

const hasCustomOptions = (options = {}) => Object.keys(options).length > 0;

const getLocalDateFormatter = (timeZone = DEFAULT_TIME_ZONE) => {
  const cached = localDateFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  localDateFormatterCache.set(timeZone, formatter);
  return formatter;
};

export const toArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

export const uniqueStrings = (...values) => [...new Set(
  values.flatMap(toArray).filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)
)];

export const getEventVenueSlugs = (event = {}) => uniqueStrings(
  event.venue_slugs,
  event.venue_slug,
  event.secondary_venue_slugs
);

export const buildBusinessIndex = (businesses = []) => {
  if (!Array.isArray(businesses)) return new Map();
  const cached = businessIndexCache.get(businesses);
  if (cached) return cached;

  const index = new Map(
    businesses.filter((business) => business?.slug).map((business) => [business.slug, business])
  );
  businessIndexCache.set(businesses, index);
  return index;
};

const normalizeRecurrenceRule = (rule = "") => String(rule ?? "").trim().replace(/^RRULE:/i, "");

export const parseRecurrenceRule = (rule = "") => Object.fromEntries(
  normalizeRecurrenceRule(rule)
    .split(";")
    .map((part) => part.split("="))
    .filter(([key, value]) => key && value)
);

export const getRecurrenceEndDate = (event = {}) => {
  if (event.recurrence_end_date) return event.recurrence_end_date;
  const until = parseRecurrenceRule(event.recurrence_rule).UNTIL;
  if (!until || !/^\d{8}/.test(until)) return null;
  return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
};

export const getLocalDateKey = (date = new Date(), timeZone = DEFAULT_TIME_ZONE) =>
  getLocalDateFormatter(timeZone).format(date);

export const isRecurringEvent = (event = {}) => event.recurring === true || event.status === "recurring";

const dateKeyToUtc = (dateKey) => {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : null;
};

const addDaysToDateKey = (dateKey, days) => {
  const date = dateKeyToUtc(dateKey);
  if (!date) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const dayCodeForDateKey = (dateKey) => {
  const date = dateKeyToUtc(dateKey);
  return date ? ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getUTCDay()] : "";
};

const matchesMonthlyByDayToken = (date, token) => {
  const match = String(token ?? "").match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!match || ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getUTCDay()] !== match[2]) return false;
  if (!match[1]) return true;

  const ordinal = Number(match[1]);
  if (ordinal > 0) return Math.floor((date.getUTCDate() - 1) / 7) + 1 === ordinal;

  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return Math.floor((daysInMonth - date.getUTCDate()) / 7) + 1 === Math.abs(ordinal);
};

const matchesMonthlyByDay = (target, rule) => {
  const tokens = String(rule.BYDAY ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!tokens.length || !tokens.some((token) => matchesMonthlyByDayToken(target, token))) return false;

  const positions = String(rule.BYSETPOS ?? "").split(",").map(Number).filter((value) => Number.isInteger(value) && value !== 0);
  if (!positions.length) return true;

  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  const candidates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const candidate = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day, 12));
    if (tokens.some((token) => matchesMonthlyByDayToken(candidate, token))) candidates.push(day);
  }

  return positions.some((position) => {
    const index = position > 0 ? position - 1 : candidates.length + position;
    return candidates[index] === target.getUTCDate();
  });
};

const recurrenceDates = (rule = "") => {
  const normalized = normalizeRecurrenceRule(rule);
  const value = normalized.startsWith("RDATE:") ? normalized.slice(6) : "";
  return value
    .split(",")
    .map((entry) => entry.slice(0, 8))
    .filter((entry) => /^\d{8}$/.test(entry))
    .map((entry) => `${entry.slice(0, 4)}-${entry.slice(4, 6)}-${entry.slice(6, 8)}`);
};

const occursOn = (eventDate, targetDate, recurrenceRule, recurrenceEnd) => {
  if (!eventDate || targetDate < eventDate || (recurrenceEnd && targetDate > recurrenceEnd)) return false;
  const normalized = normalizeRecurrenceRule(recurrenceRule);
  if (normalized.startsWith("RDATE:")) return recurrenceDates(recurrenceRule).includes(targetDate);

  const rule = parseRecurrenceRule(recurrenceRule);
  const frequency = rule.FREQ;
  if (!frequency) return targetDate === eventDate;

  const interval = Math.max(1, Number.parseInt(rule.INTERVAL ?? "1", 10) || 1);
  const start = dateKeyToUtc(eventDate);
  const target = dateKeyToUtc(targetDate);
  if (!start || !target) return false;
  const daysApart = Math.round((target.getTime() - start.getTime()) / 86400000);

  if (frequency === "DAILY") return daysApart % interval === 0;
  if (frequency === "WEEKLY") {
    const allowedDays = (rule.BYDAY ?? dayCodeForDateKey(eventDate)).split(",");
    return allowedDays.includes(dayCodeForDateKey(targetDate)) && Math.floor(daysApart / 7) % interval === 0;
  }
  if (frequency === "MONTHLY") {
    const monthsApart = (target.getUTCFullYear() - start.getUTCFullYear()) * 12 + target.getUTCMonth() - start.getUTCMonth();
    if (monthsApart < 0 || monthsApart % interval !== 0) return false;
    if (rule.BYMONTHDAY) return rule.BYMONTHDAY.split(",").map(Number).includes(target.getUTCDate());
    if (rule.BYDAY) return matchesMonthlyByDay(target, rule);
    return target.getUTCDate() === start.getUTCDate();
  }
  if (frequency === "YEARLY") {
    const yearsApart = target.getUTCFullYear() - start.getUTCFullYear();
    return yearsApart >= 0 && yearsApart % interval === 0 && target.getUTCMonth() === start.getUTCMonth() && target.getUTCDate() === start.getUTCDate();
  }
  return targetDate === eventDate;
};

export const getNextOccurrenceDate = (event = {}, options = {}) => {
  const eventDate = typeof event.start_datetime === "string" ? event.start_datetime.slice(0, 10) : "";
  if (!eventDate) return null;
  const timeZone = options.timeZone || event.timezone || DEFAULT_TIME_ZONE;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const fromDate = options.fromDate || getLocalDateKey(now, timeZone);
  if (!isRecurringEvent(event)) return eventDate >= fromDate ? eventDate : null;

  const endDate = getRecurrenceEndDate(event);
  const twoYearsFromStart = addDaysToDateKey(fromDate, 730);
  const scanEnd = endDate && endDate < twoYearsFromStart ? endDate : twoYearsFromStart;
  for (let date = fromDate; date <= scanEnd; date = addDaysToDateKey(date, 1)) {
    if (occursOn(eventDate, date, event.recurrence_rule ?? "", endDate ?? "")) return date;
  }
  return null;
};

const isCurrentEventAt = (event = {}, now, today) => {
  if (event.publish_ready !== true || event.active === false) return false;
  if (!PUBLIC_CURRENT_STATUSES.has(event.status)) return false;

  if (isRecurringEvent(event)) {
    return Boolean(getNextOccurrenceDate(event, { fromDate: today, timeZone: event.timezone || DEFAULT_TIME_ZONE }));
  }

  if (event.end_datetime) {
    const end = new Date(event.end_datetime);
    return !Number.isNaN(end.getTime()) && end >= now;
  }

  const startDate = typeof event.start_datetime === "string"
    ? event.start_datetime.slice(0, 10)
    : null;
  return Boolean(startDate && startDate >= today);
};

export const isCurrentEvent = (event = {}, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const timeZone = options.timeZone || event.timezone || DEFAULT_TIME_ZONE;
  return isCurrentEventAt(event, now, getLocalDateKey(now, timeZone));
};

export const isArchivedEvent = (event = {}, options = {}) => event.publish_ready === true && !isCurrentEvent(event, options);

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "") ?? null;

export const resolveEventLocation = (event = {}, businessIndexOrBusinesses = new Map()) => {
  const businessIndex = businessIndexOrBusinesses instanceof Map
    ? businessIndexOrBusinesses
    : buildBusinessIndex(businessIndexOrBusinesses);
  const venueSlugs = getEventVenueSlugs(event);
  const venues = venueSlugs.map((slug) => businessIndex.get(slug)).filter(Boolean);
  const primaryVenue = venues[0] || null;

  const address = firstValue(
    event.address,
    event.street_address,
    primaryVenue?.street_address,
    primaryVenue?.address
  );
  const city = firstValue(event.city, primaryVenue?.city);
  const state = firstValue(event.state, primaryVenue?.state);
  const postalCode = firstValue(
    event.postal_code,
    event.zip_code,
    primaryVenue?.postal_code,
    primaryVenue?.zip_code
  );
  const coordinates = chooseCoordinatePair(event, primaryVenue);
  const venueName = firstValue(
    event.venue_name,
    event.location_name,
    primaryVenue?.business_name
  ) || "";
  const locationText = [address, city, state, postalCode].filter(Boolean).join(", ");

  return {
    venueSlugs,
    venues,
    primaryVenue,
    venueName,
    address,
    city: city || "",
    state: state || "",
    postalCode,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    coordinates,
    mapReady: coordinates.usableForMap,
    locationText,
    mapUrl: locationText
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`
      : null
  };
};

export const withResolvedEventLocation = (event = {}, businessIndexOrBusinesses = new Map()) => {
  const location = resolveEventLocation(event, businessIndexOrBusinesses);
  return {
    ...event,
    venue_slugs: location.venueSlugs,
    venue_name: location.venueName,
    address: location.address,
    city: location.city,
    state: location.state,
    postal_code: location.postalCode,
    latitude: location.latitude,
    longitude: location.longitude,
    coordinate_status: location.coordinates.status,
    coordinate_source: location.coordinates.source,
    map_ready: location.mapReady,
    resolved_location: location
  };
};

const sortCurrentEvents = (events = []) => events.sort((a, b) => {
  const recurringDifference = Number(isRecurringEvent(a)) - Number(isRecurringEvent(b));
  if (recurringDifference !== 0) return recurringDifference;
  return new Date(a.start_datetime || "9999-12-31").getTime()
    - new Date(b.start_datetime || "9999-12-31").getTime();
});

export const getCurrentEvents = (events = [], options = {}) => {
  if (!Array.isArray(events)) return [];

  if (!hasCustomOptions(options)) {
    const cached = currentEventsCache.get(events);
    if (cached) return cached;
  }

  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const todayByTimeZone = new Map();
  const currentEvents = [];

  for (const event of events) {
    const timeZone = options.timeZone || event.timezone || DEFAULT_TIME_ZONE;
    let today = todayByTimeZone.get(timeZone);
    if (!today) {
      today = getLocalDateKey(now, timeZone);
      todayByTimeZone.set(timeZone, today);
    }
    if (isCurrentEventAt(event, now, today)) currentEvents.push(event);
  }

  sortCurrentEvents(currentEvents);

  if (!hasCustomOptions(options)) {
    currentEventsCache.set(events, currentEvents);
  }
  return currentEvents;
};

export const buildVenueEventIndex = (events = []) => {
  if (!Array.isArray(events)) return new Map();
  const cached = venueEventsIndexCache.get(events);
  if (cached) return cached;

  const index = new Map();
  for (const event of getCurrentEvents(events)) {
    for (const venueSlug of getEventVenueSlugs(event)) {
      const venueEvents = index.get(venueSlug);
      if (venueEvents) venueEvents.push(event);
      else index.set(venueSlug, [event]);
    }
  }

  venueEventsIndexCache.set(events, index);
  return index;
};

export const getEventsAtVenue = (events = [], venueSlug, options = {}) => {
  if (!venueSlug || !Array.isArray(events)) return [];

  if (hasCustomOptions(options)) {
    const venueEvents = events.filter((event) => getEventVenueSlugs(event).includes(venueSlug));
    return getCurrentEvents(venueEvents, options);
  }

  return buildVenueEventIndex(events).get(venueSlug) || [];
};
