(() => {
  const businessSlug = location.pathname.match(/^\/businesses\/([^/]+)\/?$/)?.[1];
  if (!businessSlug) return;

  const styleId = "twg-fallback-event-card-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .twg-fallback-events-section {
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid #d7e0e4;
      }
      .twg-fallback-event-list {
        display: grid;
        gap: .8rem;
      }
      .twg-fallback-event-card {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 1rem;
        border: 1px solid #d7e0e4;
        border-radius: .8rem;
        background: #fff;
      }
      .twg-fallback-event-card h3 {
        margin: .35rem 0 .65rem;
        color: #103a58;
      }
      .twg-fallback-event-card h3 a {
        color: #176f95;
        font-weight: 800;
      }
      .twg-fallback-event-card p {
        margin: .35rem 0;
      }
      .twg-fallback-event-status {
        color: #236b45;
        font-size: .88rem;
        font-weight: 900;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .twg-fallback-event-link {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        min-height: 48px;
        padding: .75rem 1rem;
        border-radius: .7rem;
        background: #176f95;
        color: #fff !important;
        font-weight: 900;
        text-decoration: none;
        white-space: nowrap;
      }
      @media (max-width: 640px) {
        .twg-fallback-event-card {
          align-items: stretch;
          flex-direction: column;
        }
        .twg-fallback-event-link {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const normalize = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const explicitEventVenueOverrides = {
    "country-line-dance-class-mckinney": { slug: "the-dance-collective-mckinney", name: "The Dance Collective" },
    "two-step-in-mckinney": { slug: "the-dance-collective-mckinney", name: "The Dance Collective" },
    "swing-rumba-dance-lessons-denison": { name: "The Venue on Main" }
  };

  const currentBusinessName = document.querySelector(".business-hero h1")?.textContent?.trim() || "";

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

  fetch(`/data/local-event-directory.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((eventData) => {
      const matchedEvents = (eventData.events || []).filter((event) => {
        if (event?.publish_ready !== true || !event?.event_slug) return false;
        const slugs = [
          ...(Array.isArray(event.venue_slugs) ? event.venue_slugs : []),
          ...(event.venue_slug ? [event.venue_slug] : []),
          ...(Array.isArray(event.secondary_venue_slugs) ? event.secondary_venue_slugs : [])
        ].filter(Boolean);

        const override = explicitEventVenueOverrides[event.event_slug];
        const overrideMatches = Boolean(override) && (
          (override.slug && override.slug === businessSlug) ||
          (override.name && normalize(override.name) === normalize(currentBusinessName))
        );

        return slugs.includes(businessSlug) || overrideMatches;
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
        section.className = "events-section twg-fallback-events-section";
        const heading = document.createElement("h2");
        heading.textContent = `Events at ${currentBusinessName || "this venue"}`;
        list = document.createElement("div");
        list.className = "event-list twg-fallback-event-list";
        section.append(heading, list);
        const relationships = mainCard.querySelector(".relationships-section");
        const share = mainCard.querySelector(".share-block");
        mainCard.insertBefore(section, relationships || share || null);
      }

      if (!(list instanceof HTMLElement)) return;
      list.classList.add("twg-fallback-event-list");

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
          card.className = "event-card twg-fallback-event-card";

          const copy = document.createElement("div");
          const status = document.createElement("p");
          status.className = "event-status twg-fallback-event-status";
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
          view.className = "event-link twg-fallback-event-link";
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
