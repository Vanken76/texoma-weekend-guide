import {
  buildSchemaId,
  toAbsoluteUrl,
  withSchemaContext
} from "./jsonLd.js";
import {
  ORGANIZATION_DESCRIPTION,
  ORGANIZATION_NAME
} from "./siteOrganizationJsonLd.js";

export const buildSiteWebSiteJsonLd = (siteUrl) => withSchemaContext({
  "@type": "WebSite",
  "@id": buildSchemaId("/", "website", siteUrl),
  name: ORGANIZATION_NAME,
  url: toAbsoluteUrl("/", siteUrl),
  description: ORGANIZATION_DESCRIPTION,
  inLanguage: "en-US",
  publisher: {
    "@id": buildSchemaId("/", "organization", siteUrl)
  }
});
