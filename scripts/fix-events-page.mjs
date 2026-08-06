import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/pages/events.astro", import.meta.url);
let source = await readFile(path, "utf8");
let changed = false;

const brokenFilter = ".filter(/^\\d{8}$/)";
const fixedFilter = ".filter((entry) => /^\\d{8}$/.test(entry))";
if (source.includes(brokenFilter)) {
  source = source.replace(brokenFilter, fixedFilter);
  changed = true;
}

const oldLabel = 'recurring ? `Recurring · Next ${formatDate(event.next_occurrence_date)}` : formatDate(event.start_datetime)';
const newLabel = 'recurring ? `Recurring · ${event.next_occurrence_date === today ? "Today" : event.next_occurrence_date === addDays(today, 1) ? "Tomorrow" : formatDate(event.next_occurrence_date)}` : formatDate(event.start_datetime)';
if (source.includes(oldLabel)) {
  source = source.replace(oldLabel, newLabel);
  changed = true;
}

if (changed) {
  await writeFile(path, source, "utf8");
  console.log("Repaired events page filters and recurring date labels.");
} else {
  console.log("Events page repairs already applied.");
}
