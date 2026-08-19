# Step 11 — Validator-driven fixes

During comparison with current Google Event requirements, the event generator's eligibility rules were reviewed against Google's required `location.name` and physical-location/address requirements.

The Step 11 validation pass treats missing `location.name` as a schema-suppression condition rather than emitting an incomplete Google Event object. The existing conservative location-address rule remains: a street address qualifies directly, while city + state can qualify for events without a well-defined street location as described in Google's Event address guidance.

The QA pass also distinguishes valid Schema.org LocalBusiness output from Google Local Business rich-result eligibility. Google requires `name` and physical `address` for its Local Business rich-result feature. A TWG directory entity can still be valid Schema.org markup without an address, but QA flags that it is not eligible for Google's Local Business enhancement rather than inventing an address.
