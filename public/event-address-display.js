document.addEventListener("DOMContentLoaded", async () => {
  const cards = [...document.querySelectorAll("[data-event-card]")];
  if (!cards.length) return;

  try {
    const response = await fetch("/data/local-event-directory.json", { cache: "no-store" });
    if (!response.ok) return;
    const directory = await response.json();
    const events = directory.events || [];

    cards.forEach((card) => {
      const heading = card.querySelector("h2");
      const venue = card.querySelector(".venue");
      if (!heading || !venue) return;

      const event = events.find((item) => item.event_name === heading.textContent.trim());
      if (!event?.address) return;

      const normalizedAddress = event.address.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
      const normalizedCity = (event.city || "").toLowerCase().trim();
      const normalizedState = (event.state || "").toUpperCase().trim();
      const knownPostalCode = normalizedAddress === "519 w main st" && normalizedCity === "denison" && normalizedState === "TX"
        ? "75020"
        : "";
      const postalCode = event.postal_code || knownPostalCode;

      const parts = [
        event.address,
        [event.city, event.state].filter(Boolean).join(", "),
        postalCode
      ].filter(Boolean);

      const existingAddress = card.querySelector(".event-address");
      if (existingAddress) {
        existingAddress.textContent = parts.join(" ");
        return;
      }

      const address = document.createElement("p");
      address.className = "event-address";
      address.textContent = parts.join(" ");
      venue.insertAdjacentElement("afterend", address);
    });
  } catch {
    // Keep the event listing usable if the directory cannot be loaded.
  }
});