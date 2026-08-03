(() => {
  if (window.__twgRecordDeleteLoaded) return;
  window.__twgRecordDeleteLoaded = true;

  const initialize = () => {
    const actions = document.querySelector("#record-panel .actions");
    const adminKey = document.querySelector("#admin-key");
    const queryInput = document.querySelector("#record-query");
    const recordPanel = document.querySelector("#record-panel");
    const recordTypeLabel = document.querySelector("#record-type");
    const recordTitle = document.querySelector("#record-title");
    const status = document.querySelector("#status");
    const statusDetails = document.querySelector("#status-details");

    if (!(actions instanceof HTMLElement) || !(adminKey instanceof HTMLInputElement) ||
        !(queryInput instanceof HTMLInputElement) || !(recordPanel instanceof HTMLElement) ||
        !(recordTypeLabel instanceof HTMLElement) || !(recordTitle instanceof HTMLElement) ||
        !(status instanceof HTMLElement) || !(statusDetails instanceof HTMLUListElement)) return false;

    if (document.querySelector("#delete-record")) return true;

    const deleteButton = document.createElement("button");
    deleteButton.id = "delete-record";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete Record";
    deleteButton.style.background = "#9f2f27";
    deleteButton.style.marginLeft = "auto";
    actions.appendChild(deleteButton);

    const setStatus = (message, details = [], ok = false) => {
      status.textContent = message;
      status.className = ok ? "success" : "error";
      statusDetails.replaceChildren();
      for (const detail of details) {
        const li = document.createElement("li");
        li.textContent = detail;
        statusDetails.appendChild(li);
      }
    };

    const loadedSlug = () => {
      const slugControl = document.querySelector('#fields [data-key="slug"], #fields [data-key="event_slug"]');
      if (slugControl instanceof HTMLInputElement || slugControl instanceof HTMLTextAreaElement || slugControl instanceof HTMLSelectElement) {
        return slugControl.value.trim();
      }
      return queryInput.value.trim().replace(/^.*\//, "").replace(/\/+$/, "");
    };

    deleteButton.addEventListener("click", async () => {
      if (recordPanel.hidden) return;
      if (!adminKey.value) {
        setStatus("Enter the admin key before deleting.");
        adminKey.focus();
        return;
      }

      const slug = loadedSlug();
      const recordType = recordTypeLabel.textContent.toLowerCase().includes("event") ? "event" : "business";
      const name = recordTitle.textContent.trim() || slug;
      if (!slug) {
        setStatus("The loaded record has no usable slug.");
        return;
      }

      if (!confirm(`Permanently delete ${name}?\n\nSlug: ${slug}\n\nThis removes the record from the directory and cannot be undone from this page.`)) return;
      const typed = prompt(`Type the exact slug to confirm deletion:\n\n${slug}`);
      if (typed !== slug) {
        setStatus("Deletion canceled because the confirmation slug did not match.");
        return;
      }

      deleteButton.disabled = true;
      deleteButton.textContent = "Deleting…";
      try {
        const response = await fetch("/api/update-record", {
          method: "DELETE",
          headers: { "content-type": "application/json", "x-admin-key": adminKey.value },
          body: JSON.stringify({ record_type: recordType, slug })
        });
        const result = await response.json();
        if (!response.ok) {
          setStatus(result.error || `Delete failed with status ${response.status}.`);
          return;
        }

        recordPanel.hidden = true;
        queryInput.value = "";
        setStatus(result.message || `${name} was deleted.`, [
          result.commit ? `GitHub commit: ${result.commit.slice(0, 7)}` : "GitHub commit created",
          "Wait for the Cloudflare deployment, then refresh the public directory."
        ], true);
      } catch (error) {
        setStatus(`Delete failed: ${error instanceof Error ? error.message : "unknown error"}`);
      } finally {
        deleteButton.disabled = false;
        deleteButton.textContent = "Delete Record";
      }
    });

    return true;
  };

  if (initialize()) return;
  const observer = new MutationObserver(() => {
    if (initialize()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
