(() => {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    const galleryPaths = new Set([
      "/api/publish-business-gallery",
      "/api/business-gallery",
      "/api/publish-business/gallery"
    ]);

    if (!galleryPaths.has(url.pathname)) {
      return originalFetch(input, init);
    }

    url.pathname = "/api/publish-business";
    url.searchParams.set("mode", "gallery");

    if (input instanceof Request) {
      return originalFetch(new Request(url.toString(), input), init);
    }

    return originalFetch(`${url.pathname}${url.search}`, init);
  };
})();
