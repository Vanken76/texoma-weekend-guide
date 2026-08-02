(() => {
  const match = window.location.pathname.match(/^\/businesses\/([^/]+)\/?$/);
  if (!match) return;
  const slug = decodeURIComponent(match[1]);

  const normalizeGallery = (gallery, businessName) => {
    if (!Array.isArray(gallery)) return [];
    return gallery.map((item, index) => {
      if (typeof item === "string") {
        return { url: item, alt: `${businessName} gallery photo ${index + 1}`, caption: null };
      }
      if (!item || typeof item !== "object") return null;
      const url = item.url || item.image_url || item.src;
      if (!url) return null;
      return {
        url,
        alt: item.alt || item.image_alt || `${businessName} gallery photo ${index + 1}`,
        caption: item.caption || item.title || null
      };
    }).filter(Boolean);
  };

  fetch("/data/local-business-directory.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Directory unavailable");
      return response.json();
    })
    .then((directory) => {
      const business = directory.businesses?.find((record) => record?.slug === slug);
      if (!business) return;
      const gallery = normalizeGallery(business.gallery || business.photos || business.images, business.business_name);
      if (!gallery.length) return;

      const mainCard = document.querySelector(".main-card");
      if (!(mainCard instanceof HTMLElement)) return;
      const existing = document.querySelector("#business-photo-gallery");
      if (existing) existing.remove();

      const section = document.createElement("section");
      section.id = "business-photo-gallery";
      section.className = "business-photo-gallery";
      const heading = document.createElement("h2");
      heading.textContent = `Photos of ${business.business_name}`;
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "business-gallery-grid";
      gallery.forEach((photo) => {
        const figure = document.createElement("figure");
        const link = document.createElement("a");
        link.href = photo.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const image = document.createElement("img");
        image.src = photo.url;
        image.alt = photo.alt;
        image.loading = "lazy";
        image.addEventListener("error", () => figure.remove());
        link.appendChild(image);
        figure.appendChild(link);
        if (photo.caption) {
          const caption = document.createElement("figcaption");
          caption.textContent = photo.caption;
          figure.appendChild(caption);
        }
        grid.appendChild(figure);
      });
      section.appendChild(grid);

      const shareBlock = mainCard.querySelector(".share-block");
      if (shareBlock) mainCard.insertBefore(section, shareBlock);
      else mainCard.appendChild(section);

      const style = document.createElement("style");
      style.textContent = `
        .business-photo-gallery{margin-top:2rem;padding-top:1.5rem;border-top:1px solid #d7e0e4}
        .business-photo-gallery h2{margin-top:0}
        .business-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem}
        .business-gallery-grid figure{margin:0;overflow:hidden;border:1px solid #d7e0e4;border-radius:.85rem;background:#f5f8f9}
        .business-gallery-grid a{display:block}
        .business-gallery-grid img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .2s ease}
        .business-gallery-grid a:hover img{transform:scale(1.02)}
        .business-gallery-grid figcaption{padding:.7rem .8rem;color:#526470;font-size:.92rem;line-height:1.4}
        @media(max-width:640px){.business-gallery-grid{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    })
    .catch(() => {});
})();
