import { getBusinessSchemaType } from "./businessSchemaType.js";
import {
  buildSchemaId,
  pruneJsonLd,
  toAbsoluteUrl,
  withSchemaContext
} from "./jsonLd.js";

const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

// Types in the TWG mapper that are organizations but are not safely modeled as Places.
const ORGANIZATION_ONLY_TYPES = new Set([
  "Organization",
  "GovernmentOrganization",
  "CollegeOrUniversity",
  "Preschool",
  "ElementarySchool",
  "MiddleSchool",
  "HighSchool",
  "School"
]);

// Types in the TWG mapper that are safely modeled as Places but not assumed to be organizations.
const PLACE_ONLY_TYPES = new Set([
  "Place",
  "State",
  "City",
  "AdministrativeArea",
  "BodyOfWater",
  "CityHall",
  "Courthouse",
  "FireStation",
  "PoliceStation",
  "Airport",
  "PostOffice",
  "GovernmentOffice",
  "Church",
  "PlaceOfWorship",
  "Park",
  "Playground",
  "Beach",
  "Campground",
  "RVPark",
  "Museum",
  "PerformingArtsTheater",
  "MusicVenue",
  "EventVenue",
  "StadiumOrArena",
  "SportsActivityLocation",
  "TouristAttraction",
  "TouristInformationCenter",
  "CivicStructure"
]);

