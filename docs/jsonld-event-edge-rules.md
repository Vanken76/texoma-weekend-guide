# Texoma Weekend Guide — Event JSON-LD Edge Rules

Status: Step 4 complete
Date: 2026-08-19

These rules keep TWG's automatic Event JSON-LD conservative and aligned with Google's current Event structured-data guidance. The goal is to emit accurate markup automatically and suppress markup when a TWG page represents something Google expects to be modeled differently.

## Recurring event series

TWG recurring records represent a series on one permanent page. Google recommends a unique leaf URL for each event/performance. Therefore recurring-series records do not emit Google Event JSON-LD yet.

Eligibility reason:

`recurring_series_requires_occurrence_pages`

A later occurrence-page system can make recurring events eligible without rewriting the underlying recurring record.

## Multiple physical venues

Google recommends separate events when the same event happens at multiple locations at the same time. A TWG record with more than one canonical venue slug is therefore suppressed from Event JSON-LD rather than arbitrarily choosing the first venue.

Eligibility reason:

`multiple_physical_venues_require_separate_events`

## Location sufficiency

Event JSON-LD is emitted only when TWG has either:

- a street address; or
- both locality/city and state/region.

A state alone, postal code alone, venue name alone, or coordinates alone is not enough for the automatic Google Event object.

Eligibility reason:

`insufficient_location`

The generator continues to use TWG's canonical venue resolver first, so events inherit verified address data from linked venue/business records without manual duplication.

## Start and end dates

A valid start date/time is required. Invalid start values suppress Event JSON-LD.

Eligibility reason:

`invalid_start_date`

An invalid end date, or an end date earlier than the start date, is omitted instead of being published as incorrect structured data.

## Event status

TWG status mapping:

- `canceled` → `https://schema.org/EventCancelled`
- `postponed` → `https://schema.org/EventPostponed`
- other eligible one-time event statuses → `https://schema.org/EventScheduled`

Canceled and postponed records retain their identifying start date and location data.

TWG does not currently have canonical `rescheduled` plus `previousStartDate` fields, so the generator does not invent `EventRescheduled` markup.

## Free admission and ticket offers

TWG does not parse human-readable `cost_details` into a numeric price.

Rules:

- `cost_type: free` emits an `Offer` with `price: 0` and `priceCurrency: USD`.
- A valid `ticket_url` may emit `offers.url`.
- A paid event with only human-readable `cost_details` does not get an invented numeric price.
- Explicit future numeric fields such as `price`, `minimum_price`, or `lowest_price` can be used without parsing prose.
- No ticket availability value is invented.

## Organizer safety

A linked TWG `host_business_slug` can be represented as an Organization when the page supplies that resolved host to the generator. Plain-text `organizer_name` is not automatically guessed to be a Person or Organization; an explicit `organizer_type` is required for that fallback.

## Coordinates

Latitude and longitude are emitted only when both parse as finite numbers and fall within valid geographic ranges.

## Suppression is intentional

When an event is not currently eligible for safe Google Event markup, TWG still renders the normal human-readable event page. Only the JSON-LD Event block is withheld. This prevents schema cleanup from becoming a manual directory-rewrite project.

## Current Google basis

Google Event guidance states that:

- each event should have a unique leaf URL;
- different performances with individual tickets should be separate Event items;
- simultaneous multiple physical locations should be separate events;
- physical events require accurate location/address data;
- free events use offer price `0`;
- `offers.url` should point to a page where the public can obtain admission;
- canceled and postponed events should retain identifying event fields and update `eventStatus` rather than deleting the event data.

Official reference: https://developers.google.com/search/docs/appearance/structured-data/event
