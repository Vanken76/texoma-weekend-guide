# Step 11 — Current Google requirements snapshot

Checked 2026-08-19 against current Google Search Central documentation.

## Event

Google requires `name`, `startDate`, and `location`. For an in-person event, `location` must be a `Place` with `name` and a detailed `PostalAddress`. TWG's event generator is designed to suppress Event rich-result markup when a usable location is not available rather than emit incomplete markup.

## LocalBusiness

Google requires `name` and physical `address` (`PostalAddress`) for LocalBusiness rich-result eligibility. TWG may still emit valid Schema.org entity markup for a directory record that lacks a physical address, but Step 11 treats such a record as not Google LocalBusiness-rich-result eligible. This distinction will be incorporated into QA rather than forcing inaccurate addresses into records.

## BreadcrumbList

Google requires `itemListElement` with at least two `ListItem` objects. Each ListItem needs `name` and `position`; `item` is required except that Google permits it to be omitted on the final breadcrumb. TWG supplies canonical URLs for both breadcrumb levels.

## Organization / WebSite

Organization has no required Google properties; TWG uses applicable recommended identity properties. The homepage WebSite node identifies the site and links its publisher to the stable TWG Organization `@id`.

## General structured-data policy

Structured data must accurately represent visible page content. TWG deliberately avoids invented ratings, reviews, sponsors, ownership claims, prices, addresses, or identity-equivalence links.
