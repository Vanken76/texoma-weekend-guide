import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const parts = [
  ".roundup-comparison-final/chunk-00.txt",
  ".roundup-comparison-final/chunk-01.txt",
  ".roundup-comparison-final/chunk-02.txt",
  ".roundup-comparison-final/chunk-03.txt",
  ".roundup-comparison-final/chunk-04.txt",
];

const encoded = (
  await Promise.all(parts.map((file) => readFile(file, "utf8")))
)
  .map((part) => part.trim())
  .join("");

if (encoded.length !== 36548) {
  throw new Error(`Comparison asset base64 length mismatch: ${encoded.length}`);
}

const output = Buffer.from(encoded, "base64");

if (output.length !== 27410) {
  throw new Error(`Comparison asset byte length mismatch: ${output.length}`);
}

const hash = createHash("sha256").update(output).digest("hex");
const expected = "60fdf9f542cf177fa14afc81de96d3f76b62a092f67c03b096f9097b321a6560";

if (hash !== expected) {
  throw new Error(`Comparison asset SHA-256 mismatch: ${hash}`);
}

const target = "public/images/roundup-upgrade-comparison.webp";
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);

console.log(`Built ${target} (${output.length} bytes, sha256 ${hash})`);
