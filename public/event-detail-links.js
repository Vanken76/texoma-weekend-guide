(() => {
  const cards = [...document.querySelectorAll("[data-event-card]")];
  if (!cards.length) return;

  fetch("/data/local-event-directory.json")
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load event directory");
      return response.json();
    })
    .then((directory) => {
      const slugByName = new Map(
        (directory.events || [])
          .filter((event) => event.publish_ready === true && event.event_slug && event.event_name)
          .map((event) => [event.event_name.trim().toLowerCase(), event.event_slug])
      );

      cards.forEach((card) => {
        const heading = card.querySelector("h2");
        const actions = card.querySelector(".event-actions");
        if (!heading || !actions) return;

        const slug = slugByName.get(heading.textContent.trim().toLowerCase());
        if (!slug) return;

        const url = `/events/${slug}/`;
        const titleLink = document.createElement("a");
        titleLink.href = url;
        titleLink.textContent = heading.textContent;
        titleLink.className = "event-title-link";
        heading.replaceChildren(titleLink);

        if (!actions.querySelector(".detail-link")) {
          const detailLink = document.createElement("a");
          detailLink.href = url;
          detailLink.className = "detail-link";
          detailLink.textContent = "View event page";
          actions.prepend(detailLink);
        }
      });

      const style = document.createElement("style");
      style.textContent = `
        .event-title-link { color: inherit; text-decoration-thickness: .08em; text-underline-offset: .14em; }
        .detail-link { display: inline-block; padding: .75rem 1rem; border-radius: .65rem; background: #103a58; color: white; font-weight: 900; text-decoration: none; }
      `;
      document.head.appendChild(style);
    })
    .catch((error) => console.warn("Event detail links were not added:", error));
})();
