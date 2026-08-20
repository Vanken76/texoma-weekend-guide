import sharp from "sharp";

const badges = [
  {
    source: "scripts/badge-sources/listed-horizontal.svg",
    output: "public/images/badges/listed-on-texoma-weekend-guide-horizontal.png",
    width: 1200,
    height: 400
  },
  {
    source: "scripts/badge-sources/listed-square.svg",
    output: "public/images/badges/listed-on-texoma-weekend-guide-square.png",
    width: 600,
    height: 600
  }
];

for (const badge of badges) {
  await sharp(badge.source)
    .resize(badge.width, badge.height, { fit: "fill" })
    .ensureAlpha()
    .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
    .toFile(badge.output);

  console.log(`Generated badge PNG: ${badge.output}`);
}
