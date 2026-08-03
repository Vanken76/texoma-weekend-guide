const DEFAULT_TIME_ZONE = "America/Chicago";
const PUBLIC_CURRENT_STATUSES = new Set(["upcoming", "recurring"]);

export const toArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

export const uniqueStrings = (...values) => [...new Set(
  values.flatMap(toArray).filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)
)];

export const getEventVenueSlugs = (event = {}) => uniqueStrings(
  event.venue_slugs,
  event.venue_slug,
  event.secondary_venue_slugs
);

export const buildBusinessIndex = (businesses = []) => new Map(
  businesses.filter((business) => business?.slug).map((business) => [business.slug, business])
);

export const parseRecurrenceRule = (rule = "") => Object.fromEntries(
  String(rule)
    .replace(/^RRULE:/i, "")
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

export const getLocalDateKey = (date = new Date(), timeZone = DEFAULT_TIME_ZONE) => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(date);

export const isRecurringEvent = (event = {}) => event.recurring === true || event.status === "recurring";

export const isCurrentEvent = (event = {}, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const timeZone = options.timeZone || event.timezone || DEFAULT_TIME_ZONE;
  const today = getLocalDateKey(now, timeZone);

  if (event.publish_ready !== true || event.active === false) return false;
  if (!PUBLIC_CURRENT_STATUSES.has(event.status)) return false;

  if (isRecurringEvent(event)) {
    const recurrenceEnd = getRecurrenceEndDate(event);
    return !recurrenceEnd || recurrenceEnd >= today;
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
  const latitude = firstValue(event.latitude, primaryVenue?.latitude);
  const longitude = firstValue(event.longitude, primaryVenue?.longitude);
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
    latitude,
    longitude,
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
    resolved_location: location
  };
};

export const getCurrentEvents = (events = [], options = {}) => events
  .filter((event) => isCurrentEvent(event, options))
  .sort((a, b) => {
    const recurringDifference = Number(isRecurringEvent(a)) - Number(isRecurringEvent(b));
    if (recurringDifference !== 0) return recurringDifference;
    return new Date(a.start_datetime || "9999-12-31").getTime()
      - new Date(b.start_datetime || "9999-12-31").getTime();
  });

export const getEventsAtVenue = (events = [], venueSlug, options = {}) => {
  if (!venueSlug) return [];
  return getCurrentEvents(events, options)
    .filter((event) => getEventVenueSlugs(event).includes(venueSlug));
};
