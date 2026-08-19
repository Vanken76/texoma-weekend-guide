import { getBusinessSchemaTypeDecision } from "./businessSchemaType.js";
import {
  buildSchemaId,
  pruneJsonLd,
  toAbsoluteUrl,
  toAbsoluteUrlList,
  withSchemaContext
} from "./jsonLd.js";

const DAY_OF_WEEK_URLS = {
  monday: "https://schema.org/Monday",
  tuesday: "https://schema.org/Tuesday",
  wednesday: "https://schema.org/Wednesday",
  thursday: "https://schema.org/Thursday",
  friday: "https://schema.org/Friday",
  saturday: "https://schema.org/Saturday",
  sunday: "https://schema.org/Sunday"
};

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "AccountingService",
  "AutoDealer",
  "AutoRepair",
  "Bakery",
  "BankOrCreditUnion",
  "BarOrPub",
  "BeautySalon",
  "BedAndBreakfast",
  "BikeStore",
  "BookStore",
  "BowlingAlley",
  "Brewery",
  "CafeOrCoffeeShop",
  "ClothingStore",
  "ConvenienceStore",
  "DaySpa",
  "Dentist",
  "Distillery",
  "Electrician",
  "ElectronicsStore",
  "FastFoodRestaurant",
  "Florist",
  "FurnitureStore",
  "GasStation",
  "GeneralContractor",
  "GolfCourse",
  "GroceryStore",
  "HairSalon",
  "HardwareStore",
  "HealthClub",
  "HobbyShop",
  "Hospital",
  "Hotel",
  "IceCreamShop",
  "InsuranceAgency",
  "JewelryStore",
  "LegalService",
  "LiquorStore",
  "LodgingBusiness",
  "MedicalClinic",
  "Motel",
  "MovingCompany",
  "MusicStore",
  "NailSalon",
  "PawnShop",
  "PetStore",
  "Pharmacy",
  "Plumber",
  "RealEstateAgent",
  "Resort",
  "Restaurant",
  "RoofingContractor",
  "ShoeStore",
  "SportingGoodsStore",
  "Store",
  "TattooParlor",
  "ToyStore",
  "TravelAgency",
  "VacationRental",
  "Winery"
]);

const PURE_ORGANIZATION_TYPES = new Set([
  "Organization",
  "GovernmentOrganization"
]);

const firstNonEmpty = (...values) => values.find((value) => {
  if (value === undefined || value === null) return false;
  return typeof value === "string" ? Boolean(value.trim()) : true;
}) ?? null;

const numberInRangeOrNull = (value, minimum, maximum) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
};

const normalizeCountry = (value, state) => {
  const raw = String(value || "").trim();
  if (/^(us|usa|united states|united states of america)$/i.test(raw)) return "US";
  if (raw) return raw;
  if (/^(tx|texas|ok|oklahoma)$/i.test(String(state || "").trim())) return "US";
  return null;
};

const parseLegacyAddress = (value) => {
  if (!value || typeof value !== "string") return null;
  const locationOnly = value.split(/\s+[—–]\s+/)[0].trim();
  const match = locationOnly.match(/^(.+),\s*([^,]+),\s*(TX|OK)\s+(\d{5}(?:-\d{4})?)$/i);
  if (!match) return null;

  return {
    streetAddress: match[1].trim(),
    addressLocality: match[2].trim(),
    addressRegion: match[3].toUpperCase(),
    postalCode: match[4]
  };
};

export const resolveBusinessPostalAddress = (business = {}) => {
  const explicit = {
    streetAddress: firstNonEmpty(business.street_address, business.address),
    addressLocality: firstNonEmpty(business.city, business.locality),
    addressRegion: firstNonEmpty(business.state, business.region),
    postalCode: firstNonEmpty(business.zip_code, business.postal_code),
    addressCountry: firstNonEmpty(business.country, business.address_country)
  };

  const hasExplicitDetails = Boolean(
    explicit.streetAddress || explicit.addressLocality || explicit.addressRegion || explicit.postalCode
  );
  const legacy = hasExplicitDetails ? null : parseLegacyAddress(business.service_area_or_location);
  const fields = legacy || explicit;
  const hasAddress = Boolean(
    fields.streetAddress || fields.addressLocality || fields.addressRegion || fields.postalCode
  );

  if (!hasAddress) return null;

  return pruneJsonLd({
    "@type": "PostalAddress",
    streetAddress: fields.streetAddress,
    addressLocality: fields.addressLocality,
    addressRegion: fields.addressRegion,
    postalCode: fields.postalCode,
    addressCountry: normalizeCountry(fields.addressCountry, fields.addressRegion)
  }) || null;
};

