import { readFile } from "node:fs/promises";
import { validateCoordinateRecord } from "../src/utils/locationCoordinates.js";

const loadJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

const businessDirectory = await loadJson("../public/data/local-business-directory.json");
const eventDirectory = await loadJson("../public/data/local-event-directory.json");

const businesses = businessDirectory.businesses ?? [];
const events = eventDirectory.events ?? [];

const auditRecords = (records, type, getId) => records.map((record) => {
  const result = validateCoordinateRecord(record);
  return {
    type,
    id: getId(record),
    hasPair: result.metadata.complete,
    validPair: result.metadata.valid,
    usableForMap: result.usableForMap,
    status: result.metadata.status,
    source: result.metadata.source,
    errors: result.errors,
    warnings: result.warnings
  };
});

const results = [
  ...auditRecords(businesses, "business", (record) => record.slug || record.business_name || "unknown"),
  ...auditRecords(events, "event", (record) => record.event_slug || record.event_name || "unknown")
];

const summary = results.reduce((counts, result) => {
  counts.total += 1;
  if (result.hasPair) counts.withPair += 1;
  if (result.validPair) counts.validPair += 1;
  if (result.usableForMap) counts.mapReady += 1;
  if (result.errors.length) counts.withErrors += 1;
  if (result.warnings.length) counts.withWarnings += 1;
  return counts;
}, {
  total: 0,
  withPair: 0,
  validPair: 0,
  mapReady: 0,
  withErrors: 0,
  withWarnings: 0
});

console.log(JSON.stringify({
  generated_at: new Date().toISOString(),
  summary,
  issues: results.filter((result) => result.errors.length || result.warnings.length),
  map_ready: results.filter((result) => result.usableForMap).map(({ type, id }) => ({ type, id }))
}, null, 2));

if (summary.withErrors > 0) process.exitCode = 1;
