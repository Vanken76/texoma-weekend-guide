import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/pages/events.astro", import.meta.url);
const source = await readFile(path, "utf8");
const broken = ".filter(/^\\d{8}$/)";
const fixed = ".filter((entry) => /^\\d{8}$/.test(entry))";

if (!source.includes(broken)) {
  console.log("Events page RDATE filter already valid.");
} else {
  await writeFile(path, source.replace(broken, fixed), "utf8");
  console.log("Fixed events page RDATE filter callback.");
}
