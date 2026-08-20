import { rename } from "node:fs/promises";
import sharp from "sharp";

const badgeFiles = [
  "public/images/badges/listed-on-texoma-weekend-guide-horizontal.png",
  "public/images/badges/listed-on-texoma-weekend-guide-square.png"
];

for (const file of badgeFiles) {
  const tempFile = `${file}.truecolor.tmp.png`;

  await sharp(file)
    .ensureAlpha()
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: true
    })
    .toFile(tempFile);

  await rename(tempFile, file);
  console.log(`Re-encoded badge as truecolor RGBA PNG: ${file}`);
}
