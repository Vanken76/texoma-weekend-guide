(() => {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();

    if (url === "/api/publish-business" && method === "POST" && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body);
        const submitted = payload?.business;

        if (submitted?.slug) {
          const directoryResponse = await originalFetch("/data/local-business-directory.json", { cache: "no-store" });
          if (directoryResponse.ok) {
            const directory = await directoryResponse.json();
            const existing = Array.isArray(directory?.businesses)
              ? directory.businesses.find((record) => record?.slug === submitted.slug)
              : null;

            if (existing) {
              const preserveWhenMissing = [
                "gallery",
                "logo_url",
                "logo_alt",
                "image",
                "image_url",
                "image_alt"
              ];

              for (const field of preserveWhenMissing) {
                if (!(field in submitted) && field in existing) submitted[field] = existing[field];
              }

              init = { ...init, body: JSON.stringify(payload) };
            }
          }
        }
      } catch (error) {
        console.warn("Could not preserve existing business media fields.", error);
      }
    }

    return originalFetch(input, init);
  };
})();
