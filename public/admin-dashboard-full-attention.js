(() => {
  if (window.__twgAdminAttentionLoaded) return;
  window.__twgAdminAttentionLoaded = true;

  const isActiveEvent = (event, now) => {
    if (!event || event.publish_ready !== true || !["upcoming", "recurring"].includes(event.status)) return false;
    const end = event.end_datetime ? new Date(event.end_datetime) : null;
    if (end && !Number.isNaN(end.getTime())) return end >= now;
    const start = event.start_datetime ? new Date(event.start_datetime) : null;
    if (!start || Number.isNaN(start.getTime())) return false;
    if (event.status === "recurring" || event.recurring === true) return true;
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay >= now;
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const venueSlugs = (event) => {
    const values = [];
    if (Array.isArray(event?.venue_slugs)) values.push(...event.venue_slugs);
    if (typeof event?.venue_slug === "string") values.push(event.venue_slug);
    return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
  };

  let dataPromise;
  const loadData = () => {
    if (!dataPromise) {
      const fresh = Date.now();
      dataPromise = Promise.all([
        fetch(`/data/local-event-directory.json?fresh=${fresh}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Event data unavailable"))),
        fetch(`/data/local-business-directory.json?fresh=${fresh}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Business data unavailable")))
      ]);
    }
    return dataPromise;
  };

  const replaceCard = (card, title, items, itemRenderer) => {
    const count = items.length;
    const heading = card.querySelector(":scope > div");
    if (heading) heading.innerHTML = `<strong>${count}</strong><span>${escapeHtml(title)}</span>`;

    card.querySelectorAll("ul, .full-issue-list, .clear").forEach((element) => element.remove());

    if (!count) {
      const clear = document.createElement("p");
      clear.className = "clear";
      clear.textContent = "No problems found.";
      card.appendChild(clear);
      return;
    }

    const details = document.createElement("details");
    details.className = "full-issue-list";
    details.open = false;
    details.innerHTML = `<summary>Show all ${count}</summary><ul>${items.map(itemRenderer).join("")}</ul>`;
    card.appendChild(details);
  };

  async function enhance() {
    const grid = document.querySelector("#attention-grid");
    if (!grid) return false;

    const cards = [...grid.querySelectorAll(".attention-card")];
    const missingCard = cards.find((card) => card.textContent.includes("Active events missing venue slug") || card.textContent.includes("Active events missing venue relationship"));
    const brokenCard = cards.find((card) => card.textContent.includes("Broken venue relationships"));
    if (!missingCard || !brokenCard) return false;

    try {
      const [eventData, businessData] = await loadData();
      const now = new Date();
      const events = Array.isArray(eventData.events) ? eventData.events : [];
      const businesses = Array.isArray(businessData.businesses) ? businessData.businesses : [];
      const businessSlugs = new Set(businesses.map((business) => String(business?.slug ?? "").trim()).filter(Boolean));
      const activeEvents = events.filter((event) => isActiveEvent(event, now));

      const missing = activeEvents
        .filter((event) => venueSlugs(event).length === 0)
        .sort((a, b) => String(a.event_name ?? "").localeCompare(String(b.event_name ?? "")));

      const broken = activeEvents
        .map((event) => ({ event, invalid: venueSlugs(event).filter((slug) => !businessSlugs.has(slug)) }))
        .filter((item) => item.invalid.length > 0)
        .sort((a, b) => String(a.event.event_name ?? "").localeCompare(String(b.event.event_name ?? "")));

      replaceCard(missingCard, "Active events missing venue relationship", missing, (event) => {
        const name = escapeHtml(event.event_name || "Unnamed event");
        const venue = escapeHtml(event.venue_name || "Unspecified venue");
        const city = escapeHtml(event.city || "Unknown city");
        const slug = String(event.event_slug || "").trim();
        const label = slug ? `<a href="/events/${encodeURIComponent(slug)}/">${name}</a>` : name;
        return `<li>${label}<small>${venue} • ${city}</small></li>`;
      });

      replaceCard(brokenCard, "Broken venue relationships", broken, ({ event, invalid }) => {
        const name = escapeHtml(event.event_name || "Unnamed event");
        const bad = escapeHtml(invalid.join(", "));
        return `<li>${name}<small>${bad}</small></li>`;
      });

      return true;
    } catch {
      return false;
    }
  }

  async function start() {
    if (await enhance()) return;

    const observer = new MutationObserver(async () => {
      if (await enhance()) observer.disconnect();
    });

    const grid = document.querySelector("#attention-grid");
    if (grid) observer.observe(grid, { childList: true, subtree: true });

    let attempts = 0;
    const retry = setInterval(async () => {
      attempts += 1;
      if (await enhance() || attempts >= 40) {
        clearInterval(retry);
        observer.disconnect();
      }
    }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
