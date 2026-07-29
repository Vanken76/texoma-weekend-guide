import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("public/data/local-event-directory.json");
const directory = JSON.parse(fs.readFileSync(filePath, "utf8"));

const sloppyJoesSlugs = new Set([
  "karaoke-julian-entertainer-sloppy-joes-august-13-2026",
  "karaoke-julian-entertainer-sloppy-joes-august-27-2026",
  "ukuadri-live-at-sloppy-joes"
]);

let changed = false;

for (const event of directory.events ?? []) {
  if (!sloppyJoesSlugs.has(event.event_slug)) continue;

  if (event.venue_slug !== "sloppy-joes-bar-and-grill-texas") {
    event.venue_slug = "sloppy-joes-bar-and-grill-texas";
    changed = true;
  }

  if (event.venue_name !== "Sloppy Joe’s Bar and Grill Texas") {
    event.venue_name = "Sloppy Joe’s Bar and Grill Texas";
    changed = true;
  }

  event.updated_on = "2026-07-29";
}

if (changed) {
  fs.writeFileSync(filePath, `${JSON.stringify(directory, null, 2)}\n`);
  console.log("Patched Sloppy Joe’s event venue relationships.");
} else {
  console.log("Sloppy Joe’s event venue relationships already patched.");
}
