# Texoma Weekend Guide — Canonical Event Schema

Status: Approved August 3, 2026

## Canonical venue relationship

`venue_slugs` is the canonical event-to-venue field.

- Type: array of one or more canonical business/venue slugs.
- Target: `public/data/local-business-directory.json` → `businesses[].slug`.
- A one-venue event still uses a one-item array.
- `venue_name` remains a display fallback only.
- `venue_slug` and `secondary_venue_slugs` are legacy import/read aliases. New records and import-ready objects must not use them.
- The event publisher normalizes legacy aliases into `venue_slugs` and removes the aliases before saving.

## Canonical relationship fields

- `venue_slugs`: where the event occurs.
- `host_business_slug`: canonical linked organizer/host when the organizer has a TWG business record.
- `organizer_name`: plain-text fallback when no canonical organizer record exists.
- `partner_business_slugs`: canonical linked partner businesses or organizations.
- `partner_names`: unlinked plain-text partners only. Do not repeat an entity already represented in `partner_business_slugs`.

## Minimum import-ready event shape

```json
{
  "event_slug": "",
  "event_name": "",
  "description": "",
  "start_datetime": "",
  "end_datetime": null,
  "timezone": "America/Chicago",
  "status": "draft",
  "venue_slugs": [],
  "venue_name": "",
  "address": null,
  "city": "",
  "state": "",
  "postal_code": null,
  "latitude": null,
  "longitude": null,
  "categories": [],
  "tags": [],
  "cost_type": "unknown",
  "cost_details": null,
  "audience": [],
  "age_restriction": null,
  "host_business_slug": null,
  "organizer_name": null,
  "partner_business_slugs": [],
  "partner_names": [],
  "image_url": null,
  "image_alt": null,
  "official_url": null,
  "facebook_url": null,
  "ticket_url": null,
  "recurring": false,
  "recurrence_rule": null,
  "recurrence_start_date": null,
  "recurrence_end_date": null,
  "featured": false,
  "publish_ready": false,
  "source_verified": false,
  "verification_note": null,
  "last_checked": "",
  "created_on": "",
  "updated_on": ""
}
```

## Allowed values

Statuses: `draft`, `upcoming`, `recurring`, `postponed`, `canceled`, `ended`.

Cost types: `free`, `paid`, `donation`, `varies`, `unknown`.

## Lifecycle and archive rule

Only publish-ready current events appear in active listings. Permanent event pages may remain available after an event ends. Active, archive and recommendation views must use one shared lifecycle utility so venue pages and related-event sections do not present ended, canceled or expired records as upcoming.

## Documentation precedence

This document and the TWG Relationship Blueprint are authoritative when older embedded directory metadata or legacy records still show `venue_slug`. The embedded header/template in `local-event-directory.json` is scheduled for migration to this shape without rewriting historical event records unnecessarily.
