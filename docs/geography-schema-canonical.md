# TWG Canonical Geography Entity Schema

This document defines the shared schema for geographic entities in Texoma Weekend Guide.

## Purpose

The geography layer represents places and geographic groupings. It is separate from businesses, venues, events, and government organizations.

Examples:

- `Texas` is a geographic state.
- `State of Texas` is a separate government organization.
- `Sherman` is a geographic city.
- `City of Sherman` is a separate municipal organization.
- `Texoma` is a cross-state regional overlay, not a state or county.

## Directory shape

```json
{
  "schema_version": "1.0.1",
  "last_updated": "YYYY-MM-DD",
  "entities": []
}
```

Each record in `entities` uses the shared fields below, plus fields appropriate to its `entity_type`.

## Allowed entity types

- `country`
- `state`
- `county`
- `city`
- `region`
- `district`
- `geographic_feature`

Future types may be added only through schema governance.

## Required fields

| Field | Type | Rule |
|---|---|---|
| `entity_type` | string | Required. Must be an allowed geography type. |
| `name` | string | Required canonical geographic name. Do not prepend government labels unless part of the place's actual name. |
| `slug` | string | Required. Lowercase letters, numbers, and single hyphens only. Globally unique in the geography directory. |
| `status` | string | Required: `active`, `inactive`, `planned`, or `archived`. |
| `publish_ready` | boolean | Required. Must be `true` before public publishing. |
| `description` | string | Required public-page introduction. |
| `last_verified` | string | Required ISO date, `YYYY-MM-DD`. |
| `sources` | array | Required. One or more source objects supporting researched facts. |

## Canonical relationships

Relationships are stored once and reverse views are derived.

| Field | Type | Use |
|---|---|---|
| `country_slug` | string or null | Required for all entities except a top-level country. |
| `parent_slug` | string or null | Immediate geographic parent when one exists. |
| `state_slug` | string or null | State relationship for counties, cities, districts, and features. |
| `county_slug` | string or null | County relationship for cities, districts, and features when applicable. |
| `city_slug` | string or null | City relationship for districts and local features when applicable. |
| `region_slugs` | array of strings | Overlapping named regions such as `texoma` or `lake-texoma`. |
| `related_geography_slugs` | array of strings | Optional explicit non-hierarchical relationships that cannot be derived. |

Do not store manually maintained arrays of every child city, business, venue, attraction, or event. Child lists and counts are derived from canonical relationships.

## Coverage fields

| Field | Type | Rule |
|---|---|---|
| `coverage_level` | string | `core`, `regional`, `destination`, `reference`, or `outside`. |
| `within_twg_service_area` | boolean | Whether the place is eligible under normal TWG coverage policy. |
| `coverage_notes` | string or null | Boundary or editorial-treatment notes. |

Coverage is editorial policy and remains separate from political geography.

## Location and map fields

| Field | Type | Rule |
|---|---|---|
| `latitude` | number or null | Representative point or verified feature coordinate. |
| `longitude` | number or null | Must be supplied with latitude. |
| `coordinate_source` | string or null | `manual`, `official`, `geocoded`, or `imported`. |
| `coordinate_status` | string | `missing`, `unverified`, `verified`, or `rejected`. |
| `coordinate_verified_at` | string or null | ISO date; required when verified. |
| `coordinate_verified_by` | string or null | Required when verified. |
| `coordinate_note` | string or null | Placement or correction note. |
| `boundary_source_url` | string or null | Official GIS or boundary source. |
| `boundary_reference` | string or null | Polygon, GIS, or boundary identifier. |

Public maps may use only valid coordinate pairs with `coordinate_status: "verified"`.

## Identity and government references

| Field | Type | Use |
|---|---|---|
| `abbreviation` | string or null | Postal or common abbreviation. |
| `official_name` | string or null | Official geographic name when different from `name`. |
| `capital_city_slug` | string or null | State or country capital relationship. |
| `largest_city_slug` | string or null | State or country largest-city relationship. |
| `government_organization_slug` | string or null | Link to the separate government organization record. |
| `official_website_url` | string or null | Official reference URL. |

A place and its government remain separate entities.

## Facts and statistics

Time-sensitive values must include year, type, and source.

```json
"population": {
  "value": 0,
  "year": 2025,
  "type": "estimate",
  "source_url": "https://..."
}
```

Recommended shared facts include:

- `population`
- `area_total_sq_mi`
- `area_land_sq_mi`
- `area_water_sq_mi`
- `founded_date`
- `incorporated_date`
- `admission_date`
- `admission_order`
- `former_status`
- `nickname`
- `motto`
- `time_zones`
- `postal_codes`
- `fips_code`
- `highest_point`
- `lowest_point`
- `county_count`

