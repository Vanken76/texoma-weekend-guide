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
    const fieldsWrap = document.querySelector("#fields");
    const saveButton = document.querySelector("#save-record");

    if (!(actions instanceof HTMLElement) || !(adminKey instanceof HTMLInputElement) ||
        !(queryInput instanceof HTMLInputElement) || !(recordPanel instanceof HTMLElement) ||
        !(recordTypeLabel instanceof HTMLElement) || !(recordTitle instanceof HTMLElement) ||
        !(status instanceof HTMLElement) || !(statusDetails instanceof HTMLUListElement) ||
        !(fieldsWrap instanceof HTMLElement) || !(saveButton instanceof HTMLButtonElement)) return false;

    if (!document.querySelector("#add-record-property")) {
      const addPropertyButton = document.createElement("button");
      addPropertyButton.id = "add-record-property";
      addPropertyButton.type = "button";
      addPropertyButton.textContent = "Add Property";
      addPropertyButton.className = "secondary";
      actions.insertBefore(addPropertyButton, saveButton);

      addPropertyButton.addEventListener("click", () => {
        if (recordPanel.hidden) return;
        const key = prompt("Property name to add (example: related_geography):")?.trim() || "";
        if (!key) return;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          setStatus("Property name must use letters, numbers, and underscores and cannot start with a number.");
          return;
        }
        if (fieldsWrap.querySelector(`[data-key="${CSS.escape(key)}"]`)) {
          setStatus(`${key} already exists on this record. Edit the existing field instead.`);
          return;
        }

        const defaultValue = key === "related_geography"
          ? '[\n  {\n    "slug": "",\n    "name": "",\n    "entity_type": "",\n    "relationship_note": ""\n  }\n]'
          : "[]";
        const raw = prompt("Enter the initial value as valid JSON:", defaultValue);
        if (raw === null) return;

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          setStatus("The new property value must be valid JSON.");
          return;
        }

        const group = document.createElement("div");
        group.className = "field-group";
        const label = document.createElement("label");
        label.textContent = key;
        label.htmlFor = `field-${key}`;
        const textarea = document.createElement("textarea");
        textarea.id = `field-${key}`;
        textarea.dataset.key = key;
        textarea.dataset.complex = "true";
        textarea.spellcheck = false;
        textarea.value = JSON.stringify(parsed, null, 2);
        textarea.addEventListener("input", () => { saveButton.disabled = false; });
        textarea.addEventListener("change", () => { saveButton.disabled = false; });
        group.append(label, textarea);
        fieldsWrap.appendChild(group);
        saveButton.disabled = false;
        setStatus(`${key} added to the loaded record. Review the new field, then click Validate & Save.`, [], true);
        group.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    if (document.querySelector("#delete-record")) return true;

    const deleteButton = document.createElement("button");
    deleteButton.id = "delete-record";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete Record";
    deleteButton.style.background = "#9f2f27";
    deleteButton.style.color = "white";
    deleteButton.style.marginLeft = "auto";
    deleteButton.style.border = "0";
    deleteButton.style.borderRadius = ".65rem";
    deleteButton.style.padding = ".72rem 1rem";
    deleteButton.style.fontWeight = "800";
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

    const readJsonResponse = async (response) => {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Server returned ${response.status} ${response.statusText || ""} instead of JSON.`.trim());
      }
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
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-key": adminKey.value },
          body: JSON.stringify({ action: "delete", record_type: recordType, slug })
        });
        const result = await readJsonResponse(response);
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
