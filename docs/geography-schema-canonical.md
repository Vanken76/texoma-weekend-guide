# TWG Canonical Geography Entity Schema

This document defines the shared schema for geographic entities in Texoma Weekend Guide.

## Purpose

The geography layer represents places and geographic groupings. It is separate from businesses, venues, events, and government organizations.

Examples:

- `Texas` is a geographic state.
- `State of Texas` is a separate government organization.
- `Sherman` is a geographic city.
- `City of Sherman` is a separate municipal organization.
- `Texoma` is a cross-state region overlay, not a state or county.

## Directory shape

```json
{
  "schema_version": "1.0.0",
  "last_updated": "YYYY-MM-DD",
  "entities": []
}
```

Each record in `entities` uses the shared fields below, plus fields appropriate to its `entity_type`.

## Allowed entity types

Initial supported values:

- `country`
- `state`
- `county`
- `city`
- `region`
- `district`
- `geographic_feature`

Future types may be added only through schema governance.

## Required fields for every geography entity

| Field | Type | Rule |
|---|---|---|
| `entity_type` | string | Required. Must be one allowed geography type. |
| `name` | string | Required canonical geographic name. Do not prepend government labels unless they are part of the place's actual name. |
| `slug` | string | Required. Lowercase letters, numbers, and single hyphens only. Globally unique within the geography directory. |
| `status` | string | Required. Initial allowed values: `active`, `inactive`, `planned`, `archived`. |
| `publish_ready` | boolean | Required. Must be `true` before public publishing. |
| `country_slug` | string or null | Required for all entities except a top-level country. |
| `description` | string | Required editorial introduction suitable for the public page. |
| `last_verified` | string | Required ISO date, `YYYY-MM-DD`. |
| `sources` | array | Required. One or more source objects supporting researched facts. |

## Canonical relationship fields

Relationships are stored once and reverse views are derived.

| Field | Type | Use |
|---|---|---|
| `parent_slug` | string or null | Immediate geographic parent where one exists. Example: a county's parent state. |
| `state_slug` | string or null | Canonical state relationship for counties, cities, districts, and features. |
| `county_slug` | string or null | Canonical county relationship for cities, districts, and features when applicable. |
| `city_slug` | string or null | Canonical city relationship for districts and local features when applicable. |
| `region_slugs` | array of strings | Zero or more overlapping named regions such as `texoma` or `lake-texoma`. |
| `related_geography_slugs` | array of strings | Optional explicit non-hierarchical relationships when they cannot be derived. |

Do not store manually maintained child arrays such as every city in a state or every business in a city. Child lists and counts must be derived from canonical relationships.

## Coverage fields

| Field | Type | Rule |
|---|---|---|
| `coverage_level` | string | Allowed: `core`, `regional`, `destination`, `reference`, `outside`. |
| `within_twg_service_area` | boolean | Whether the place is eligible under the normal TWG coverage policy. |
| `coverage_notes` | string or null | Explains special boundary or editorial treatment. |

Coverage is editorial policy and must remain separate from political geography.

## Location and map fields

| Field | Type | Rule |
|---|---|---|
| `latitude` | number or null | Geographic center, representative point, or verified feature coordinate. |
| `longitude` | number or null | Must be supplied with latitude. |
| `coordinate_source` | string or null | Allowed: `manual`, `official`, `geocoded`, `imported`. |
| `coordinate_status` | string | Allowed: `missing`, `unverified`, `verified`, `rejected`. |
| `coordinate_verified_at` | string or null | ISO date. Required when status is `verified`. |
| `coordinate_verified_by` | string or null | Required when status is `verified`. |
| `coordinate_note` | string or null | Optional placement or correction note. |
| `boundary_source_url` | string or null | Official GIS or boundary source when available. |
| `boundary_reference` | string or null | Future polygon or GIS identifier. |

Latitude and longitude must be numeric, supplied together, and within valid ranges. Public maps may use only valid coordinate pairs with `coordinate_status: "verified"`.

## Identity and government-reference fields

These describe the place. They do not turn the place into the government organization.

