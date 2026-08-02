(() => {
  const controls = document.querySelector(".controls");
  const cards = Array.from(document.querySelectorAll(".business-card"));
  if (!controls || !cards.length || document.querySelector("#amenity-filter")) return;

  const label = document.createElement("label");
  label.innerHTML = '<span>Amenity</span><select id="amenity-filter"><option value="">All amenities</option></select>';
  const clearButton = controls.querySelector("#clear-filters");
  controls.insertBefore(label, clearButton || null);
  const amenityFilter = label.querySelector("#amenity-filter");

  const slugForCard = (card) => {
    const link = card.querySelector('a[href^="/businesses/"]');
    const match = link?.getAttribute("href")?.match(/^\/businesses\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const normalize = (value) => String(value || "").trim();
  const addTruthyGlance = (business, set) => {
    const glance = business.at_a_glance;
    if (!glance || typeof glance !== "object") return;
    Object.entries(glance).forEach(([key, value]) => {
      if (value !== true) return;
      set.add(key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
    });
  };

  fetch("/data/local-business-directory.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Directory unavailable")))
    .then((directory) => {
      const bySlug = new Map((directory.businesses || []).map((business) => [business.slug, business]));
      const allAmenities = new Set();

      cards.forEach((card) => {
        const business = bySlug.get(slugForCard(card));
        if (!business) return;
        const amenities = new Set();
        (Array.isArray(business.amenities) ? business.amenities : []).forEach((item) => amenities.add(normalize(item)));
        (Array.isArray(business.tags) ? business.tags : []).forEach((item) => amenities.add(normalize(item)));
        addTruthyGlance(business, amenities);
        if (business.pet_friendly === true) amenities.add("Pet Friendly");
        if (business.dog_friendly === true) amenities.add("Dog Friendly");
        if (business.family_friendly === true) amenities.add("Family Friendly");
        if (business.family_friendly === false) amenities.add("Adults Only");
        const values = Array.from(amenities).filter(Boolean);
        card.dataset.amenities = values.map((item) => item.toLowerCase()).join("|");
        card.dataset.search = `${card.dataset.search || ""} ${values.join(" ").toLowerCase()}`.trim();
        values.forEach((item) => allAmenities.add(item));
      });

      Array.from(allAmenities).sort((a, b) => a.localeCompare(b)).forEach((amenity) => {
        const option = document.createElement("option");
        option.value = amenity.toLowerCase();
        option.textContent = amenity;
        amenityFilter.appendChild(option);
      });

      const originalUpdate = window.updateDirectory;
      const applyAmenity = () => {
        const selected = amenityFilter.value;
        cards.forEach((card) => {
          const baseVisible = !card.hidden;
          const matches = !selected || (card.dataset.amenities || "").split("|").includes(selected);
          card.hidden = !(baseVisible && matches);
        });
        const visible = cards.filter((card) => !card.hidden);
        const count = document.querySelector("#result-count");
        const empty = document.querySelector("#no-results");
        if (count) count.textContent = `Showing ${visible.length} ${visible.length === 1 ? "business" : "businesses"}`;
        if (empty) empty.hidden = visible.length !== 0;
      };

      const refresh = () => {
        cards.forEach((card) => { card.hidden = false; });
        const search = document.querySelector("#business-search")?.value.trim().toLowerCase() || "";
        const category = document.querySelector("#category-filter")?.value || "";
        const location = document.querySelector("#location-filter")?.value || "";
        cards.forEach((card) => {
          const visible = (!search || (card.dataset.search || "").includes(search)) &&
            (!category || (card.dataset.categories || "").split("|").includes(category)) &&
            (!location || card.dataset.location === location);
          card.hidden = !visible;
        });
        applyAmenity();
      };

      amenityFilter.addEventListener("change", refresh);
      ["#business-search", "#category-filter", "#location-filter", "#sort-filter"].forEach((selector) => {
        document.querySelector(selector)?.addEventListener(selector === "#business-search" ? "input" : "change", () => setTimeout(refresh, 0));
      });
      clearButton?.addEventListener("click", () => {
        amenityFilter.value = "";
        setTimeout(refresh, 0);
      });
    })
    .catch(() => label.remove());
})();
