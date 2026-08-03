(() => {
  const normalize = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const eventSlug = location.pathname.match(/^\/events\/([^/]+)\/?$/)?.[1];
  if (!eventSlug) return;

  Promise.all([
    fetch("/data/local-event-directory.json", { cache: "no-store" }).then((response) => response.json()),
    fetch("/data/local-business-directory.json", { cache: "no-store" }).then((response) => response.json())
  ]).then(([eventData, businessData]) => {
    const event = (eventData.events || []).find((item) => item?.event_slug === eventSlug);
    if (!event) return;

    const explicitSlugs = [
      ...(Array.isArray(event.venue_slugs) ? event.venue_slugs : []),
      ...(event.venue_slug ? [event.venue_slug] : []),
      ...(Array.isArray(event.secondary_venue_slugs) ? event.secondary_venue_slugs : [])
    ].filter(Boolean);
    if (explicitSlugs.length) return;

    const venueName = Array.isArray(event.venue_name) ? event.venue_name[0] : event.venue_name;
    if (!venueName) return;

    const business = (businessData.businesses || []).find((item) =>
      item?.publish_ready === true && normalize(item.business_name) === normalize(venueName)
    );
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
