# TWG JSON-LD Business / Place Type Mapper

Step 6 creates a centralized Schema.org type decision layer for records in `public/data/local-business-directory.json`.

## Purpose

The directory contains more than ordinary commercial businesses. It also contains restaurants, marinas, parks, universities, libraries, government/civic places, event venues, recreation facilities, geographic entities, lodging, stores, service businesses, and organizations. The JSON-LD layer therefore must not label every record as `LocalBusiness`.

`src/utils/businessSchemaType.js` translates TWG's existing category fields into a conservative Schema.org `@type` without changing any directory record.

## Input precedence

The mapper reads category terms in this order:

1. `primary_category`
2. `primaryCategory`
3. legacy `category`
4. `categories`

This means a record whose primary category is `Restaurant` can remain a `Restaurant` even when secondary categories include `Bar`, `Live Music Venue`, or `Event Venue`.

## Representative mappings

- Restaurant -> `Restaurant`
- Bar / Pub / Tavern -> `BarOrPub`
- Brewery -> `Brewery`
- Coffee Shop / Cafe -> `CafeOrCoffeeShop`
- Ice Cream -> `IceCreamShop`
- Bookstore -> `BookStore`
- Hobby Shop / Collectibles -> `HobbyShop`
- Hotel -> `Hotel`
- Resort -> `Resort`
- Campground -> `Campground`
- RV Park -> `RVPark`
- Park / State Park -> `Park`
- University / College -> `CollegeOrUniversity`
- Library -> `Library`
- Museum -> `Museum`
- Live Music Venue -> `MusicVenue`
- Event Venue -> `EventVenue`
- Arena / Stadium -> `StadiumOrArena`
- Sports complex / athletic fields / courts -> `SportsActivityLocation`
- Chamber of Commerce / nonprofit association -> `Organization`
- Lake / reservoir / river -> `BodyOfWater`
- Marina -> `LocalBusiness`

Schema.org currently has no dedicated `Marina` type. TWG deliberately does not substitute `BoatTerminal`, because a working marina is not necessarily a passenger/commercial boat terminal.

## Safe fallbacks

If no specific rule matches:

- organizational category signals fall back to `Organization`;
- place/venue/geography signals fall back to `Place`;
- otherwise the record falls back to `LocalBusiness`.

The fallback decision is reported by the mapper so later QA can identify categories that deserve a more specific explicit rule.

## Decision metadata

`getBusinessSchemaTypeDecision()` returns:

- `schemaType`
- `matchedRule`
- `matchedTerm`
- `fallback`
- `categoryTerms`

`getBusinessSchemaType()` is the simple helper that returns only the final Schema.org type.

## Step boundary

Step 6 only builds the type mapper. It does **not** yet emit business/place JSON-LD on public pages. Wiring the mapper into the business template belongs to Step 7.
