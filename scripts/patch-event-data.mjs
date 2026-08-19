import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("public/data/local-event-directory.json");
const directory = JSON.parse(fs.readFileSync(filePath, "utf8"));

const sloppyJoesSlugs = new Set([
  "karaoke-julian-entertainer-sloppy-joes-august-13-2026",
  "karaoke-julian-entertainer-sloppy-joes-august-27-2026",
  "ukuadri-live-at-sloppy-joes",
  "open-mic-with-danny-k-at-sloppy-joes-2026-07-30"
]);

const duplicateDannySlug = "open-mic-with-danny-k-at-sloppy-joes-july-30-2026";
const canonicalDannySlug = "open-mic-with-danny-k-at-sloppy-joes-2026-07-30";
const sloppyJoesVenueSlug = "sloppy-joes-bar-and-grill-texas";
const sloppyJoesVenueName = "Sloppy Joe’s Bar and Grill Texas";

const dayCodes = {
  sunday: "SU",
  sundays: "SU",
  monday: "MO",
  mondays: "MO",
  tuesday: "TU",
  tuesdays: "TU",
  wednesday: "WE",
  wednesdays: "WE",
  thursday: "TH",
  thursdays: "TH",
  friday: "FR",
  fridays: "FR",
  saturday: "SA",
  saturdays: "SA"
};

const normalizeRecurrenceRule = (value) => {
  if (value == null || String(value).trim() === "") return null;
  const rule = String(value).trim();
  if (/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[^;]+)*$/i.test(rule)) {
    return rule.toUpperCase();
  }

  const lower = rule.toLowerCase().replace(/[.]+$/, "").trim();
  if (lower === "daily" || lower === "every day") return "FREQ=DAILY";

  const weekly = lower.match(/^(?:weekly\s+on|every)\s+(.+)$/);
  if (weekly) {
    const codes = weekly[1]
      .split(/,|\band\b|&/)
      .map((part) => dayCodes[part.trim()])
      .filter(Boolean);
    if (codes.length) return `FREQ=WEEKLY;BYDAY=${[...new Set(codes)].join(",")}`;
  }

  const monthly = lower.match(/^(?:monthly\s+on\s+(?:day\s+)?)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+each\s+month)?$/);
  if (monthly) {
    const day = Number(monthly[1]);
    if (day >= 1 && day <= 31) return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
  }

  return rule;
};

const isMachineReadableRule = (value) =>
  typeof value === "string" && /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[^;]+)*$/.test(value);

const chicagoDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(date);

const dayCodeByIndex = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const dateOnly = (value) => typeof value === "string" ? value.slice(0, 10) : "";

