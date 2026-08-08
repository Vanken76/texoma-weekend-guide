(() => {
  const pathMatch = window.location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
  if (!pathMatch) return;

  const slug = decodeURIComponent(pathMatch[1]);

  const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const parentReferenceFor = (business, parentSlug) => {
    const references = toArray(business?.parent_business ?? business?.parentBusiness);
    for (const reference of references) {
      if (!reference) continue;
      if (typeof reference === "string" && reference === parentSlug) {
        return { slug: reference, note: null };
      }
      if (typeof reference === "object" && reference.slug === parentSlug) {
        return {
          slug: reference.slug,
          note: reference.note || reference.relationship_note || null
        };
      }
    }
    return null;
  };

  fetch("/data/local-business-directory.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Business directory unavailable")))
    .then((directory) => {
      const businesses = Array.isArray(directory.businesses) ? directory.businesses : [];
      const children = businesses
        .filter((item) => item?.publish_ready === true && item?.slug && item.slug !== slug)
        .map((item) => ({ item, parentRef: parentReferenceFor(item, slug) }))
        .filter(({ parentRef }) => Boolean(parentRef))
        .map(({ item, parentRef }) => ({
          slug: item.slug,
          name: item.business_name || item.name || item.slug,
          href: `/businesses/${item.slug}/`,
          note: parentRef.note
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!children.length) return;

      const mainCard = document.querySelector(".main-card");
      if (!mainCard) return;

      let relationshipsSection = mainCard.querySelector(".relationships-section");
      if (!relationshipsSection) {
        relationshipsSection = document.createElement("section");
        relationshipsSection.className = "relationships-section";
        const heading = document.createElement("h2");
        heading.textContent = "Related places";
        relationshipsSection.appendChild(heading);
        const shareBlock = mainCard.querySelector(".share-block");
        mainCard.insertBefore(relationshipsSection, shareBlock || null);
      }

      let locatedGroup = Array.from(relationshipsSection.querySelectorAll(".relationship-group"))
        .find((group) => group.querySelector("h3")?.textContent?.trim() === "Located here");

      if (!locatedGroup) {
        locatedGroup = document.createElement("div");
        locatedGroup.className = "relationship-group inferred-child-relationship-group";
        const heading = document.createElement("h3");
        heading.textContent = "Located here";
        locatedGroup.appendChild(heading);
        const list = document.createElement("ul");
        locatedGroup.appendChild(list);

        const geographyGroup = relationshipsSection.querySelector(".geography-relationship-group");
        relationshipsSection.insertBefore(locatedGroup, geographyGroup || null);
      }

      let list = locatedGroup.querySelector("ul");
      if (!list) {
        list = document.createElement("ul");
        locatedGroup.appendChild(list);
      }

      const existingHrefs = new Set(
        Array.from(list.querySelectorAll("a[href]"))
          .map((link) => link.getAttribute("href"))
          .filter(Boolean)
      );

      for (const child of children) {
        if (existingHrefs.has(child.href)) continue;

        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = child.href;
        link.textContent = child.name;
        item.appendChild(link);

        if (child.note) {
          const note = document.createElement("span");
          note.textContent = ` — ${child.note}`;
          item.appendChild(note);
        }

        list.appendChild(item);
        existingHrefs.add(child.href);
      }
    })
    .catch(() => {});
})();
