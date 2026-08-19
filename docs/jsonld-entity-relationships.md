# TWG JSON-LD Entity Relationships

Step 8 adds conservative graph relationships between the canonical entities already emitted by the event and business/place JSON-LD layers.

## Why this is separate from the core entity objects

The underlying TWG directory contains several kinds of relationships: physical containment, organizational hierarchy, venue/event association, host/organizer relationships, general related-business links, and geographic relationships. These are not interchangeable in Schema.org.

The relationship layer therefore emits only relationships whose semantics are supported by the existing TWG fields. It does not turn every `related_businesses` entry into an arbitrary Schema.org link.

## Canonical identifiers

The relationship layer reuses the same stable IDs created earlier:

- business/place entity: `/businesses/<slug>/#entity`
- event entity: `/events/<slug>/#event`

Relationship nodes are emitted as an additional JSON-LD block with the same `@id`. JSON-LD processors can merge the statements into the canonical entity graph without duplicating the visible page or directory record.

## Physical containment

For records whose mapped Schema.org types can safely function as `Place`, TWG uses:

- `containedInPlace` for a canonical parent place
- `containsPlace` for canonical child places

This is used only when both sides are place-capable. A record mapped only as an `Organization` is not forced into a place-containment relationship.

`related_geography` can also contribute a `containedInPlace` relationship when it points to a canonical published geography entity or an explicitly typed state/city/county/region/body-of-water reference.

Schema.org defines `containedInPlace` and `containsPlace` as inverse physical-containment relationships between Places.

## Organizational hierarchy

TWG does not assume that `parent_business` means corporate ownership. Many existing parent/child links represent physical containment.

`parentOrganization` / `subOrganization` are therefore emitted only when:

- a relationship reference explicitly identifies itself as organizational through a relationship-type field; or
- a future record uses the dedicated `parent_organization` / `sub_organizations` fields.

Both entities must map to organization-capable Schema.org types.

## Venue/event relationships

A published business/place page can emit Schema.org `event` references for current published TWG events associated with that venue. The event references reuse the canonical event `@id` and TWG URL.

This gives the graph an explicit venue/place -> event edge while leaving the Event page responsible for Google's required physical `location` details.

## Event organizer relationships

When an event has a canonical `host_business_slug`, the event can emit an `organizer` reference only if that host's mapped type is organization-capable. The organizer points back to the canonical TWG business entity ID.

A park, body of water, or other place-only record is not automatically asserted to be an organization simply because it hosts an event.

## Deliberate non-mappings

Step 8 does not infer:

- `sponsor` from partner fields
- `parentOrganization` from ordinary physical parent links
- `sameAs` from related businesses
- `containedInPlace` for organization-only entities
- arbitrary relationship properties from prose relationship notes

Those would create stronger semantic claims than the TWG records currently support.

## Automatic behavior

The relationship layer is centralized in `src/utils/schemaRelationships.js` and is emitted from `BaseLayout.astro` only on event and business detail pages.

No directory record needs to be manually converted to JSON-LD for these relationships. Future records automatically participate when their existing relationship fields are populated with canonical slugs.