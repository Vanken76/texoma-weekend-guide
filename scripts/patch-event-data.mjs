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
const venueSlug = "sloppy-joes-bar-and-grill-texas";
const venueName = "Sloppy Joe’s Bar and Grill Texas";

let changed = false;

const originalEventCount = Array.isArray(directory.events) ? directory.events.length : 0;
directory.events = (directory.events ?? []).filter((event) => event.event_slug !== duplicateDannySlug);
if (directory.events.length !== originalEventCount) changed = true;

for (const event of directory.events) {
  if (!sloppyJoesSlugs.has(event.event_slug)) continue;

  if (event.venue_slug !== venueSlug) {
    event.venue_slug = venueSlug;
    changed = true;
  }

  if (!Array.isArray(event.venue_slugs) || event.venue_slugs.length !== 1 || event.venue_slugs[0] !== venueSlug) {
    event.venue_slugs = [venueSlug];
    changed = true;
  }

  if (event.venue_name !== venueName) {
    event.venue_name = venueName;
    changed = true;
  }

  if (event.event_slug === canonicalDannySlug && event.publish_ready !== true) {
    event.publish_ready = true;
    changed = true;
  }

  event.updated_on = "2026-07-30";
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
  console.log("Patched Sloppy Joe’s event venue relationships and removed the duplicate Danny K event.");
} else {
  console.log("Sloppy Joe’s event venue relationships already patched.");
}