const parseClockTime = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "00");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const meridiem = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const parseDailyHours = (value) => {
  const raw = String(value || "").trim();
  if (!raw || /^closed$/i.test(raw)) return null;
  if (/\b(seasonal|summer|winter)\b/i.test(raw)) return null;
  if (/^(open\s+)?24\s*hours?$/i.test(raw)) return { opens: "00:00", closes: "23:59" };

  const match = raw.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))$/i);
  if (!match) return null;

  const opens = parseClockTime(match[1]);
  const closes = parseClockTime(match[2]);
  return opens && closes ? { opens, closes } : null;
};

export const buildOpeningHoursSpecification = (business = {}) => {
  if (!business.hours || typeof business.hours !== "object" || Array.isArray(business.hours)) return [];
  if (/\b(seasonal|summer schedule|winter schedule)\b/i.test(String(business.hours_note || ""))) return [];

  return Object.entries(business.hours)
    .map(([day, value]) => {
      const dayOfWeek = DAY_OF_WEEK_URLS[String(day || "").trim().toLowerCase()];
      const hours = parseDailyHours(value);
      if (!dayOfWeek || !hours) return null;
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek,
        opens: hours.opens,
        closes: hours.closes
      };
    })
    .filter(Boolean);
};

const buildBusinessSameAs = (business, siteUrl) => toAbsoluteUrlList([
  business.website,
  business.facebook_url || business.facebook,
  business.instagram_url || business.instagram,
  business.youtube_url || business.youtube,
  business.tiktok_url || business.tiktok,
  business.twitter_url || business.twitter,
  business.x_url
].filter(Boolean), siteUrl);

const buildBusinessImages = (business, siteUrl) => toAbsoluteUrlList([
  business.image,
  business.image_url,
  business.logo,
  business.logo_url
].filter(Boolean), siteUrl);

export const getBusinessJsonLdEligibility = ({
  business = {},
  siteUrl,
  canonicalPath = null
} = {}) => {
  const reasons = [];
  const name = firstNonEmpty(business.business_name, business.name);
  const path = canonicalPath || (business.slug ? `/businesses/${business.slug}/` : null);
  const canonicalUrl = toAbsoluteUrl(path, siteUrl);

  if (!name) reasons.push("missing_business_name");
  if (!canonicalUrl) reasons.push("missing_canonical_url");

  return {
    eligible: reasons.length === 0,
    reasons,
    canonicalUrl
  };
};

export const buildBusinessJsonLd = ({
  business = {},
  siteUrl,
  canonicalPath = null
} = {}) => {
  const eligibility = getBusinessJsonLdEligibility({ business, siteUrl, canonicalPath });
  if (!eligibility.eligible) return null;

  const typeDecision = getBusinessSchemaTypeDecision(business);
  const schemaType = typeDecision.schemaType;
  const canonicalUrl = eligibility.canonicalUrl;
  const name = firstNonEmpty(business.business_name, business.name);
  const address = resolveBusinessPostalAddress(business);
  const latitude = numberInRangeOrNull(business.latitude, -90, 90);
  const longitude = numberInRangeOrNull(business.longitude, -180, 180);
  const geo = !PURE_ORGANIZATION_TYPES.has(schemaType) && latitude !== null && longitude !== null
    ? { "@type": "GeoCoordinates", latitude, longitude }
    : null;
  const openingHoursSpecification = !PURE_ORGANIZATION_TYPES.has(schemaType)
    ? buildOpeningHoursSpecification(business)
    : [];
  const images = buildBusinessImages(business, siteUrl);
  const sameAs = buildBusinessSameAs(business, siteUrl);

  return withSchemaContext({
    "@type": schemaType,
    "@id": buildSchemaId(canonicalUrl, "entity", siteUrl),
    name,
    url: canonicalUrl,
    description: firstNonEmpty(business.description, business.short_description),
    image: images,
    address,
    geo,
    telephone: firstNonEmpty(business.phone, business.telephone),
    email: firstNonEmpty(business.email),
    sameAs,
    openingHoursSpecification,
    priceRange: LOCAL_BUSINESS_TYPES.has(schemaType) ? firstNonEmpty(business.price_range) : null
  });
};

export { LOCAL_BUSINESS_TYPES, PURE_ORGANIZATION_TYPES };
