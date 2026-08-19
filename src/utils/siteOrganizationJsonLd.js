import {
  buildSchemaId,
  toAbsoluteUrl,
  toAbsoluteUrlList,
  withSchemaContext
} from "./jsonLd.js";

const ORGANIZATION_NAME = "Texoma Weekend Guide";
const ORGANIZATION_DESCRIPTION = "Texoma Weekend Guide is a regional events and local business guide serving the Texoma region of North Texas and Southern Oklahoma.";
const ORGANIZATION_EMAIL = "texomaweekendguide@gmail.com";
const ORGANIZATION_LOGO_PATH = "/images/logo.jpg";
const ORGANIZATION_SLOGAN = "Discover Local. Make Memories.";
const ORGANIZATION_SOCIAL_URLS = [
  "https://www.facebook.com/TexomaWeekendGuide/",
  "https://www.instagram.com/texomaweekendguide/"
];

export const buildSiteOrganizationJsonLd = (siteUrl) => withSchemaContext({
  "@type": "Organization",
  "@id": buildSchemaId("/", "organization", siteUrl),
  name: ORGANIZATION_NAME,
  url: toAbsoluteUrl("/", siteUrl),
  logo: toAbsoluteUrl(ORGANIZATION_LOGO_PATH, siteUrl),
  description: ORGANIZATION_DESCRIPTION,
  email: ORGANIZATION_EMAIL,
  slogan: ORGANIZATION_SLOGAN,
  sameAs: toAbsoluteUrlList(ORGANIZATION_SOCIAL_URLS, siteUrl),
  areaServed: {
    "@type": "Place",
    name: "Texoma region of North Texas and Southern Oklahoma"
  }
});

export {
  ORGANIZATION_DESCRIPTION,
  ORGANIZATION_EMAIL,
  ORGANIZATION_LOGO_PATH,
  ORGANIZATION_NAME,
  ORGANIZATION_SLOGAN,
  ORGANIZATION_SOCIAL_URLS
};
