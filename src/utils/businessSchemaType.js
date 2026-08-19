const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

const cleanTerm = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const uniqueStrings = (values) => [...new Set(
  values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
)];

export const getBusinessSchemaCategoryTerms = (business = {}) => uniqueStrings([
  business.primary_category,
  business.primaryCategory,
  ...asArray(business.category),
  ...asArray(business.categories)
]);

const rule = (id, schemaType, patterns) => ({
  id,
  schemaType,
  patterns: patterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(`\\b${pattern}\\b`, "i"))
});

const TYPE_RULES = [
  // Administrative areas and geography kept in the directory.
  rule("state", "State", [/^state$/, /\bstate geography\b/]),
  rule("city", "City", [/^city$/, /\bmunicipality\b/]),
  rule("body-of-water", "BodyOfWater", [/\blake\b/, /\breservoir\b/, /\briver\b/]),
  rule("administrative-area", "AdministrativeArea", [/^county$/, /^region$/, /^regional destination$/]),

  // Education and civic institutions.
  rule("college-university", "CollegeOrUniversity", [/\buniversity\b/, /\bcollege\b/]),
  rule("library", "Library", [/\blibrary\b/]),
  rule("preschool", "Preschool", [/\bpreschool\b/]),
  rule("elementary-school", "ElementarySchool", [/\belementary school\b/]),
  rule("middle-school", "MiddleSchool", [/\bmiddle school\b/]),
  rule("high-school", "HighSchool", [/\bhigh school\b/]),
  rule("school", "School", [/^school$/, /\bpublic school\b/, /\bprivate school\b/]),
  rule("city-hall", "CityHall", [/\bcity hall\b/, /\btown hall\b/]),
  rule("courthouse", "Courthouse", [/\bcourthouse\b/]),
  rule("fire-station", "FireStation", [/\bfire station\b/, /\bfire department station\b/]),
  rule("police-station", "PoliceStation", [/\bpolice station\b/, /\bpolice department\b/]),
  rule("airport", "Airport", [/\bairport\b/, /\bmunicipal airport\b/]),
  rule("post-office", "PostOffice", [/\bpost office\b/]),
  rule("government-office", "GovernmentOffice", [/\bgovernment office\b/, /\bdmv\b/]),
  rule("government-organization", "GovernmentOrganization", [
    /\bgovernment agency\b/,
    /\bcity government\b/,
    /\bcounty government\b/,
    /\bmunicipal government\b/,
    /\bparks and recreation department\b/
  ]),
  rule("church", "Church", [/\bchurch\b/, /\bcathedral\b/]),
  rule("place-of-worship", "PlaceOfWorship", [
    /\bplace of worship\b/,
    /\btemple\b/,
    /\bmosque\b/,
    /\bsynagogue\b/
  ]),

  // Parks, attractions, public places, and venues.
  rule("park", "Park", [/\bstate park\b/, /\bcity park\b/, /^park$/, /\bpublic park\b/]),
  rule("playground", "Playground", [/\bplayground\b/]),
  rule("beach", "Beach", [/\bbeach\b/]),
  rule("campground", "Campground", [/\bcampground\b/, /\bcamping area\b/]),
  rule("rv-park", "RVPark", [/\brv park\b/, /\brecreational vehicle park\b/]),
  rule("museum", "Museum", [/\bmuseum\b/]),
  rule("art-gallery", "ArtGallery", [/\bart gallery\b/]),
  rule("movie-theater", "MovieTheater", [/\bmovie theater\b/, /\bcinema\b/]),
  rule("performing-arts-theater", "PerformingArtsTheater", [
    /\bperforming arts theater\b/,
    /\bperforming arts centre\b/,
    /\bperforming arts center\b/,
    /\blive theater\b/
  ]),
  rule("music-venue", "MusicVenue", [/\bmusic venue\b/, /\blive music venue\b/]),
  rule("event-venue", "EventVenue", [
    /\bevent venue\b/,
    /\bwedding venue\b/,
    /\bconference center\b/,
    /\bconvention center\b/
  ]),
  rule("stadium-arena", "StadiumOrArena", [/\bstadium\b/, /\barena\b/]),
  rule("golf-course", "GolfCourse", [/\bgolf course\b/]),
  rule("bowling-alley", "BowlingAlley", [/\bbowling alley\b/, /\bbowling center\b/]),
  rule("sports-location", "SportsActivityLocation", [
    /\bsports complex\b/,
    /\bathletic complex\b/,
    /\bathletic field\b/,
    /\bball field\b/,
    /\bbaseball field\b/,
    /\bsoftball field\b/,
    /\bsoccer field\b/,
    /\bvolleyball court\b/,
    /\btennis court\b/,
    /\bbasketball court\b/,
    /\bskate park\b/
  ]),
  rule("amusement-park", "AmusementPark", [/\bamusement park\b/, /\btheme park\b/]),
  rule("tourist-attraction", "TouristAttraction", [
    /\btourist attraction\b/,
    /\bvisitor attraction\b/,
    /\bhistoric attraction\b/
  ]),
  rule("tourist-information", "TouristInformationCenter", [
    /\bvisitor center\b/,
    /\bvisitor centre\b/,
    /\btourist information\b/
  ]),
  rule("civic-structure", "CivicStructure", [
    /\bgazebo\b/,
    /\bpavilion\b/,
    /\bboat ramp\b/,
    /\bpublic dock\b/
  ]),
  rule("generic-place", "Place", [
    /\btrail\b/,
    /\bplaza\b/,
    /\bscenic overlook\b/,
    /\blandmark\b/,
    /\bhistoric site\b/
  ]),

  // Lodging.
  rule("bed-breakfast", "BedAndBreakfast", [/\bbed and breakfast\b/, /\bb and b\b/]),
  rule("hotel", "Hotel", [/\bhotel\b/]),
  rule("motel", "Motel", [/\bmotel\b/]),
  rule("resort", "Resort", [/\bresort\b/]),
  rule("vacation-rental", "VacationRental", [
    /\bvacation rental\b/,
    /\bcabin rental\b/,
    /\blake house rental\b/
  ]),
  rule("lodging", "LodgingBusiness", [/\blodging\b/, /\baccommodation\b/]),

  // Food and drink.
  rule("fast-food", "FastFoodRestaurant", [/\bfast food\b/]),
  rule("restaurant", "Restaurant", [
    /\brestaurant\b/,
    /\bbistro\b/,
    /\bdiner\b/,
    /\bpizzeria\b/,
    /\bsteakhouse\b/,
    /\bbarbecue\b/,
    /\bbbq\b/
  ]),
  rule("bar-pub", "BarOrPub", [/^bar$/, /\bpub\b/, /\btavern\b/, /\bcocktail bar\b/, /\bsports bar\b/]),
  rule("brewery", "Brewery", [/\bbrewery\b/, /\bbrewing company\b/, /\bbrewhouse\b/]),
  rule("distillery", "Distillery", [/\bdistillery\b/]),
  rule("winery", "Winery", [/\bwinery\b/, /\bwine bar\b/]),
  rule("cafe-coffee", "CafeOrCoffeeShop", [/\bcoffee shop\b/, /\bcafe\b/, /\bcoffeehouse\b/]),
  rule("bakery", "Bakery", [/\bbakery\b/]),
  rule("ice-cream", "IceCreamShop", [/\bice cream\b/, /\bgelato\b/]),

  // Retail.
  rule("book-store", "BookStore", [/\bbookstore\b/, /\bbook store\b/]),
  rule("toy-store", "ToyStore", [/\btoy store\b/, /\btoys\b/]),
  rule("hobby-shop", "HobbyShop", [/\bhobby shop\b/, /\bcollectibles\b/]),
  rule("sporting-goods", "SportingGoodsStore", [/\bsporting goods\b/, /\boutdoor gear\b/, /\btackle shop\b/]),
  rule("clothing-store", "ClothingStore", [/\bclothing store\b/, /\bapparel\b/, /\bboutique\b/]),
  rule("shoe-store", "ShoeStore", [/\bshoe store\b/, /\bfootwear\b/]),
  rule("grocery-store", "GroceryStore", [/\bgrocery\b/, /\bsupermarket\b/]),
  rule("convenience-store", "ConvenienceStore", [/\bconvenience store\b/]),
  rule("hardware-store", "HardwareStore", [/\bhardware store\b/]),
  rule("jewelry-store", "JewelryStore", [/\bjewelry\b/, /\bjewellery\b/]),
  rule("liquor-store", "LiquorStore", [/\bliquor store\b/, /\bpackage store\b/]),
  rule("furniture-store", "FurnitureStore", [/\bfurniture store\b/, /\bfurniture showroom\b/]),
  rule("electronics-store", "ElectronicsStore", [/\belectronics store\b/]),
  rule("pet-store", "PetStore", [/\bpet store\b/]),
  rule("florist", "Florist", [/\bflorist\b/, /\bflower shop\b/]),
  rule("bike-store", "BikeStore", [/\bbike shop\b/, /\bbicycle store\b/]),
  rule("music-store", "MusicStore", [/\bmusic store\b/, /\binstrument store\b/]),
  rule("pawn-shop", "PawnShop", [/\bpawn shop\b/]),
  rule("store", "Store", [
    /\bretail store\b/,
    /\bgift shop\b/,
    /\bantique store\b/,
    /\bvendor market\b/,
    /\bflea market\b/
  ]),

  // Health, beauty, professional, and home services.
  rule("hospital", "Hospital", [/\bhospital\b/]),
  rule("medical-clinic", "MedicalClinic", [/\bmedical clinic\b/, /\bhealth clinic\b/]),
  rule("dentist", "Dentist", [/\bdentist\b/, /\bdental clinic\b/]),
  rule("pharmacy", "Pharmacy", [/\bpharmacy\b/]),
  rule("beauty-salon", "BeautySalon", [/\bbeauty salon\b/]),
  rule("hair-salon", "HairSalon", [/\bhair salon\b/, /\bbarber shop\b/]),
  rule("nail-salon", "NailSalon", [/\bnail salon\b/]),
  rule("day-spa", "DaySpa", [/\bday spa\b/, /^spa$/]),
  rule("tattoo", "TattooParlor", [/\btattoo\b/]),
  rule("health-club", "HealthClub", [/\bhealth club\b/, /\bfitness center\b/, /\bgym\b/]),
  rule("auto-repair", "AutoRepair", [/\bauto repair\b/, /\bautomotive repair\b/, /\bmechanic\b/]),
  rule("auto-dealer", "AutoDealer", [/\bauto dealer\b/, /\bcar dealer\b/]),
  rule("gas-station", "GasStation", [/\bgas station\b/, /\bfuel station\b/]),
  rule("real-estate", "RealEstateAgent", [/\breal estate\b/, /\brealtor\b/]),
  rule("insurance", "InsuranceAgency", [/\binsurance agency\b/, /\binsurance\b/]),
  rule("travel-agency", "TravelAgency", [/\btravel agency\b/]),
  rule("legal-service", "LegalService", [/\blaw firm\b/, /\blegal service\b/, /\battorney\b/]),
  rule("accounting", "AccountingService", [/\baccounting\b/, /\bbookkeeping\b/]),
  rule("bank", "BankOrCreditUnion", [/\bbank\b/, /\bcredit union\b/]),
  rule("electrician", "Electrician", [/\belectrician\b/, /\belectrical contractor\b/]),
  rule("plumber", "Plumber", [/\bplumber\b/, /\bplumbing\b/]),
  rule("general-contractor", "GeneralContractor", [/\bgeneral contractor\b/, /\bconstruction contractor\b/]),
  rule("roofing", "RoofingContractor", [/\broofing\b/]),
  rule("moving-company", "MovingCompany", [/\bmoving company\b/, /\bmovers\b/]),

  // Organizations that are not appropriately modeled as LocalBusiness.
  rule("organization", "Organization", [
    /\bchamber of commerce\b/,
    /\beconomic development corporation\b/,
    /\bnonprofit\b/,
    /\bnon profit\b/,
    /\bfoundation\b/,
    /\bbusiness association\b/,
    /\bcivic association\b/
  ]),

  // Schema.org has no dedicated Marina type; a commercial marina remains a LocalBusiness.
  rule("marina-local-business", "LocalBusiness", [/\bmarina\b/]),
  rule("guide-charter-local-business", "LocalBusiness", [
    /\bfishing guide\b/,
    /\bguide service\b/,
    /\bcharter service\b/,
    /\bboat rental\b/
  ])
];

