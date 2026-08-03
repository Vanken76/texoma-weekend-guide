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

const venueRelationshipPatches = new Map([
  [
    "country-line-dance-class-mckinney",
    {
      venue_slug: "the-dance-collective-mckinney",
      venue_name: "The Dance Collective McKinney"
    }
  ],
  [
    "two-step-in-mckinney",
    {
      venue_slug: "the-dance-collective-mckinney",
      venue_name: "The Dance Collective McKinney"
    }
  ],
  [
    "swing-rumba-dance-lessons-denison",
    {
      venue_slug: "the-venue-on-main-denison",
      venue_name: "The Venue on Main"
    }
  ]
]);

let changed = false;

const originalEventCount = Array.isArray(directory.events) ? directory.events.length : 0;
directory.events = (directory.events ?? []).filter((event) => event.event_slug !== duplicateDannySlug);
if (directory.events.length !== originalEventCount) changed = true;

for (const event of directory.events) {
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

  const patch = venueRelationshipPatches.get(event.event_slug);
  if (!patch) continue;

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

  event.updated_on = "2026-08-02";
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
  console.log("Patched event venue relationships and removed the duplicate Danny K event.");
} else {
  console.log("Event venue relationships already patched.");
}
