# TWG Location and Coordinate Standard

Status: Approved foundation for the future filtered map.

## Purpose

Coordinates support map views, proximity search and geographic discovery. They are not a separate data system. They belong to canonical location-bearing records and are reused by events and every future presentation view.

## Ownership

1. A canonical venue/business record owns its normal physical coordinates.
2. An event normally inherits coordinates from its primary venue through `venue_slugs`.
3. An event may store its own coordinates only when its physical location differs from the canonical venue point, such as a trailhead, parking area, temporary field, parade route start or off-site event.
4. Event coordinates are an explicit override, not duplicated venue data.
5. Coordinates must never be inferred from `host_business_slug`; organizers are not automatically venues.

## Canonical fields

Location-bearing records may use:

- `latitude`: decimal number from -90 through 90
- `longitude`: decimal number from -180 through 180
- `coordinate_source`: `manual`, `official`, `geocoded` or `imported`
- `coordinate_status`: `missing`, `unverified`, `verified` or `rejected`
- `coordinate_verified_at`: ISO date or datetime
- `coordinate_verified_by`: person or process identifier
- `coordinate_note`: optional QA note

Latitude and longitude must always be supplied as a pair.

## Publication rule

A record is map-ready only when:

- both coordinates are present and numeric;
- latitude and longitude are within valid ranges; and
- `coordinate_status` is `verified`.

Valid but unverified coordinates may be stored for QA, but must not be used in the public filtered map.

## Source and verification workflow

1. Normalize the canonical street address.
2. Obtain a candidate coordinate pair from an official source, a geocoder or careful manual placement.
3. Save the source and mark the pair `unverified`.
4. Compare the point with the written address and visible site boundaries.
5. Correct entrance, building or venue placement when needed.
6. Mark the pair `verified` and record when and by whom it was checked.
7. Mark a known bad pair `rejected`; do not silently reuse it.

## Event resolution order

For public map use:

1. verified event override coordinates;
2. verified primary venue coordinates;
3. no public marker.

For internal QA only, valid unverified event or venue coordinates may be surfaced with an explicit warning.

## Multi-venue events

The first canonical value in `venue_slugs` remains the primary location for the initial map implementation. A future multi-point event model may add explicit location instances, but map code must not invent multiple markers from ambiguous text.

## Geographic QA

The audit must flag:

- one coordinate without the other;
- nonnumeric values;
- latitude outside -90 to 90;
- longitude outside -180 to 180;
- verified status without a valid pair;
- valid coordinates without a source;
- duplicate venue records with materially different coordinates;
- event overrides that appear identical to the venue and therefore may be unnecessary duplication.

## Map gate

The filtered map must not be built or enabled until:

- canonical venue coordinates can be stored and edited;
- validation runs before publication;
- a coordinate QA report exists;
- only verified pairs are exposed to the map view; and
- incorrect markers can be manually corrected without changing unrelated event facts.
