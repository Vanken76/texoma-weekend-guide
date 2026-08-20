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
    height: 400,
    transformSvg(svg) {
      return svg.replace(
        '<text x="365" y="242" font-family="Arial, Helvetica, sans-serif" font-size="63" font-weight="900" fill="#103a58">TEXOMA WEEKEND GUIDE</text>',
        '<text x="365" y="242" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="900" fill="#103a58" textLength="700" lengthAdjust="spacingAndGlyphs">TEXOMA WEEKEND GUIDE</text>'
      );
    }
  },
  {
    source: "scripts/badge-sources/listed-square.svg",
    output: "public/images/badges/listed-on-texoma-weekend-guide-square.png",
    width: 600,
    height: 600,
    transformSvg(svg) {
      return svg
        .replace(
          '<text x="300" y="479" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" fill="#2b8c91" letter-spacing="3">WEEKEND GUIDE</text>',
          '<text x="300" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" fill="#2b8c91" letter-spacing="3">WEEKEND GUIDE</text>'
        )
        .replace('    <line x1="155" y1="512" x2="445" y2="512" stroke="#2b8c91" stroke-width="5"/>\n', '')
        .replace('    <text x="300" y="548" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#103a58" letter-spacing="4">LOCAL BUSINESS DIRECTORY</text>\n', '');
    }
  }
];

for (const badge of badges) {
  const sourceSvg = await readFile(badge.source, "utf8");
  let preparedSvg = badge.transformSvg ? badge.transformSvg(sourceSvg) : sourceSvg;

  if (preparedSvg === sourceSvg && badge.transformSvg) {
    throw new Error(`Expected badge layout transform did not apply: ${badge.source}`);
  }

  const embeddedSvg = preparedSvg.replace(
    /href="data:image\/jpeg;base64,[^"]+"/g,
    `href="${logoDataUri}"`
  );

  if (embeddedSvg === preparedSvg) {
    throw new Error(`Badge source is missing the embedded logo placeholder: ${badge.source}`);
  }

  await sharp(Buffer.from(embeddedSvg))
    .resize(badge.width, badge.height, { fit: "fill" })
    .ensureAlpha()
    .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
    .toFile(badge.output);

  console.log(`Generated badge PNG with TWG logo: ${badge.output}`);
}
