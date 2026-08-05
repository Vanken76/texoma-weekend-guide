(() => {
  const originalFetch = window.fetch.bind(window);
  const galleryPaths = new Set([
    "/api/publish-business-gallery",
    "/api/business-gallery",
    "/api/publish-business/gallery"
  ]);

  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

  window.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);

    if (!galleryPaths.has(url.pathname)) {
      return originalFetch(input, init);
    }

    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    // Gallery reads do not need a Cloudflare Function. Read the published
    // business directory directly so the mobile admin page cannot be broken
    // by an API GET route falling through to the site's HTML page.
    if (method === "GET") {
      const slug = (url.searchParams.get("slug") || "").trim();
      if (!slug) return jsonResponse({ error: "A valid business slug is required." }, 400);

      try {
        const directoryResponse = await originalFetch(`/data/local-business-directory.json?gallery=${Date.now()}`, {
          cache: "no-store"
        });
        const contentType = directoryResponse.headers.get("content-type") || "";
        const bodyText = await directoryResponse.text();

        if (!directoryResponse.ok || !contentType.includes("application/json")) {
          return jsonResponse({
            error: `Directory lookup failed (${directoryResponse.status}, ${contentType || "unknown content type"}).`,
            problems: [bodyText.slice(0, 180)]
          }, 502);
        }

        const directory = JSON.parse(bodyText);
        const business = Array.isArray(directory.businesses)
          ? directory.businesses.find((record) => record?.slug === slug)
          : null;

        if (!business) return jsonResponse({ error: `No business with slug ${slug} was found.` }, 404);

        return jsonResponse({
          success: true,
          business_name: business.business_name,
          slug,
          gallery: Array.isArray(business.gallery) ? business.gallery : []
        });
      } catch (error) {
        return jsonResponse({
          error: `Directory lookup failed: ${error instanceof Error ? error.message : "Unknown error."}`
        }, 502);
      }
    }

    // Gallery writes use the existing, proven business publisher endpoint.
    url.pathname = "/api/publish-business";
    url.searchParams.set("mode", "gallery");

    const response = input instanceof Request
      ? await originalFetch(new Request(url.toString(), input), init)
      : await originalFetch(`${url.pathname}${url.search}`, init);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response;

    const bodyText = await response.text();
    return jsonResponse({
      error: `Gallery API returned ${response.status} ${contentType || "unknown content type"} instead of JSON.`,
      problems: [`Request: ${url.pathname}${url.search}`, bodyText.slice(0, 180)]
    }, response.ok ? 502 : response.status);
  };
})();
