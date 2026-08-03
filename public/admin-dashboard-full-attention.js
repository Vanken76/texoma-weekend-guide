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

  const editorLink = (slug, label) => {
    const cleanSlug = String(slug ?? "").trim();
    const cleanLabel = escapeHtml(label || cleanSlug || "Unnamed record");
    return cleanSlug
      ? `<a href="/admin-record?slug=${encodeURIComponent(cleanSlug)}">${cleanLabel}</a>`
      : cleanLabel;
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
    if (!card) return;
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

  const findCard = (cards, title) => cards.find((card) => card.textContent.includes(title));
  const sortBusinesses = (items) => [...items].sort((a, b) => String(a.business_name ?? "").localeCompare(String(b.business_name ?? "")));
  const sortEvents = (items) => [...items].sort((a, b) => String(a.event_name ?? "").localeCompare(String(b.event_name ?? "")));
  const hasUsableHours = (business) => business?.hours && typeof business.hours === "object" && !Array.isArray(business.hours) && Object.keys(business.hours).length > 0;

  async function enhance() {
    const grid = document.querySelector("#attention-grid");
    if (!grid) return false;

    const cards = [...grid.querySelectorAll(".attention-card")];
    if (!cards.length) return false;

    try {
      const [eventData, businessData] = await loadData();
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - 180 * 86_400_000);
      const inTwoDays = new Date(now.getTime() + 2 * 86_400_000);
      const events = Array.isArray(eventData.events) ? eventData.events : [];
      const businesses = Array.isArray(businessData.businesses) ? businessData.businesses : [];
      const publishedBusinesses = businesses.filter((business) => business?.publish_ready === true);
      const businessSlugs = new Set(businesses.map((business) => String(business?.slug ?? "").trim()).filter(Boolean));
      const activeEvents = events.filter((event) => isActiveEvent(event, now));

      const missing = sortEvents(activeEvents.filter((event) => venueSlugs(event).length === 0));
      const broken = activeEvents
        .map((event) => ({ event, invalid: venueSlugs(event).filter((slug) => !businessSlugs.has(slug)) }))
        .filter((item) => item.invalid.length > 0)
        .sort((a, b) => String(a.event.event_name ?? "").localeCompare(String(b.event.event_name ?? "")));

      replaceCard(
        cards.find((card) => card.textContent.includes("Active events missing venue slug") || card.textContent.includes("Active events missing venue relationship")),
        "Active events missing venue relationship",
        missing,
        (event) => `<li>${editorLink(event.event_slug, event.event_name)}<small>${escapeHtml(event.venue_name || "Unspecified venue")} • ${escapeHtml(event.city || "Unknown city")}</small></li>`
      );

      replaceCard(
        findCard(cards, "Broken venue relationships"),
        "Broken venue relationships",
        broken,
        ({ event, invalid }) => `<li>${editorLink(event.event_slug, event.event_name)}<small>${escapeHtml(invalid.join(", "))}</small></li>`
      );

      const businessIssues = [
        ["Businesses missing Facebook", publishedBusinesses.filter((business) => !String(business.facebook ?? "").trim())],
        ["Businesses missing website", publishedBusinesses.filter((business) => !String(business.website ?? "").trim())],
        ["Businesses missing hours", publishedBusinesses.filter((business) => !hasUsableHours(business))],
        ["Malformed business hours", publishedBusinesses.filter((business) => business.hours && (typeof business.hours !== "object" || Array.isArray(business.hours)))],
        ["Businesses missing location", publishedBusinesses.filter((business) => !String(business.service_area_or_location ?? "").trim())],
        ["Businesses missing verification", publishedBusinesses.filter((business) => !String(business.last_checked ?? "").trim() || !String(business.verification_note ?? "").trim())],
        ["Businesses stale 180+ days", publishedBusinesses.filter((business) => {
          const checked = business.last_checked ? new Date(business.last_checked) : null;
          return !checked || Number.isNaN(checked.getTime()) || checked < staleCutoff;
        })]
      ];

      for (const [title, items] of businessIssues) {
        replaceCard(
          findCard(cards, title),
          title,
          sortBusinesses(items),
          (business) => `<li>${editorLink(business.slug, business.business_name)}</li>`
        );
      }

      const expiringSoon = sortEvents(activeEvents.filter((event) => {
        const raw = event.end_datetime || event.start_datetime;
        if (!raw || event.status === "recurring") return false;
        const ending = new Date(raw);
        return !Number.isNaN(ending.getTime()) && ending >= now && ending <= inTwoDays;
      }));
      replaceCard(
        findCard(cards, "Events ending within 48 hours"),
        "Events ending within 48 hours",
        expiringSoon,
        (event) => `<li>${editorLink(event.event_slug, event.event_name)}</li>`
      );

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
