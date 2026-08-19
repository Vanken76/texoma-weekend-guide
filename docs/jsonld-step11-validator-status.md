# Step 11 validator status

A draft PR is used to trigger repository checks without merging to production.

The Google-specific eligibility pass is now part of `npm run check:jsonld` and the production build command. It checks generated Event nodes for Google's required name, startDate, Place location, location.name, and PostalAddress structure. It separately warns when a LocalBusiness subtype lacks a physical PostalAddress, because that markup can remain valid Schema.org entity data while being ineligible for Google's Local Business rich-result feature.
