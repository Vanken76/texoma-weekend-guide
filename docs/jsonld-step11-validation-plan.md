# Step 11 — External JSON-LD Validation Plan

This step validates representative generated output against current Google Search Central requirements and Schema.org vocabulary before production deployment.

Representative classes:

- homepage: Organization + WebSite
- standard one-time event with canonical venue
- free event
- canceled/postponed event
- business: Restaurant / LocalBusiness subtype
- non-business place: Park
- institution: CollegeOrUniversity / Organization-capable entity
- business/place page with containment and event relationships
- event and business BreadcrumbList output

Validation gates:

1. Repository QA must pass with zero blocking errors.
2. Full Astro production build must succeed.
3. Generated HTML must contain parseable application/ld+json blocks.
4. Event output must satisfy Google's required Event properties: name, startDate, and a Place location with name/address.
5. LocalBusiness output intended for Google Local Business rich results must contain name and physical PostalAddress. Records lacking a physical address may remain valid Schema.org entities but are not treated as Google LocalBusiness-rich-result eligible.
6. BreadcrumbList output must contain at least two ordered ListItem objects with name and position; item is supplied for both TWG breadcrumb levels.
7. Site Organization/WebSite nodes must share stable identity references and represent visible site facts only.
8. Schema.org-specific relationship properties must remain on compatible domain/range types and must not invent ownership, sponsorship, reviews, ratings, or identity equivalence.

A draft pull request is used as a non-production validation surface so GitHub Actions can exercise the branch before merge. Production `main` remains unchanged until later roadmap steps.
