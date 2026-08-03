(() => {
  const normalize = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const eventSlug = location.pathname.match(/^\/events\/([^/]+)\/?$/)?.[1];
  if (!eventSlug) return;

  const explicitEventVenueOverrides = {
    "country-line-dance-class-mckinney": "the-dance-collective-mckinney",
    "two-step-in-mckinney": "the-dance-collective-mckinney",
    "swing-rumba-dance-lessons-denison": "the-venue-on-main"
  };

  Promise.all([
    fetch("/data/local-event-directory.json", { cache: "no-store" }).then((response) => response.json()),
    fetch("/data/local-business-directory.json", { cache: "no-store" }).then((response) => response.json())
  ]).then(([eventData, businessData]) => {
    const event = (eventData.events || []).find((item) => item?.event_slug === eventSlug);
    if (!event) return;

    const businesses = businessData.businesses || [];
    const explicitSlugs = [
      ...(Array.isArray(event.venue_slugs) ? event.venue_slugs : []),
      ...(event.venue_slug ? [event.venue_slug] : []),
      ...(Array.isArray(event.secondary_venue_slugs) ? event.secondary_venue_slugs : [])
    ].filter(Boolean);

    const overrideSlug = explicitEventVenueOverrides[eventSlug];
    let business = overrideSlug
      ? businesses.find((item) => item?.slug === overrideSlug && item?.publish_ready === true)
      : null;

    if (!business && explicitSlugs.length) {
      business = businesses.find((item) => explicitSlugs.includes(item?.slug) && item?.publish_ready === true);
    }

    if (!business) {
      const venueName = Array.isArray(event.venue_name) ? event.venue_name[0] : event.venue_name;
      if (!venueName) return;
      const normalizedVenue = normalize(venueName);
      business = businesses.find((item) => {
        if (item?.publish_ready !== true) return false;
        const normalizedBusiness = normalize(item.business_name);
        return normalizedBusiness === normalizedVenue ||
          normalizedVenue.startsWith(`${normalizedBusiness} `) ||
          normalizedBusiness.startsWith(`${normalizedVenue} `);
      });
    }

    if (!business?.slug) return;
    const href = `/businesses/${business.slug}/`;

    const venueLine = document.querySelector(".event-hero .venue");
    if (venueLine && !venueLine.querySelector("a")) {
      const citySuffix = event.city ? ` · ${event.city}, ${event.state || ""}`.replace(/,\s*$/, "") : "";
      venueLine.replaceChildren();
      const link = document.createElement("a");
      link.href = href;
      link.textContent = business.business_name;
      venueLine.append(link, document.createTextNode(citySuffix));
    }

    const actionRow = document.querySelector(".primary-actions");
    if (actionRow && !actionRow.querySelector(".venue-button")) {
      const link = document.createElement("a");
      link.className = "button venue-button";
      link.href = href;
      link.textContent = "View primary venue";
      const directions = actionRow.querySelector(".secondary");
      actionRow.insertBefore(link, directions || null);
    }

    for (const dt of document.querySelectorAll(".facts-card dt")) {
      if (!/^venues?$/i.test(dt.textContent?.trim() || "")) continue;
      const dd = dt.nextElementSibling;
      if (!(dd instanceof HTMLElement) || dd.querySelector("a")) continue;
      const link = document.createElement("a");
      link.href = href;
      link.textContent = business.business_name;
      dd.replaceChildren(link);
    }
  }).catch(() => {
    // Leave the server-rendered venue text intact if the fallback lookup fails.
  });
})();