Only fields relevant to the entity type should be populated.

## Official symbols

`official_symbols` is the canonical generic field for recognized symbols of any geographic entity. It replaces the earlier state-only `state_symbols` concept.

```json
"official_symbols": {
  "flag_name": "",
  "seal_name": "",
  "flower": "",
  "bird": "",
  "tree": "",
  "song": "",
  "large_mammal": "",
  "small_mammal": "",
  "flying_mammal": "",
  "insect": "",
  "sport": "",
  "musical_instrument": "",
  "music": ""
}
```

Rules:

1. Populate only symbols that are officially recognized or reliably sourced for that entity.
2. Keys are extensible but should use stable lowercase snake_case names.
3. Empty symbols are omitted rather than stored as blank strings.
4. `official_symbols` stores factual names and labels, not media files.
5. Flag, seal, emblem, flower, bird, and similar images belong in role-based `media` assets with source and usage metadata.
6. The field may be used by countries, states, counties, cities, regions, districts, or geographic features when applicable.
7. Existing draft objects using `state_symbols` must be normalized to `official_symbols` before publishing.

## Type-specific guidance

### State

Recommended fields include `abbreviation`, `capital_city_slug`, `largest_city_slug`, `admission_date`, `admission_order`, `former_status`, `nickname`, `motto`, `official_symbols`, `county_count`, and `time_zones`.

### City

Recommended fields include `state_slug`, `county_slug`, `region_slugs`, `population`, `founded_date`, `incorporated_date`, `postal_codes`, `fips_code`, `coverage_level`, `nearby_city_slugs`, and `official_symbols` when officially recognized.

Do not store arrays of every event, business, restaurant, venue, or attraction. Those are derived from canonical `city_slug` relationships.

### Region

Regions may overlap states, counties, cities, and other regions. Recommended fields include `region_type`, `state_slugs`, `coverage_level`, `editorial_boundary_description`, `boundary_source_url`, `boundary_reference`, and `official_symbols` only when the region has reliably sourced recognized symbols.

## Media assets

Geographic entities use role-based asset objects:

```json
"media": {
  "flag": null,
  "seal": null,
  "outline": null,
  "hero": null,
  "thumbnail": null,
  "social": null,
  "gallery": []
}
```

Every populated asset uses:

```json
{
  "url": "/images/geography/example.ext",
  "alt_text": "",
  "source_name": "",
  "source_url": "",
  "credit": "",
  "usage_status": "",
  "usage_notes": "",
  "last_verified": "YYYY-MM-DD"
}
```

Initial `usage_status` values:

- `owned`
- `licensed`
- `public-domain`
- `official-government-source`
- `permission-granted`
- `review-required`
- `restricted`

Official seals and emblems must not be assumed freely usable. Their usage status is reviewed separately from flags and editorial photography.

## Public-page content

| Field | Type | Use |
|---|---|---|
| `short_description` | string or null | Compact card or search summary. |
| `description` | string | Full editorial introduction. |
| `history_summary` | string or null | Brief sourced history. |
| `visitor_summary` | string or null | Practical relevance for travelers and residents. |
| `featured` | boolean | Editorial feature control. |
| `display_order` | number or null | Optional curated ordering. |
| `seo_title` | string or null | Optional page-title override. |
| `seo_description` | string or null | Optional search-description override. |

Public pages derive related events, businesses, venues, restaurants, parks, attractions, lodging, and category totals from canonical relationships.

## Source objects

```json
{
  "source_type": "official",
  "source_name": "",
  "source_url": "https://...",
  "supports": ["population", "statehood"],
  "last_checked": "YYYY-MM-DD",
  "notes": ""
}
```

Initial `source_type` values:

- `official`
- `census`
- `government-archive`
- `gis`
- `tourism`
- `reference`
- `editorial`

## Validation rules

1. Required identity, publishing, description, verification, and source fields must be present.
2. Slugs must be lowercase and hyphenated.
3. Parent and relationship slugs must resolve before public publishing.
4. A city requires `state_slug`; a county requires `state_slug`; a state requires `country_slug`.
5. `region_slugs` may cross state and county boundaries.
6. Coverage fields do not alter political relationships.
7. Latitude and longitude must be supplied together and pass range validation.
8. Verified coordinates require a valid pair, verification date, and verifier.
9. Changing statistics require year, type, and source.
10. Official media require source and usage metadata.
11. Government organizations remain separate linked entities.
12. Derived child lists must not be duplicated in geography records.
13. `state_symbols` is deprecated and must be normalized to `official_symbols`.

## Initial implementation

Texas is the first state record created against this schema. Oklahoma follows when needed. Sherman is the first city record after its parent county relationship is available or deliberately marked as planned.
