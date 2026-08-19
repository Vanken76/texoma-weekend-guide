# TWG JSON-LD Automatic QA

Step 10 adds a repository-level QA gate for the structured-data system.

## Commands

Run the QA directly with:

```sh
npm run check:jsonld
```

The normal production build also runs the QA automatically after the existing event-data patch steps and before Astro builds the site:

```text
patch-event-data -> fix-events-page -> check-jsonld -> astro build
```

A blocking QA error therefore stops the build rather than quietly shipping broken JSON-LD.

## GitHub Actions

`.github/workflows/jsonld-qa.yml` runs the same QA on:

- pushes to the JSON-LD implementation branch;
- pushes to `main` once the work is eventually merged;
- pull requests targeting `main`;
- manual workflow dispatch.

## Blocking errors

The QA exits non-zero for structural problems that should not be deployed, including:

- duplicate canonical slugs;
- publish-ready records missing the slug/name needed for a canonical entity page;
- JSON-LD serialization failures;
- JSON-LD that cannot round-trip through `JSON.parse`;
- generated entity nodes missing their expected `@context`, `@type`, `@id`, name, or canonical URL;
- eligible Event nodes missing `startDate` or `location.address`;
- broken site-level Organization/WebSite identity linkage;
- malformed BreadcrumbList output from the shared builder.

## Non-blocking warnings

Warnings make cleanup work visible without preventing an otherwise safe site build. They currently include:

- business category/type mapper fallbacks;
- unresolved venue, host, or partner slugs;
- invalid or unusable external/ticket URLs;
- malformed optional event end dates or end-before-start records;
- publish-ready events whose JSON-LD is suppressed because required event data is insufficient.

These warnings are deliberately visible because the generator withholding unsafe markup is better than manufacturing false structured data.

## Informational notes

Intentional Event suppression rules from Step 4 are reported as notes rather than warnings when the only suppression reason is one of:

- recurring series needs occurrence pages;
- multiple physical venues need separate event entities.

## Coverage

The QA exercises:

- business/place entity generation;
- business type decisions;
- Event entity generation and eligibility;
- Organization and WebSite nodes;
- BreadcrumbList generation;
- business and Event relationship nodes when applicable;
- canonical URL and stable-ID generation;
- JSON serialization/parsing safety.

It prints counts for published records, emitted nodes, suppressed Event nodes, mapper fallbacks, relationship nodes, errors, warnings, and notes.

## Step boundary

This is an internal automated QA gate. Step 11 remains the external validation pass against Google/Schema.org tooling and current search-engine requirements.