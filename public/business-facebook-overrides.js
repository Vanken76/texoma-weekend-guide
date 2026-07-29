(() => {
  const overrides = {
    "pottsboro-area-public-library": "https://www.facebook.com/PottsboroLibrary"
  };

  const normalizePath = (value) => value.replace(/\/+$/, "");
  const currentPath = normalizePath(window.location.pathname);

  for (const [slug, facebookUrl] of Object.entries(overrides)) {
    const detailPath = `/businesses/${slug}`;

    if (currentPath === detailPath) {
      let linksBlock = document.querySelector(".links-block");

      if (!linksBlock) {
        const factsCard = document.querySelector(".facts-card");
        if (factsCard) {
          linksBlock = document.createElement("div");
          linksBlock.className = "links-block";
          linksBlock.innerHTML = "<h2>Official links</h2><ul></ul>";
          factsCard.appendChild(linksBlock);
        }
      }

      const list = linksBlock?.querySelector("ul");
      const hasFacebook = Array.from(list?.querySelectorAll("a") ?? []).some(
        (link) => link.textContent?.trim().toLowerCase() === "facebook"
      );

      if (list && !hasFacebook) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = facebookUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Facebook";
        item.appendChild(link);
        list.appendChild(item);
      }
    }

    const directoryLink = document.querySelector(`a[href="/businesses/${slug}/"]`);
    const card = directoryLink?.closest(".business-card");
    const cardLinks = card?.querySelector(".links");
    const hasCardFacebook = Array.from(cardLinks?.querySelectorAll("a") ?? []).some(
      (link) => link.textContent?.trim().toLowerCase() === "facebook"
    );

    if (cardLinks && !hasCardFacebook) {
      const link = document.createElement("a");
      link.href = facebookUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Facebook";
      cardLinks.appendChild(link);
    }
  }
})();
