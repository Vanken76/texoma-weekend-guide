(() => {
  const pathMatch = window.location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
  if (!pathMatch) return;

  const slug = decodeURIComponent(pathMatch[1]);

  const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const geographyHref = (reference, matched) => {
    if (reference?.url) return reference.url;
    const entityType = reference?.entity_type || matched?.entity_type || null;
    const entitySlug = reference?.slug || matched?.slug || null;
    if (!entitySlug) return null;

    if (entityType === "state") return `/states/${entitySlug}/`;
    if (matched?.public_url) return matched.public_url;
    return null;
  };

  Promise.all([
    fetch("/data/local-business-directory.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Business directory unavailable"))),
    fetch("/data/local-geography-directory.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { entities: [] })
      .catch(() => ({ entities: [] }))
  ])
    .then(([directory, geographyDirectory]) => {
      const business = (directory.businesses || []).find((item) => item?.slug === slug);
      if (!business) return;

      const rawReferences = business.related_geography ?? business.related_geographies;
      const references = toArray(rawReferences);
      if (!references.length) return;

      const geographyBySlug = new Map(
        (geographyDirectory.entities || [])
          .filter((entity) => entity?.slug)
          .map((entity) => [entity.slug, entity])
      );

      const normalized = references
        .map((reference) => {
          if (!reference) return null;
          const raw = typeof reference === "string" ? { slug: reference } : reference;
          const matched = raw.slug ? geographyBySlug.get(raw.slug) : null;
          const name = raw.name || matched?.name || raw.slug || null;
          if (!name) return null;

          return {
            name,
            href: geographyHref(raw, matched),
            note: raw.note || raw.relationship_note || null
          };
        })
        .filter(Boolean);

      if (!normalized.length) return;

      const mainCard = document.querySelector(".main-card");
      if (!mainCard || document.querySelector(".geography-relationship-group")) return;

      let relationshipsSection = mainCard.querySelector(".relationships-section");
      if (!relationshipsSection) {
        relationshipsSection = document.createElement("section");
        relationshipsSection.className = "relationships-section";
        const sectionHeading = document.createElement("h2");
        sectionHeading.textContent = "Related places";
        relationshipsSection.appendChild(sectionHeading);

        const shareBlock = mainCard.querySelector(".share-block");
        mainCard.insertBefore(relationshipsSection, shareBlock || null);
      }

      const group = document.createElement("div");
      group.className = "relationship-group geography-relationship-group";

      const heading = document.createElement("h3");
      heading.textContent = "Related geography";
      group.appendChild(heading);

      const list = document.createElement("ul");
      normalized.forEach((item) => {
        const listItem = document.createElement("li");

        if (item.href) {
          const link = document.createElement("a");
          link.href = item.href;
          link.textContent = item.name;
          listItem.appendChild(link);
        } else {
          listItem.appendChild(document.createTextNode(item.name));
        }

        if (item.note) {
          const note = document.createElement("span");
          note.textContent = ` — ${item.note}`;
          listItem.appendChild(note);
        }

        list.appendChild(listItem);
      });

      group.appendChild(list);
      relationshipsSection.appendChild(group);
    })
    .catch(() => {});
})();
