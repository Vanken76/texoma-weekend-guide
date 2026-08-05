(() => {
  const DATA_URL = "/data/local-business-directory.json";

  const addStyles = () => {
    if (document.getElementById("twg-profile-level-styles")) return;
    const style = document.createElement("style");
    style.id = "twg-profile-level-styles";
    style.textContent = `
      .twg-profile-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .72rem;border-radius:999px;font-size:.9rem;font-weight:900}
      .twg-profile-badge.spotlight{background:#f5a623;color:#103a58}
      .twg-profile-badge.partner{background:#236b45;color:#fff}
      .twg-profile-note{margin:1.5rem 0 0;padding:1.25rem 1.4rem;border:2px solid #f5a623;border-radius:1rem;background:#fff9ed;box-shadow:0 10px 26px rgba(16,58,88,.06)}
      .twg-profile-note.partner{border-color:#236b45;background:#eef8f1}
      .twg-profile-note p{margin:.35rem 0 0;color:#293943;line-height:1.6}
      .twg-profile-note strong{color:#103a58;font-size:1.05rem}
      .twg-spotlight-home{margin:3rem auto;padding:2rem;border-radius:1.25rem;background:#fff9ed;border:1px solid #ead8aa}
      .twg-spotlight-home h2{margin:.2rem 0 .5rem;color:#103a58}
      .twg-spotlight-home .intro{margin:0 0 1.25rem;color:#526470}
      .twg-spotlight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}
      .twg-spotlight-card{display:block;padding:1.2rem;border-radius:1rem;background:#fff;border:1px solid #d7e0e4;color:#103a58;text-decoration:none;box-shadow:0 8px 20px rgba(16,58,88,.06)}
      .twg-spotlight-card:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(16,58,88,.1)}
      .twg-spotlight-card .label{display:inline-block;margin-bottom:.55rem;color:#9a5a00;font-size:.78rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .twg-spotlight-card h3{margin:0 0 .4rem;color:#103a58}
      .twg-spotlight-card p{margin:0;color:#526470;line-height:1.5}
    `;
    document.head.appendChild(style);
  };

  const getBusinesses = async () => {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.businesses) ? data.businesses : [];
  };

  const renderBusinessProfile = (business) => {
    const level = business?.profile_level;
    if (!business || !["spotlight", "advertising_partner"].includes(level)) return;

    addStyles();
    const statusRow = document.querySelector(".business-detail .status-row");
    if (statusRow && !statusRow.querySelector(".twg-profile-badge")) {
      const badge = document.createElement("span");
      badge.className = `twg-profile-badge ${level === "spotlight" ? "spotlight" : "partner"}`;
      badge.textContent = level === "spotlight" ? "TWG Business Spotlight" : "TWG Advertising Partner";
      statusRow.appendChild(badge);
    }

    const hero = document.querySelector(".business-detail .business-hero");
    if (hero && !document.querySelector(".twg-profile-note")) {
      const note = document.createElement("section");
      note.className = `twg-profile-note ${level === "advertising_partner" ? "partner" : ""}`;
      const heading = level === "spotlight" ? "Why TWG is spotlighting this business" : "Paid advertising disclosure";
      const fallback = level === "spotlight"
        ? "Selected by Texoma Weekend Guide as a locally owned business worth discovering. This editorial spotlight is not paid advertising."
        : "This business supports Texoma Weekend Guide through paid advertising and promotional services.";
      note.innerHTML = `<strong>${heading}</strong><p>${business.spotlight_reason || fallback}</p>`;
      hero.insertAdjacentElement("afterend", note);
    }
  };

  const renderHomepageSpotlights = (businesses) => {
    if (location.pathname !== "/" || document.querySelector(".twg-spotlight-home")) return;
    const spotlights = businesses.filter((business) =>
      business.publish_ready === true && business.profile_level === "spotlight" && business.featured === true
    );
    if (!spotlights.length) return;

    addStyles();
    const section = document.createElement("section");
    section.className = "twg-spotlight-home container";
    section.innerHTML = `
      <p class="eyebrow">Locally selected</p>
      <h2>TWG Business Spotlight</h2>
      <p class="intro">Editorial spotlights shine a light on local businesses worth discovering. These selections are not paid advertisements.</p>
      <div class="twg-spotlight-grid"></div>
    `;
    const grid = section.querySelector(".twg-spotlight-grid");
    spotlights.forEach((business) => {
      const card = document.createElement("a");
      card.className = "twg-spotlight-card";
      card.href = `/businesses/${business.slug}/`;
      const summary = business.why_visit || business.description || "Discover this Texoma business.";
      card.innerHTML = `<span class="label">Business Spotlight</span><h3>${business.business_name}</h3><p>${summary}</p>`;
      grid.appendChild(card);
    });
    document.querySelector("main")?.appendChild(section);
  };

  getBusinesses()
    .then((businesses) => {
      const match = location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
      if (match) renderBusinessProfile(businesses.find((business) => business.slug === decodeURIComponent(match[1])));
      renderHomepageSpotlights(businesses);
    })
    .catch((error) => console.warn("TWG profile-level rendering skipped", error));
})();
