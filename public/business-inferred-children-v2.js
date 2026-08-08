(() => {
  const pathMatch = window.location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
  if (!pathMatch) return;

  const slug = decodeURIComponent(pathMatch[1]);

  const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const ensureRelationshipsSection = (mainCard) => {
    let section = mainCard.querySelector(".relationships-section");
    if (section) return section;

    section = document.createElement("section");
    section.className = "relationships-section";
    const heading = document.createElement("h2");
    heading.textContent = "Related places";
    section.appendChild(heading);
    const shareBlock = mainCard.querySelector(".share-block");
    mainCard.insertBefore(section, shareBlock || null);
    return section;
  };

  const ensureGroup = (relationshipsSection, headingText, className, beforeSelector = null) => {
    let group = Array.from(relationshipsSection.querySelectorAll(".relationship-group"))
      .find((candidate) => candidate.querySelector("h3")?.textContent?.trim() === headingText);
    if (group) return group;

    group = document.createElement("div");
    group.className = `relationship-group ${className}`;
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    group.appendChild(heading);
    group.appendChild(document.createElement("ul"));

    const before = beforeSelector ? relationshipsSection.querySelector(beforeSelector) : null;
    relationshipsSection.insertBefore(group, before || null);
    return group;
  };

  const appendRelationship = (group, relationship) => {
    let list = group.querySelector("ul");
    if (!list) {
      list = document.createElement("ul");
      group.appendChild(list);
    }

    const alreadyExists = relationship.href && Array.from(list.querySelectorAll("a[href]"))
      .some((link) => link.getAttribute("href") === relationship.href);
    if (alreadyExists) return;

    const item = document.createElement("li");
    if (relationship.href) {
      const link = document.createElement("a");
      link.href = relationship.href;
      link.textContent = relationship.name;
      item.appendChild(link);
    } else {
      item.appendChild(document.createTextNode(relationship.name));
    }

    if (relationship.note) {
      const note = document.createElement("span");
      note.textContent = ` — ${relationship.note}`;
      item.appendChild(note);
    }

    list.appendChild(item);
  };

  Promise.all([
    fetch("/data/local-business-directory.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Business directory unavailable"))),
    fetch("/data/business-relationship-overrides.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { records: {} })
      .catch(() => ({ records: {} }))
  ])
    .then(([directory, relationshipBridge]) => {
      const businesses = Array.isArray(directory.businesses) ? directory.businesses : [];
      const bridgeRecords = relationshipBridge?.records && typeof relationshipBridge.records === "object"
        ? relationshipBridge.records
        : {};
      const businessBySlug = new Map(businesses.filter((item) => item?.slug).map((item) => [item.slug, item]));
      const currentBusiness = businessBySlug.get(slug);
      if (!currentBusiness) return;

      const resolvedParentReferences = (business) => {
        const explicit = toArray(business?.parent_business ?? business?.parentBusiness).filter(Boolean);
        if (explicit.length) return explicit;
        return toArray(bridgeRecords[business?.slug]?.parent_business).filter(Boolean);
      };

      const normalizeParent = (reference) => {
        if (!reference) return null;
        const raw = typeof reference === "string" ? { slug: reference } : reference;
        if (!raw.slug) return null;
        const matched = businessBySlug.get(raw.slug);
        return {
          slug: raw.slug,
          name: raw.name || raw.business_name || matched?.business_name || raw.slug,
          href: `/businesses/${raw.slug}/`,
          note: raw.note || raw.relationship_note || null
        };
      };

      const mainCard = document.querySelector(".main-card");
      if (!mainCard) return;
      const relationshipsSection = ensureRelationshipsSection(mainCard);

      const currentParents = resolvedParentReferences(currentBusiness).map(normalizeParent).filter(Boolean);
      if (currentParents.length) {
        const partOfGroup = ensureGroup(
          relationshipsSection,
          "Part of",
          "resolved-parent-relationship-group",
          ".inferred-child-relationship-group, .geography-relationship-group"
        );
        currentParents.forEach((parent) => appendRelationship(partOfGroup, parent));
      }

      const children = businesses
        .filter((item) => item?.publish_ready === true && item?.slug && item.slug !== slug)
        .flatMap((item) => resolvedParentReferences(item)
          .map(normalizeParent)
          .filter((parent) => parent?.slug === slug)
          .map((parent) => ({
            slug: item.slug,
            name: item.business_name || item.name || item.slug,
            href: `/businesses/${item.slug}/`,
            note: parent.note
          })))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!children.length) return;

      const locatedGroup = ensureGroup(
        relationshipsSection,
        "Located here",
        "inferred-child-relationship-group",
        ".geography-relationship-group"
      );
      children.forEach((child) => appendRelationship(locatedGroup, child));
    })
    .catch(() => {});
})();