| Field | Type | Use |
|---|---|---|
| `abbreviation` | string or null | Example: `TX`. |
| `official_name` | string or null | Official geographic name when it differs from `name`. Do not use this to store a separate government's identity. |
| `capital_city_slug` | string or null | State or country capital relationship. |
| `largest_city_slug` | string or null | State or country largest-city relationship. |
| `government_organization_slug` | string or null | Link to the separate government organization record. |
| `official_website_url` | string or null | Official geographic/government reference URL. The organization remains separate. |

## Facts and statistics

Time-sensitive values must include their year and source.

```json
"population": {
  "value": 0,
  "year": 2025,
  "type": "estimate",
  "source_url": "https://..."
}
```

Recommended shared facts:

- `population`
- `area_total_sq_mi`
- `area_land_sq_mi`
- `area_water_sq_mi`
- `founded_date`
- `incorporated_date`
- `admission_date`
- `admission_order`
- `time_zones`
- `postal_codes`
- `fips_code`
- `highest_point`
- `lowest_point`

Only fields relevant to the entity type should be populated.

## State-specific fields

Recommended for `entity_type: "state"`:

- `abbreviation`
- `capital_city_slug`
- `largest_city_slug`
- `admission_date`
- `admission_order`
- `former_status`
- `nickname`
- `motto`
- `state_symbols`
- `county_count`
- `time_zones`

Example state symbols shape:

```json
"state_symbols": {
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

## City-specific fields

Recommended for `entity_type: "city"`:

- `state_slug`
- `county_slug`
- `region_slugs`
- `population`
- `founded_date`
- `incorporated_date`
- `postal_codes`
- `fips_code`
- `coverage_level`
- `nearby_city_slugs`
- `district_slugs` only when a district cannot be derived by its own `city_slug`

Do not store arrays of every event, business, restaurant, venue, or attraction. Those are derived from their canonical `city_slug` relationships.

## Region-specific fields

Regions may overlap states, counties, cities, and other regions.

Recommended for `entity_type: "region"`:

- `region_type`
- `state_slugs`
- `county_slugs` only when explicitly governed and not safely derivable
- `coverage_level`
- `editorial_boundary_description`
- `boundary_source_url`
- `boundary_reference`

Examples include `texoma`, `lake-texoma`, and future tourism or natural regions.

## Media assets

Geographic entities use role-based asset objects rather than unstructured image URLs.

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

Official seals and emblems must not be assumed freely usable. Their usage status must be reviewed separately from flags and general editorial photography.

## Public-page content fields

| Field | Type | Use |
|---|---|---|
| `short_description` | string or null | Compact card/search summary. |
| `description` | string | Full editorial introduction. |
| `history_summary` | string or null | Brief, sourced history. |
| `visitor_summary` | string or null | Practical relevance for travelers and residents. |
| `featured` | boolean | Editorial feature control. |
| `display_order` | number or null | Optional curated ordering. |
| `seo_title` | string or null | Optional override. |
| `seo_description` | string or null | Optional override. |

Public pages should derive related events, businesses, venues, restaurants, parks, attractions, lodging, and category totals from canonical relationships.

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

Allowed initial `source_type` values:

- `official`
- `census`
- `government-archive`
- `gis`
- `tourism`
- `reference`
- `editorial`

## Validation rules

1. `entity_type`, `name`, `slug`, `status`, `publish_ready`, `description`, `last_verified`, and `sources` are required.
2. Slugs must be lowercase and hyphenated.
3. Parent and relationship slugs must resolve to published or recognized geography records before public publishing.
4. A city must have `state_slug`; a county must have `state_slug`; a state must have `country_slug`.
5. `region_slugs` may cross state and county boundaries.
6. `coverage_level` must not alter political relationships.
7. Latitude and longitude must be supplied together and pass numeric range validation.
8. `coordinate_status: "verified"` requires a valid pair, verification date, and verifier.
9. Population and other changing statistics require year, type, and source.
10. Official media require source and usage-status metadata.
11. Government organizations must remain separate linked entities.
12. Derived child lists must not be manually duplicated in geography records.

## Initial Texas object

Texas will be the first state record created against this schema. Oklahoma will follow when needed. Sherman will be the first city record after its parent county relationship is available or deliberately marked as planned.
