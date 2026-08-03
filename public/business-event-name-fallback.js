(() => {
  const businessSlug = location.pathname.match(/^\/businesses\/([^/]+)\/?$/)?.[1];
  if (!businessSlug) return;

  const explicitEventVenueOverrides = {
    "country-line-dance-class-mckinney": "the-dance-collective-mckinney",
    "two-step-in-mckinney": "the-dance-collective-mckinney",
    "swing-rumba-dance-lessons": "the-venue-on-main"
  };

  const formatDate = (value) => value
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(new Date(value))
    : "";

  const formatTime = (value) => value
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value))
    : "";

  fetch("/data/local-event-directory.json", { cache: "no-store" })
    .then((response) => response.json())
    .then((eventData) => {
      const matchedEvents = (eventData.events || []).filter((event) => {
        if (event?.publish_ready !== true || !event?.event_slug) return false;
        const slugs = [
          ...(Array.isArray(event.venue_slugs) ? event.venue_slugs : []),
          ...(event.venue_slug ? [event.venue_slug] : []),
          ...(Array.isArray(event.secondary_venue_slugs) ? event.secondary_venue_slugs : [])
        ].filter(Boolean);
        return slugs.includes(businessSlug) || explicitEventVenueOverrides[event.event_slug] === businessSlug;
      });

      if (!matchedEvents.length) return;

      const mainCard = document.querySelector(".business-detail .main-card");
      if (!(mainCard instanceof HTMLElement)) return;

      let section = mainCard.querySelector(".events-section");
      let list;

      if (section instanceof HTMLElement) {
        list = section.querySelector(".event-list");
      } else {
        section = document.createElement("section");
        section.className = "events-section";
        const heading = document.createElement("h2");
        const businessName = document.querySelector(".business-hero h1")?.textContent?.trim() || "this venue";
        heading.textContent = `Events at ${businessName}`;
        list = document.createElement("div");
        list.className = "event-list";
        section.append(heading, list);
        const relationships = mainCard.querySelector(".relationships-section");
        const share = mainCard.querySelector(".share-block");
        mainCard.insertBefore(section, relationships || share || null);
      }

      if (!(list instanceof HTMLElement)) return;
      const existing = new Set(
        [...list.querySelectorAll('a[href^="/events/"]')]
          .map((link) => link.getAttribute("href")?.match(/^\/events\/([^/]+)\/?$/)?.[1])
          .filter(Boolean)
      );

      matchedEvents
        .sort((a, b) => new Date(a.start_datetime || "9999-12-31").getTime() - new Date(b.start_datetime || "9999-12-31").getTime())
        .forEach((event) => {
          if (existing.has(event.event_slug)) return;
          const card = document.createElement("article");
          card.className = "event-card";

          const copy = document.createElement("div");
          const status = document.createElement("p");
          status.className = "event-status";
          status.textContent = event.status === "recurring" || event.recurring ? "Recurring event" : "Upcoming event";

          const heading = document.createElement("h3");
          const titleLink = document.createElement("a");
          titleLink.href = `/events/${event.event_slug}/`;
          titleLink.textContent = event.event_name || event.event_slug;
          heading.append(titleLink);
          copy.append(status, heading);

          if (event.start_datetime) {
            const timing = document.createElement("p");
            timing.textContent = `${event.status === "recurring" || event.recurring ? "Begins " : ""}${formatDate(event.start_datetime)} · ${formatTime(event.start_datetime)}`;
            copy.append(timing);
          }

          const view = document.createElement("a");
          view.className = "event-link";
          view.href = `/events/${event.event_slug}/`;
          view.textContent = "View event";
          card.append(copy, view);
          list.append(card);
        });
    })
    .catch(() => {
      // Leave the server-rendered business page unchanged if the event lookup fails.
    });
})();
