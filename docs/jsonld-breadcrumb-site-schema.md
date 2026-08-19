# TWG BreadcrumbList and WebSite JSON-LD

Step 9 adds two supporting structured-data layers without changing any directory records.

## Homepage WebSite identity

`src/utils/siteWebSiteJsonLd.js` creates a single `WebSite` node on the domain homepage with:

- `@type: WebSite`
- stable `@id` ending in `#website`
- `name: Texoma Weekend Guide`
- canonical homepage URL
- the existing TWG description
- `inLanguage: en-US`
- `publisher` pointing to the existing homepage `#organization` node

The WebSite node is emitted only on the homepage. It does not add a fake site-search action or an unverified alternate brand name.

## Detail-page breadcrumbs

`src/utils/breadcrumbJsonLd.js` builds a conservative `BreadcrumbList` from named site-navigation paths.

Current automatic trails are:

- Event detail: `Events` -> current event
- Business/place detail: `Business Directory` -> current entity

These trails mirror the visible breadcrumbs already shown on the detail templates. The builder requires at least two valid named list items and assigns ordered `position` values automatically.

## Centralized output

`BaseLayout.astro` now identifies published event/business detail pages from the canonical directories and emits the appropriate breadcrumb JSON-LD in the page head. Individual directory records do not need breadcrumb fields and individual templates do not need hand-authored breadcrumb JSON.

## Scope boundary

Step 9 intentionally does not add unsupported or speculative markup such as `SearchAction`, ratings, reviews, or alternate site names. Those should only be added later if TWG has the corresponding real visible functionality/data and the markup remains supported.