const FALLBACK_PLACE_HINTS = [
  /\bpark\b/,
  /\btrail\b/,
  /\bplaza\b/,
  /\bgazebo\b/,
  /\bpavilion\b/,
  /\bvenue\b/,
  /\bfield\b/,
  /\bcourt\b/,
  /\blake\b/,
  /\briver\b/,
  /\blandmark\b/
];

const FALLBACK_ORGANIZATION_HINTS = [
  /\bdepartment\b/,
  /\bagency\b/,
  /\bassociation\b/,
  /\bfoundation\b/,
  /\bchamber\b/
];

export const getBusinessSchemaTypeDecision = (business = {}) => {
  const terms = getBusinessSchemaCategoryTerms(business);

  for (const term of terms) {
    const normalized = cleanTerm(term);
    if (!normalized) continue;

    for (const candidate of TYPE_RULES) {
      if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
        return {
          schemaType: candidate.schemaType,
          matchedRule: candidate.id,
          matchedTerm: term,
          fallback: false,
          categoryTerms: terms
        };
      }
    }
  }

  const normalizedTerms = terms.map(cleanTerm);

  if (normalizedTerms.some((term) => FALLBACK_ORGANIZATION_HINTS.some((pattern) => pattern.test(term)))) {
    return {
      schemaType: "Organization",
      matchedRule: "organization-fallback",
      matchedTerm: null,
      fallback: true,
      categoryTerms: terms
    };
  }

  if (normalizedTerms.some((term) => FALLBACK_PLACE_HINTS.some((pattern) => pattern.test(term)))) {
    return {
      schemaType: "Place",
      matchedRule: "place-fallback",
      matchedTerm: null,
      fallback: true,
      categoryTerms: terms
    };
  }

  return {
    schemaType: "LocalBusiness",
    matchedRule: "local-business-fallback",
    matchedTerm: null,
    fallback: true,
    categoryTerms: terms
  };
};

export const getBusinessSchemaType = (business = {}) => getBusinessSchemaTypeDecision(business).schemaType;

export { TYPE_RULES };
