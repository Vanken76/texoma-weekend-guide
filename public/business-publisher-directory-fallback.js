(() => {
  const publishButton = document.querySelector("#publish");
  const validateButton = document.querySelector("#validate");
  const businessInput = document.querySelector("#business-json");
  const adminKey = document.querySelector("#admin-key");
  const logoInput = document.querySelector("#business-logo");
  const removeSlugsInput = document.querySelector("#remove-slugs");
  const status = document.querySelector("#status");
  const checks = document.querySelector("#checks");

  if (!(publishButton instanceof HTMLButtonElement) ||
      !(businessInput instanceof HTMLTextAreaElement) ||
      !(adminKey instanceof HTMLInputElement) ||
      !(logoInput instanceof HTMLInputElement) ||
      !(removeSlugsInput instanceof HTMLInputElement) ||
      !(status instanceof HTMLElement) ||
      !(checks instanceof HTMLUListElement)) return;

  const setResult = (message, items = [], valid = false) => {
    status.textContent = message;
    status.className = valid ? "success" : "error";
    checks.replaceChildren(...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }));
  };

  const readJsonResponse = async (response) => {
    const raw = await response.text();
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    throw new Error(`Publisher endpoint returned ${response.status} ${response.statusText || ""} instead of JSON.`.trim());
  };

  publishButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!adminKey.value) {
      setResult("Enter the admin key before publishing.", [], false);
      adminKey.focus();
      return;
    }

    if (logoInput.files?.length) {
      setResult("Logo upload is temporarily unavailable through this publisher. Remove the selected logo and publish the business first; the logo can be added separately afterward.", [], false);
      return;
    }

    let business;
    try {
      business = JSON.parse(businessInput.value);
    } catch (error) {
      setResult(`Invalid JSON: ${error instanceof Error ? error.message : "Unknown parsing error."}`, [], false);
      return;
    }

    if (!business?.business_name || !business?.slug || business.publish_ready !== true) {
      validateButton?.click();
      return;
    }

    publishButton.disabled = true;
    publishButton.textContent = "Publishing…";

    try {
      const directoryResponse = await fetch("/data/local-business-directory.json", { cache: "no-store" });
      if (!directoryResponse.ok) throw new Error(`Could not load the current directory (${directoryResponse.status}).`);
      const directory = await directoryResponse.json();
      if (!Array.isArray(directory.businesses)) throw new Error("The current directory does not contain a businesses array.");

      const removeSlugs = new Set(
        removeSlugsInput.value.split(",").map((slug) => slug.trim()).filter((slug) => slug && slug !== business.slug)
      );
      const existingIndex = directory.businesses.findIndex((record) => record?.slug === business.slug);
      const action = existingIndex >= 0 ? "updated" : "added";
      if (existingIndex >= 0) directory.businesses[existingIndex] = business;
      else directory.businesses.push(business);

      const beforeRemoval = directory.businesses.length;
      directory.businesses = directory.businesses.filter((record) => !removeSlugs.has(record?.slug));
      const removedCount = beforeRemoval - directory.businesses.length;
      directory.business_count = directory.businesses.length;
      directory.publish_ready_count = directory.businesses.filter((record) => record?.publish_ready === true).length;
      directory.generated_on = new Date().toISOString().slice(0, 10);

      const response = await fetch("/api/publish-directory", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": adminKey.value },
        body: JSON.stringify(directory)
      });
      const result = await readJsonResponse(response);
      if (!response.ok) {
        setResult(result.error || `Publishing failed with status ${response.status}.`, Array.isArray(result.problems) ? result.problems : [], false);
        return;
      }

      setResult(`${business.business_name} was ${action} in the directory.`, [
        `${directory.business_count} total businesses now stored`,
        `${directory.publish_ready_count} publish-ready businesses now stored`,
        removedCount ? `${removedCount} old duplicate record(s) removed` : "No old duplicate records removed",
        result.commit ? `GitHub commit: ${result.commit.slice(0, 7)}` : "GitHub commit created"
      ], true);
    } catch (error) {
      setResult(`Publishing failed: ${error instanceof Error ? error.message : "Unknown publishing error."}`, [], false);
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = "Publish Business";
    }
  }, true);
})();
