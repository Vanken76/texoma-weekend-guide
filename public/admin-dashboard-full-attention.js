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

  async function enhance() {
    const grid = document.querySelector("#attention-grid");
    if (!grid) return;

    try {
      const response = await fetch("/data/local-event-directory.json", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const now = new Date();
      const missing = (Array.isArray(data.events) ? data.events : [])
        .filter((event) => isActiveEvent(event, now) && !String(event.venue_slug ?? "").trim())
        .sort((a, b) => String(a.event_name ?? "").localeCompare(String(b.event_name ?? "")));

      const cards = [...grid.querySelectorAll(".attention-card")];
      const target = cards.find((card) => card.textContent.includes("Active events missing venue slug"));
      if (!target) return;

      const listItems = missing.map((event) => {
        const name = escapeHtml(event.event_name || "Unnamed event");
        const venue = escapeHtml(event.venue_name || "Unspecified venue");
        const city = escapeHtml(event.city || "Unknown city");
        const slug = String(event.event_slug || "").trim();
        const label = slug ? `<a href="/events/${encodeURIComponent(slug)}/">${name}</a>` : name;
        return `<li>${label}<small>${venue} • ${city}</small></li>`;
      }).join("");

      const existingList = target.querySelector("ul");
      if (existingList) {
        existingList.outerHTML = `<details class="full-issue-list" open><summary>Show all ${missing.length} events</summary><ul>${listItems}</ul></details>`;
      }
    } catch {
      // Leave the original dashboard card intact if enhancement fails.
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhance);
  else enhance();
})();
