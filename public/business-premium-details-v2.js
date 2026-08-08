(() => {
  const pathMatch = window.location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
  if (!pathMatch) return;

  const slug = decodeURIComponent(pathMatch[1]);
  const truthyLabel = (key) => ({
    family_friendly: "Family Friendly",
    pet_friendly: "Pet Friendly",
    dog_friendly: "Dog Friendly",
    food_available: "Food Available",
    full_bar: "Full Bar",
    live_music: "Live Music",
    karaoke: "Karaoke",
    outdoor_seating: "Outdoor Seating",
    wheelchair_accessible: "Wheelchair Accessible",
    great_photo_spot: "Great Photo Spot",
    reservations_recommended: "Reservations Recommended",
    free_wifi: "Free Wi-Fi",
    boat_parking: "Boat Parking",
    rv_parking: "RV Parking",
    waterfront: "Waterfront",
    lake_view: "Lake View"
  }[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));

  const iconFor = (label) => {
    const value = label.toLowerCase();
    if (value.includes("pet") || value.includes("dog")) return "🐕";
    if (value.includes("food")) return "🍔";
    if (value.includes("bar") || value.includes("drink")) return "🍺";
    if (value.includes("music")) return "🎵";
    if (value.includes("karaoke")) return "🎤";
    if (value.includes("outdoor") || value.includes("patio")) return "🌿";
    if (value.includes("photo")) return "📸";
    if (value.includes("wheelchair") || value.includes("accessible")) return "♿";
    if (value.includes("family")) return "👨‍👩‍👧";
    if (value.includes("visit") || value.includes("time")) return "⏰";
    if (value.includes("price")) return "💲";
    if (value.includes("parking")) return "🅿️";
    if (value.includes("water") || value.includes("lake")) return "🌊";
    return "✓";
  };

  const createSection = (title, className) => {
    const section = document.createElement("section");
    section.className = `premium-business-section ${className}`;
    const heading = document.createElement("h2");
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  };

  const normalizeGoodToKnow = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === "string") return [value];
    if (typeof value === "object") {
      return Object.entries(value)
        .filter(([, item]) => item !== null && item !== false && item !== "")
        .map(([key, item]) => item === true ? truthyLabel(key) : `${truthyLabel(key)}: ${item}`);
    }
    return [];
  };

  Promise.all([
    fetch("/data/local-business-directory.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Directory unavailable"))),
    fetch("/data/business-relationship-overrides.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { records: {} })
      .catch(() => ({ records: {} }))
  ])
    .then(([directory, relationshipBridge]) => {
      const business = (directory.businesses || []).find((item) => item?.slug === slug);
      if (!business) return;

      const mainCard = document.querySelector(".main-card");
      if (!mainCard || document.querySelector(".premium-business-details")) return;

      const bridgeRecord = relationshipBridge?.records?.[slug] || {};
      const replacements = bridgeRecord.good_to_know_replacements && typeof bridgeRecord.good_to_know_replacements === "object"
        ? bridgeRecord.good_to_know_replacements
        : {};

      const wrapper = document.createElement("div");
      wrapper.className = "premium-business-details";

      if (business.why_visit) {
        const section = createSection("Why Visit?", "why-visit");
        const paragraph = document.createElement("p");
        paragraph.textContent = business.why_visit;
        section.appendChild(paragraph);
        wrapper.appendChild(section);
      }

      if (business.why_its_unique) {
        const section = createSection("Why It’s Unique", "why-unique");
        const paragraph = document.createElement("p");
        paragraph.textContent = business.why_its_unique;
        section.appendChild(paragraph);
        wrapper.appendChild(section);
      }

      const glance = business.at_a_glance && typeof business.at_a_glance === "object" ? business.at_a_glance : {};
      const glanceItems = [];
      if (glance.average_visit) glanceItems.push(["Average Visit", glance.average_visit]);
      if (glance.price_range || business.price_range) glanceItems.push(["Price Range", glance.price_range || business.price_range]);
      Object.entries(glance).forEach(([key, value]) => {
        if (["average_visit", "price_range"].includes(key) || value !== true) return;
        glanceItems.push([truthyLabel(key), null]);
      });
      if (glanceItems.length) {
        const section = createSection("At a Glance", "at-a-glance");
        const grid = document.createElement("div");
        grid.className = "glance-grid";
        glanceItems.forEach(([label, value]) => {
          const item = document.createElement("div");
          item.className = "glance-item";
          item.innerHTML = `<span class="glance-icon" aria-hidden="true">${iconFor(label)}</span><span><strong>${label}</strong>${value ? `<small>${value}</small>` : ""}</span>`;
          grid.appendChild(item);
        });
        section.appendChild(grid);
        wrapper.appendChild(section);
      }

      const amenities = Array.isArray(business.amenities) ? business.amenities.filter(Boolean) : [];
      if (amenities.length) {
        const section = createSection("Amenities", "amenities-section");
        const list = document.createElement("div");
        list.className = "amenities-list";
        amenities.forEach((amenity) => {
          const badge = document.createElement("span");
          badge.textContent = `${iconFor(String(amenity))} ${amenity}`;
          list.appendChild(badge);
        });
        section.appendChild(list);
        wrapper.appendChild(section);
      }

      const goodToKnow = normalizeGoodToKnow(business.good_to_know)
        .map((note) => Object.prototype.hasOwnProperty.call(replacements, note) ? replacements[note] : note);
      if (goodToKnow.length) {
        const section = createSection("Good to Know", "good-to-know");
        const list = document.createElement("ul");
        goodToKnow.forEach((note) => {
          const item = document.createElement("li");
          item.textContent = note;
          list.appendChild(item);
        });
        section.appendChild(list);
        wrapper.appendChild(section);
      }

      if (!wrapper.children.length) return;
      const hoursSection = mainCard.querySelector(".hours-section");
      mainCard.insertBefore(wrapper, hoursSection || mainCard.querySelector(".events-section") || null);

      const style = document.createElement("style");
      style.textContent = `.premium-business-details{margin-top:2rem}.premium-business-section{margin-top:1.25rem;padding:1.25rem;border:1px solid #d7e0e4;border-radius:.9rem;background:#f8fbfc}.premium-business-section h2{margin:0 0 .75rem}.premium-business-section p{margin:0;line-height:1.65}.why-visit{border-left:5px solid #176f95}.why-unique{border-left:5px solid #236b45;background:#f5fbf7}.glance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.7rem}.glance-item{display:flex;gap:.65rem;align-items:center;padding:.75rem;border-radius:.7rem;background:white;border:1px solid #d7e0e4}.glance-icon{font-size:1.35rem}.glance-item strong,.glance-item small{display:block}.glance-item small{margin-top:.15rem;color:#526470}.amenities-list{display:flex;flex-wrap:wrap;gap:.55rem}.amenities-list span{padding:.48rem .7rem;border-radius:999px;background:#e8f4f8;color:#176f95;font-weight:800}.good-to-know ul{margin:.25rem 0 0;padding-left:1.2rem}.good-to-know li+li{margin-top:.45rem}`;
      document.head.appendChild(style);
    })
    .catch(() => {});
})();