const shiftIsoDate = (value, days) => {
  if (!value || !days) return value;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(T.*)$/);
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.toISOString().slice(0, 10)}${match[4]}`;
};

const rollWeeklyEventForward = (event) => {
  const rule = Object.fromEntries(
    String(event.recurrence_rule ?? "").split(";").map((part) => part.split("=")).filter(([key, value]) => key && value)
  );
  if (rule.FREQ !== "WEEKLY" || !event.start_datetime) return false;

  const currentDate = chicagoDate();
  const startDate = dateOnly(event.start_datetime);
  if (!startDate || startDate >= currentDate) return false;

  const allowedDays = (rule.BYDAY ?? dayCodeByIndex[new Date(`${startDate}T12:00:00Z`).getUTCDay()]).split(",");
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL ?? "1", 10) || 1);
  const original = new Date(`${startDate}T12:00:00Z`);
  let candidate = new Date(`${currentDate}T12:00:00Z`);

  for (let offset = 0; offset < 370; offset += 1) {
    const daysApart = Math.round((candidate.getTime() - original.getTime()) / 86400000);
    const dayCode = dayCodeByIndex[candidate.getUTCDay()];
    if (daysApart >= 0 && allowedDays.includes(dayCode) && Math.floor(daysApart / 7) % interval === 0) {
      const shiftDays = Math.round((candidate.getTime() - original.getTime()) / 86400000);
      event.start_datetime = shiftIsoDate(event.start_datetime, shiftDays);
      if (event.end_datetime) event.end_datetime = shiftIsoDate(event.end_datetime, shiftDays);
      event.updated_on = currentDate;
      return true;
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return false;
};

const venueRelationshipPatches = new Map([
  ["country-line-dance-class-mckinney", { venue_slug: "the-dance-collective-mckinney", venue_name: "The Dance Collective McKinney" }],
  ["two-step-in-mckinney", { venue_slug: "the-dance-collective-mckinney", venue_name: "The Dance Collective McKinney" }],
  ["swing-rumba-dance-lessons-denison", { venue_slug: "the-venue-on-main-denison", venue_name: "The Venue on Main" }],
  ["pottsboro-community-chat-2026-08-11", {
    venue_slug: "pottsboro-area-public-library",
    venue_name: "Pottsboro Area Public Library",
    host_business_slug: "pottsboro-area-public-library"
  }]
]);

let changed = false;
const normalizedRecurring = [];
const rolledRecurring = [];
const recurringWarnings = [];

const originalEventCount = Array.isArray(directory.events) ? directory.events.length : 0;
directory.events = (directory.events ?? []).filter((event) => event.event_slug !== duplicateDannySlug);
if (directory.events.length !== originalEventCount) changed = true;

for (const event of directory.events) {
  const recurringRecord = event.recurring === true || event.status === "recurring";

  if (recurringRecord) {
    if (event.recurring !== true) {
      event.recurring = true;
      changed = true;
    }

    if (event.status !== "recurring" && event.active !== false && event.publish_ready === true) {
      event.status = "recurring";
      changed = true;
    }

    const normalizedRule = normalizeRecurrenceRule(event.recurrence_rule);
    if (normalizedRule !== event.recurrence_rule) {
      event.recurrence_rule = normalizedRule;
      event.updated_on = "2026-08-06";
      normalizedRecurring.push(event.event_slug);
      changed = true;
    }

    if (event.event_slug === "karaoke-night-julian-tower-whiskey-bar-pottsboro" && event.city !== "Pottsboro") {
      event.city = "Pottsboro";
      changed = true;
    }

    if (isMachineReadableRule(event.recurrence_rule) && rollWeeklyEventForward(event)) {
      rolledRecurring.push(event.event_slug);
      changed = true;
    }

    if (event.recurrence_rule && !isMachineReadableRule(event.recurrence_rule)) {
      recurringWarnings.push(`${event.event_slug}: ${event.recurrence_rule}`);
    }
  }

  if (sloppyJoesSlugs.has(event.event_slug)) {
    if (event.venue_slug !== sloppyJoesVenueSlug) {
      event.venue_slug = sloppyJoesVenueSlug;
      changed = true;
    }
    if (!Array.isArray(event.venue_slugs) || event.venue_slugs.length !== 1 || event.venue_slugs[0] !== sloppyJoesVenueSlug) {
      event.venue_slugs = [sloppyJoesVenueSlug];
      changed = true;
    }
    if (event.venue_name !== sloppyJoesVenueName) {
      event.venue_name = sloppyJoesVenueName;
      changed = true;
    }
    if (event.event_slug === canonicalDannySlug && event.publish_ready !== true) {
      event.publish_ready = true;
      changed = true;
    }
    event.updated_on = "2026-07-30";
  }

  let patch = venueRelationshipPatches.get(event.event_slug);
  if (event.event_name === "Wednesday Night Karaoke" && event.venue_name === "902 Bar & Grill") {
    patch = { venue_slug: "902-bar-and-grill", venue_name: "902 Bar & Grill" };
  }

  if (patch) {
    if (event.venue_slug !== patch.venue_slug) {
      event.venue_slug = patch.venue_slug;
      changed = true;
    }
    if (!Array.isArray(event.venue_slugs) || event.venue_slugs.length !== 1 || event.venue_slugs[0] !== patch.venue_slug) {
      event.venue_slugs = [patch.venue_slug];
      changed = true;
    }
    if (event.venue_name !== patch.venue_name) {
      event.venue_name = patch.venue_name;
      changed = true;
    }
    if (patch.host_business_slug && event.host_business_slug !== patch.host_business_slug) {
      event.host_business_slug = patch.host_business_slug;
      changed = true;
    }
    event.updated_on = "2026-08-19";
  }
}

if (directory.event_count !== directory.events.length) {
  directory.event_count = directory.events.length;
  changed = true;
}

const publishReadyCount = directory.events.filter((event) => event.publish_ready === true).length;
if (directory.publish_ready_count !== publishReadyCount) {
  directory.publish_ready_count = publishReadyCount;
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, `${JSON.stringify(directory, null, 2)}\n`);
  console.log(`Patched event data. Normalized ${normalizedRecurring.length} recurring rule(s); rolled ${rolledRecurring.length} recurring event(s) forward.`);
} else {
  console.log("Event data already patched.");
}

if (recurringWarnings.length) {
  console.warn("Recurring records still requiring manual review:");
  recurringWarnings.forEach((warning) => console.warn(`- ${warning}`));
}
