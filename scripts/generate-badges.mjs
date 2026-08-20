import { readFile } from "node:fs/promises";
import sharp from "sharp";

const logoPath = "public/images/logo.jpg";
const logoBase64 = (await readFile(logoPath)).toString("base64");
const logoDataUri = `data:image/jpeg;base64,${logoBase64}`;

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
  const sourceSvg = await readFile(badge.source, "utf8");
  const embeddedSvg = sourceSvg.replace(
    /href="data:image\/jpeg;base64,[^"]+"/g,
    `href="${logoDataUri}"`
  );

  if (embeddedSvg === sourceSvg) {
    throw new Error(`Badge source is missing the embedded logo placeholder: ${badge.source}`);
  }

  await sharp(Buffer.from(embeddedSvg))
    .resize(badge.width, badge.height, { fit: "fill" })
    .ensureAlpha()
    .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
    .toFile(badge.output);

  console.log(`Generated badge PNG with TWG logo: ${badge.output}`);
}
