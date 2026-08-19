# TWG Automatic Business / Place JSON-LD

Step 7 wires the Step 6 type mapper into every published `/businesses/[slug]/` detail page.

## Output pipeline

`local-business-directory.json` -> `businessSchemaType.js` -> `businessJsonLd.js` -> `/businesses/[slug].astro` -> `<script type="application/ld+json">`

No business or place record needs to be manually converted to JSON-LD.

## Core properties

Every publish-ready record with a name and slug can emit:

- Schema.org `@type` from the centralized type mapper
- stable page-specific `@id`
- entity name
- canonical TWG listing URL
- description when present
- image/logo URLs when present
- official website and social identity URLs through `sameAs`
- phone when present
- physical address when usable
- coordinates when both latitude and longitude are valid

Organization-capable types can also emit verified email addresses. Local-business types can emit `priceRange` when TWG stores it.

## Address handling

Structured fields (`address` / `street_address`, city, state, postal code, country) take precedence.

Older records that only contain `service_area_or_location` are not blindly copied into `PostalAddress`. A legacy address is parsed only when it cleanly matches a Texas/Oklahoma postal-address shape ending in city, state, and ZIP. Descriptive strings such as service areas or `Texoma area — verify` are not treated as street addresses.

## Hours handling

Human-readable TWG hours are converted only when a daily value has a simple, unambiguous form such as `10:00 AM–6:00 PM` or `Open 24 hours`.

- closed days are omitted rather than guessed;
- malformed or compound hours are omitted;
- explicitly seasonal/summer/winter schedules are withheld unless TWG later stores the date validity needed to describe them accurately;
- overnight closing times are preserved (for example 11:00 AM to 12:00 AM).

## Type-safe properties

Pure `Organization` and `GovernmentOrganization` records do not receive place-only coordinates or opening-hours properties. Email is emitted only for types that inherit from or function as Schema.org organizations.

## Relationship boundary

Step 7 establishes the automatic entity node on every business/place page. Parent/child, venue, containment, organizer, and geographic relationship semantics are intentionally handled in Step 8 so those links can use the correct Schema.org relationship property rather than a generic or misleading one.
