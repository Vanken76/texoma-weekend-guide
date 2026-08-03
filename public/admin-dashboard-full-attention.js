(() => {
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

  let eventDataPromise;
  const loadEvents = () => {
    if (!eventDataPromise) {
      eventDataPromise = fetch("/data/local-event-directory.json", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Event data unavailable")));
    }
    return eventDataPromise;
  };

  async function enhance() {
    const grid = document.querySelector("#attention-grid");
    if (!grid) return false;

    const target = [...grid.querySelectorAll(".attention-card")]
      .find((card) => card.textContent.includes("Active events missing venue slug"));
    if (!target) return false;
    if (target.querySelector(".full-issue-list")) return true;

    try {
      const data = await loadEvents();
      const now = new Date();
      const missing = (Array.isArray(data.events) ? data.events : [])
        .filter((event) => isActiveEvent(event, now) && !String(event.venue_slug ?? "").trim())
        .sort((a, b) => String(a.event_name ?? "").localeCompare(String(b.event_name ?? "")));

      const listItems = missing.map((event) => {
        const name = escapeHtml(event.event_name || "Unnamed event");
        const venue = escapeHtml(event.venue_name || "Unspecified venue");
        const city = escapeHtml(event.city || "Unknown city");
        const slug = String(event.event_slug || "").trim();
        const label = slug ? `<a href="/events/${encodeURIComponent(slug)}/">${name}</a>` : name;
        return `<li>${label}<small>${venue} • ${city}</small></li>`;
      }).join("");

      const existingList = target.querySelector("ul");
      if (!existingList) return false;
      existingList.outerHTML = `<details class="full-issue-list" open><summary>All ${missing.length} events missing venue slugs</summary><ul>${listItems}</ul></details>`;
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

    const observeWhenReady = () => {
      const grid = document.querySelector("#attention-grid");
      if (grid) {
        observer.observe(grid, { childList: true, subtree: true });
        return true;
      }
      return false;
    };

    observeWhenReady();

    let attempts = 0;
    const retry = setInterval(async () => {
      attempts += 1;
      if (!document.querySelector("#attention-grid")) observeWhenReady();
      if (await enhance() || attempts >= 40) {
        clearInterval(retry);
        observer.disconnect();
      }
    }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
