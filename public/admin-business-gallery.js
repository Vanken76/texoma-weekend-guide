(() => {
  const businessInput = document.querySelector("#business-json");
  const adminKey = document.querySelector("#admin-key");
  const toolPanel = document.querySelector(".tool-panel");
  if (!(businessInput instanceof HTMLTextAreaElement) || !(adminKey instanceof HTMLInputElement) || !(toolPanel instanceof HTMLElement)) return;

  const galleryPanel = document.createElement("section");
  galleryPanel.className = "gallery-admin-panel";
  galleryPanel.innerHTML = `
    <h2>Business photo gallery</h2>
    <p class="gallery-helper">Publish the business first, then upload up to 12 JPG, PNG, or WebP photos. Each file must be 4 MB or smaller.</p>
    <label for="business-gallery">Gallery photos</label>
    <input id="business-gallery" type="file" accept="image/jpeg,image/png,image/webp" multiple />
    <label for="gallery-captions">Captions <span class="optional">optional</span></label>
    <textarea id="gallery-captions" class="gallery-captions" placeholder="One caption per photo, in the same order as the selected files"></textarea>
    <label class="replace-gallery-label"><input id="replace-gallery" type="checkbox" /> Replace the existing gallery instead of adding to it</label>
    <div id="gallery-preview" class="gallery-preview"></div>
    <button id="upload-gallery" type="button" disabled>Upload Gallery Photos</button>
    <p id="gallery-status" class="gallery-status" aria-live="polite"></p>
  `;
  toolPanel.appendChild(galleryPanel);

  const fileInput = galleryPanel.querySelector("#business-gallery");
  const captionsInput = galleryPanel.querySelector("#gallery-captions");
  const replaceInput = galleryPanel.querySelector("#replace-gallery");
  const preview = galleryPanel.querySelector("#gallery-preview");
  const uploadButton = galleryPanel.querySelector("#upload-gallery");
  const galleryStatus = galleryPanel.querySelector("#gallery-status");

  if (!(fileInput instanceof HTMLInputElement) || !(captionsInput instanceof HTMLTextAreaElement) || !(replaceInput instanceof HTMLInputElement) || !(preview instanceof HTMLElement) || !(uploadButton instanceof HTMLButtonElement) || !(galleryStatus instanceof HTMLElement)) return;

  const MAX_BYTES = 4 * 1024 * 1024;
  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
  let selectedFiles = [];
  let objectUrls = [];

  const setStatus = (message, isError = false) => {
    galleryStatus.textContent = message;
    galleryStatus.className = isError ? "gallery-status error" : "gallery-status success";
  };

  const parseBusiness = () => {
    try {
      const business = JSON.parse(businessInput.value);
      if (!business?.slug || !business?.business_name) return null;
      return business;
    } catch {
      return null;
    }
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error(`Could not encode ${file.name}.`));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const clearPreviews = () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    preview.replaceChildren();
  };

  const refreshButton = () => {
    uploadButton.disabled = selectedFiles.length === 0 || !parseBusiness();
  };

  fileInput.addEventListener("change", () => {
    clearPreviews();
    selectedFiles = Array.from(fileInput.files || []);
    const problems = [];
    if (selectedFiles.length > 12) problems.push("Select no more than 12 photos at once.");
    selectedFiles.forEach((file) => {
      if (!ALLOWED.has(file.type)) problems.push(`${file.name} is not a JPG, PNG, or WebP image.`);
      if (file.size > MAX_BYTES) problems.push(`${file.name} is larger than 4 MB.`);
    });
    if (problems.length) {
      selectedFiles = [];
      fileInput.value = "";
      setStatus(problems.join(" "), true);
      refreshButton();
      return;
    }

    selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const figure = document.createElement("figure");
      figure.innerHTML = `<img src="${url}" alt="Selected gallery photo ${index + 1}"><figcaption>${file.name}</figcaption>`;
      preview.appendChild(figure);
    });
    setStatus(selectedFiles.length ? `${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} selected.` : "");
    refreshButton();
  });

  businessInput.addEventListener("input", refreshButton);

  uploadButton.addEventListener("click", async () => {
    const business = parseBusiness();
    if (!business) {
      setStatus("Paste valid business JSON with a slug and business_name first.", true);
      return;
    }
    if (!adminKey.value) {
      setStatus("Enter the admin key first.", true);
      adminKey.focus();
      return;
    }
    if (!selectedFiles.length) return;

    const captions = captionsInput.value.split("\n").map((value) => value.trim());
    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading gallery…";
    setStatus("Encoding and uploading photos…");

    try {
      const images = [];
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        images.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: await fileToBase64(file),
          caption: captions[index] || null,
          alt: captions[index] || `${business.business_name} gallery photo ${index + 1}`
        });
      }

      const response = await fetch("/api/publish-business-gallery", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": adminKey.value },
        body: JSON.stringify({
          slug: business.slug,
          images,
          replace_gallery: replaceInput.checked
        })
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.problems) ? ` ${result.problems.join(" ")}` : "";
        throw new Error(`${result.error || "Gallery upload failed."}${details}`);
      }

      business.gallery = replaceInput.checked
        ? result.uploaded
        : [...(Array.isArray(business.gallery) ? business.gallery : []), ...result.uploaded];
      businessInput.value = JSON.stringify(business, null, 2);
      setStatus(`${result.message} ${result.gallery_count} total photo${result.gallery_count === 1 ? "" : "s"} now in the gallery.`);
      selectedFiles = [];
      fileInput.value = "";
      captionsInput.value = "";
      replaceInput.checked = false;
      clearPreviews();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gallery upload failed.", true);
    } finally {
      uploadButton.textContent = "Upload Gallery Photos";
      refreshButton();
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .gallery-admin-panel{margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.16)}
    .gallery-admin-panel h2{margin:0 0:.5rem}
    .gallery-helper{opacity:.8}
    .gallery-captions{min-height:110px!important}
    .replace-gallery-label{display:flex!important;gap:.6rem;align-items:center;font-weight:700!important}
    .replace-gallery-label input{width:auto!important}
    .gallery-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin:1rem 0}
    .gallery-preview figure{margin:0;padding:.5rem;border:1px solid rgba(255,255,255,.16);border-radius:.65rem}
    .gallery-preview img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:.45rem;background:#fff}
    .gallery-preview figcaption{margin-top:.35rem;font-size:.75rem;overflow-wrap:anywhere}
    .gallery-status{font-weight:800}
    .gallery-status.error{color:#ffb3b3}
    .gallery-status.success{color:inherit}
  `;
  document.head.appendChild(style);
})();