// These mapper outputs inherit from LocalBusiness (or otherwise safely function as both
// Organization and Place for the relationship properties used here).
const ORGANIZATION_AND_PLACE_TYPES = new Set([
  "LocalBusiness",
  "AccountingService",
  "AmusementPark",
  "ArtGallery",
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
  "Library",
  "LiquorStore",
  "LodgingBusiness",
  "MedicalClinic",
  "Motel",
  "MovingCompany",
  "MovieTheater",
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

const GEOGRAPHY_TYPES = {
  state: "State",
  city: "City",
  county: "AdministrativeArea",
  region: "AdministrativeArea",
  administrative_area: "AdministrativeArea",
  lake: "BodyOfWater",
  reservoir: "BodyOfWater",
  river: "BodyOfWater"
};

const ORGANIZATION_RELATION_KINDS = new Set([
  "organization",
  "organizational",
  "parent_organization",
  "sub_organization",
  "department"
]);

export const isBusinessSchemaPlaceType = (schemaType) =>
  PLACE_ONLY_TYPES.has(schemaType) || ORGANIZATION_AND_PLACE_TYPES.has(schemaType);

export const isBusinessSchemaOrganizationType = (schemaType) =>
  ORGANIZATION_ONLY_TYPES.has(schemaType) || ORGANIZATION_AND_PLACE_TYPES.has(schemaType);

const relationKind = (reference) => String(
  reference?.relationship_type ||
  reference?.relationshipType ||
  reference?.relation_type ||
  reference?.relationType ||
  ""
).trim().toLowerCase();

const getReferenceSlug = (reference) => {
  if (typeof reference === "string") return reference.trim() || null;
  if (!reference || typeof reference !== "object") return null;
  return String(reference.slug || reference.business_slug || reference.businessSlug || "").trim() || null;
};

const resolvePublishedBusiness = (reference, businessBySlug) => {
  const slug = getReferenceSlug(reference);
  if (!slug || !businessBySlug || typeof businessBySlug.get !== "function") return null;
  const business = businessBySlug.get(slug);
  return business?.publish_ready === true && business.slug && business.business_name ? business : null;
};

const uniqueNodes = (nodes) => {
  const seen = new Set();
  return nodes.filter((node) => {
    if (!node) return false;
    const key = node["@id"] || `${node["@type"] || "Thing"}:${node.name || node.url || ""}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildBusinessEntityReference = (business, siteUrl) => {
  if (!business?.slug || !business?.business_name || business.publish_ready !== true) return null;
  const schemaType = getBusinessSchemaType(business);
  const url = toAbsoluteUrl(`/businesses/${business.slug}/`, siteUrl);
  if (!url) return null;

  return pruneJsonLd({
    "@type": schemaType,
    "@id": buildSchemaId(url, "entity", siteUrl),
    name: business.business_name,
    url
  }) || null;
};

export const buildEventEntityReference = (event, siteUrl) => {
  if (!event?.event_slug || !event?.event_name || event.publish_ready !== true) return null;
  const url = toAbsoluteUrl(`/events/${event.event_slug}/`, siteUrl);
  if (!url) return null;

  return pruneJsonLd({
    "@type": "Event",
    "@id": buildSchemaId(url, "event", siteUrl),
    name: event.event_name,
    url
  }) || null;
};

const buildGeographyReference = (reference, businessBySlug, siteUrl) => {
  const canonicalBusiness = resolvePublishedBusiness(reference, businessBySlug);
  if (canonicalBusiness) {
    const schemaType = getBusinessSchemaType(canonicalBusiness);
    return isBusinessSchemaPlaceType(schemaType)
      ? buildBusinessEntityReference(canonicalBusiness, siteUrl)
      : null;
  }

  if (!reference || typeof reference !== "object") return null;
  const entityType = String(reference.entity_type || reference.entityType || "").trim().toLowerCase();
  const schemaType = GEOGRAPHY_TYPES[entityType];
  const name = String(reference.name || reference.business_name || "").trim();
  if (!schemaType || !name) return null;

  return { "@type": schemaType, name };
};

const collectBusinessReferences = ({ references, businessBySlug, siteUrl, requirePlace, requireOrganization }) =>
  uniqueNodes(asArray(references).map((reference) => {
    const business = resolvePublishedBusiness(reference, businessBySlug);
    if (!business) return null;
    const schemaType = getBusinessSchemaType(business);
    if (requirePlace && !isBusinessSchemaPlaceType(schemaType)) return null;
    if (requireOrganization && !isBusinessSchemaOrganizationType(schemaType)) return null;
    return buildBusinessEntityReference(business, siteUrl);
  }));

export const buildBusinessRelationshipJsonLd = ({
  business = {},
  businessBySlug,
  relatedEvents = [],
  siteUrl
} = {}) => {
  if (!business?.slug || !business?.business_name || business.publish_ready !== true) return null;

  const schemaType = getBusinessSchemaType(business);
  const currentIsPlace = isBusinessSchemaPlaceType(schemaType);
  const currentIsOrganization = isBusinessSchemaOrganizationType(schemaType);
  const currentUrl = toAbsoluteUrl(`/businesses/${business.slug}/`, siteUrl);
  if (!currentUrl) return null;

  const parentReferences = asArray(business.parent_business ?? business.parentBusiness);
  const childReferences = asArray(business.child_businesses ?? business.childBusinesses);

  const containedInPlace = [];
  const containsPlace = [];
  const parentOrganization = [];
  const subOrganization = [];

  for (const reference of parentReferences) {
    const parent = resolvePublishedBusiness(reference, businessBySlug);
    if (!parent) continue;
    const parentType = getBusinessSchemaType(parent);
    const ref = buildBusinessEntityReference(parent, siteUrl);
    if (!ref) continue;

    if (ORGANIZATION_RELATION_KINDS.has(relationKind(reference))) {
      if (currentIsOrganization && isBusinessSchemaOrganizationType(parentType)) parentOrganization.push(ref);
    } else if (currentIsPlace && isBusinessSchemaPlaceType(parentType)) {
      containedInPlace.push(ref);
    }
  }

  for (const reference of childReferences) {
    const child = resolvePublishedBusiness(reference, businessBySlug);
    if (!child) continue;
    const childType = getBusinessSchemaType(child);
    const ref = buildBusinessEntityReference(child, siteUrl);
    if (!ref) continue;

    if (ORGANIZATION_RELATION_KINDS.has(relationKind(reference))) {
      if (currentIsOrganization && isBusinessSchemaOrganizationType(childType)) subOrganization.push(ref);
    } else if (currentIsPlace && isBusinessSchemaPlaceType(childType)) {
      containsPlace.push(ref);
    }
  }

  if (currentIsPlace) {
    for (const geography of asArray(business.related_geography ?? business.relatedGeography)) {
      const ref = buildGeographyReference(geography, businessBySlug, siteUrl);
      if (ref) containedInPlace.push(ref);
    }
  }

  const explicitParentOrganizations = collectBusinessReferences({
    references: business.parent_organization ?? business.parentOrganization,
    businessBySlug,
    siteUrl,
    requireOrganization: true
  });
  const explicitSubOrganizations = collectBusinessReferences({
    references: business.sub_organizations ?? business.subOrganizations,
    businessBySlug,
    siteUrl,
    requireOrganization: true
  });

  if (currentIsOrganization) {
    parentOrganization.push(...explicitParentOrganizations);
    subOrganization.push(...explicitSubOrganizations);
  }

  const event = (currentIsPlace || currentIsOrganization)
    ? uniqueNodes(asArray(relatedEvents).map((item) => buildEventEntityReference(item, siteUrl)))
    : [];

  const properties = pruneJsonLd({
    containedInPlace: uniqueNodes(containedInPlace),
    containsPlace: uniqueNodes(containsPlace),
    parentOrganization: uniqueNodes(parentOrganization),
    subOrganization: uniqueNodes(subOrganization),
    event
  });

  if (!properties) return null;

  const relationshipKeys = ["containedInPlace", "containsPlace", "parentOrganization", "subOrganization", "event"];
  if (!relationshipKeys.some((key) => properties[key])) return null;

  return withSchemaContext({
    "@type": schemaType,
    "@id": buildSchemaId(currentUrl, "entity", siteUrl),
    ...properties
  });
};

export const buildEventRelationshipJsonLd = ({
  event = {},
  hostBusiness = null,
  siteUrl
} = {}) => {
  if (!event?.event_slug || !event?.event_name || event.publish_ready !== true) return null;
  if (!hostBusiness) return null;

  const hostType = getBusinessSchemaType(hostBusiness);
  if (!isBusinessSchemaOrganizationType(hostType)) return null;

  const organizer = buildBusinessEntityReference(hostBusiness, siteUrl);
  const eventUrl = toAbsoluteUrl(`/events/${event.event_slug}/`, siteUrl);
  if (!organizer || !eventUrl) return null;

  return withSchemaContext({
    "@type": "Event",
    "@id": buildSchemaId(eventUrl, "event", siteUrl),
    organizer
  });
};

export {
  ORGANIZATION_ONLY_TYPES,
  PLACE_ONLY_TYPES,
  ORGANIZATION_AND_PLACE_TYPES
};
