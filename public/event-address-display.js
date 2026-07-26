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

      const parts = [
        event.address,
        [event.city, event.state].filter(Boolean).join(", "),
        event.postal_code
      ].filter(Boolean);

      const address = document.createElement("p");
      address.className = "event-address";
      address.textContent = parts.join(" ");
      venue.insertAdjacentElement("afterend", address);
    });
  } catch {
    // Keep the event listing usable if the directory cannot be loaded.
  }
});
