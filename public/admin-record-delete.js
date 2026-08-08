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

    if (!document.querySelector("#add-record-property")) {
      const addPropertyButton = document.createElement("button");
      addPropertyButton.id = "add-record-property";
      addPropertyButton.type = "button";
      addPropertyButton.textContent = "Add Property";
      addPropertyButton.className = "secondary";
      actions.insertBefore(addPropertyButton, saveButton);

      const panel = document.createElement("section");
      panel.id = "add-property-panel";
      panel.hidden = true;
      panel.style.margin = "1rem 0";
      panel.style.padding = "1rem";
      panel.style.border = "1px solid rgba(255,255,255,.18)";
      panel.style.borderRadius = ".8rem";
      panel.style.background = "rgba(255,255,255,.04)";
      panel.innerHTML = `
        <h3 style="margin-top:0">Add property</h3>
        <p class="helper">This stays open if you switch tabs or apps, so you can copy the property name and JSON value separately.</p>
        <label for="new-property-name">Property name</label>
        <input id="new-property-name" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Example: related_geography" />
        <label for="new-property-value">Property value (valid JSON)</label>
        <textarea id="new-property-value" spellcheck="false" rows="10" placeholder='Example: [{"slug":"texas","name":"Texas"}]'></textarea>
        <div style="display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.8rem">
          <button id="apply-new-property" type="button">Add to Record</button>
          <button id="cancel-new-property" class="secondary" type="button">Cancel</button>
        </div>
      `;
      actions.parentElement?.insertBefore(panel, actions);

      const nameInput = panel.querySelector("#new-property-name");
      const valueInput = panel.querySelector("#new-property-value");
      const applyButton = panel.querySelector("#apply-new-property");
      const cancelButton = panel.querySelector("#cancel-new-property");

      const resetPanel = () => {
        if (nameInput instanceof HTMLInputElement) nameInput.value = "";
        if (valueInput instanceof HTMLTextAreaElement) valueInput.value = "";
      };

      addPropertyButton.addEventListener("click", () => {
        if (recordPanel.hidden) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden && nameInput instanceof HTMLInputElement) nameInput.focus();
      });

      nameInput?.addEventListener("input", () => {
        if (!(nameInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLTextAreaElement)) return;
        if (nameInput.value.trim() === "related_geography" && !valueInput.value.trim()) {
          valueInput.value = JSON.stringify([
            {
              slug: "",
              name: "",
              entity_type: "",
              relationship_note: ""
            }
          ], null, 2);
        }
      });

      cancelButton?.addEventListener("click", () => {
        resetPanel();
        panel.hidden = true;
      });

      applyButton?.addEventListener("click", () => {
        if (!(nameInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLTextAreaElement)) return;
        const key = nameInput.value.trim();
        if (!key) {
          setStatus("Enter a property name.");
          nameInput.focus();
          return;
        }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          setStatus("Property name must use letters, numbers, and underscores and cannot start with a number.");
          return;
        }
        if (fieldsWrap.querySelector(`[data-key="${CSS.escape(key)}"]`)) {
          setStatus(`${key} already exists on this record. Edit the existing field instead.`);
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(valueInput.value || "null");
        } catch {
          setStatus("The new property value must be valid JSON.");
          valueInput.focus();
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
        resetPanel();
        panel.hidden = true;
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
