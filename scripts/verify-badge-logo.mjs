import { readFile } from "node:fs/promises";

const sourceFiles = [
  "scripts/badge-sources/listed-horizontal.svg",
  "scripts/badge-sources/listed-square.svg"
];

for (const source of sourceFiles) {
  const svg = await readFile(source, "utf8");
  if (!/href="data:image\/jpeg;base64,[^"]+"/.test(svg)) {
    throw new Error(`Expected embedded logo placeholder in ${source}`);
  }
}

const logo = await readFile("public/images/logo.jpg");
if (logo.length < 1000) {
  throw new Error("TWG logo asset is unexpectedly small or missing");
}

console.log("Badge logo source verification passed.");
