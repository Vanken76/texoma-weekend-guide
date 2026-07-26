document.addEventListener("DOMContentLoaded", () => {
  const publishButton = document.querySelector("#publish-events");
  const saveButton = document.querySelector("#save-event");
  const loadButton = document.querySelector("#load-data");
  const flyerInput = document.querySelector("#event-flyer");
  const statusText = document.querySelector("#event-status");
  const statusList = document.querySelector("#event-checks");
  const eventPicker = document.querySelector("#event-picker");
  const statusSelect = document.querySelector("#status");
  const checksRow = document.querySelector(".checks-row");
  const editorGrid = document.querySelector(".grid");

  if (!publishButton || !saveButton || !flyerInput || !eventPicker || !statusSelect || !checksRow || !editorGrid) return;

  let allowPublish = false;
  let eventDirectory = null;

  const localDate = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const recurringLabel = document.createElement("label");
  recurringLabel.className = "twg-recurring-check";
  recurringLabel.innerHTML = '<input id="recurring" type="checkbox" /> Recurring event';

  const activeLabel = document.createElement("label");
  activeLabel.className = "twg-active-check";
  activeLabel.innerHTML = '<input id="active" type="checkbox" checked /> Active';

  checksRow.prepend(activeLabel);
  checksRow.prepend(recurringLabel);

  const recurrenceLabel = document.createElement("label");
  recurrenceLabel.id = "recurrence-rule-wrap";
  recurrenceLabel.hidden = true;
  recurrenceLabel.innerHTML = 'Recurrence pattern<input id="recurrence-rule" type="text" placeholder="Every Wednesday, first Friday monthly, weekly through September…" />';

  const verifiedLabel = document.createElement("label");
  verifiedLabel.innerHTML = 'Last verified<input id="last-verified" type="date" />';

  editorGrid.append(recurrenceLabel, verifiedLabel);

  const recurringInput = document.querySelector("#recurring");
  const activeInput = document.querySelector("#active");
  const recurrenceInput = document.querySelector("#recurrence-rule");
  const lastVerifiedInput = document.querySelector("#last-verified");

  lastVerifiedInput.value = localDate();

  const setRecurringVisibility = () => {
    recurrenceLabel.hidden = !recurringInput.checked;
    recurrenceInput.required = recurringInput.checked;
    if (recurringInput.checked) {
      statusSelect.value = "recurring";
    } else if (statusSelect.value === "recurring") {
      statusSelect.value = "upcoming";
    }
  };

  recurringInput.addEventListener("change", setRecurringVisibility);
  statusSelect.addEventListener("change", () => {
    if (statusSelect.value === "recurring") recurringInput.checked = true;
    setRecurringVisibility();
  });

  const refreshDirectoryCache = async () => {
    try {
      const response = await fetch("/data/local-event-directory.json", { cache: "no-store" });
      if (response.ok) eventDirectory = await response.json();
    } catch {
      eventDirectory = null;
    }
  };

  loadButton?.addEventListener("click", () => {
    window.setTimeout(refreshDirectoryCache, 0);
  });

  eventPicker.addEventListener("change", async () => {
    if (!eventDirectory) await refreshDirectoryCache();
    const event = eventDirectory?.events?.find((item) => item.event_slug === eventPicker.value);

    if (!event) {
      recurringInput.checked = false;
      activeInput.checked = true;
      recurrenceInput.value = "";
      lastVerifiedInput.value = localDate();
      setRecurringVisibility();
      return;
    }

    recurringInput.checked = event.recurring === true || event.status === "recurring";
    activeInput.checked = event.active !== false;
    recurrenceInput.value = event.recurrence_rule || "";
    lastVerifiedInput.value = event.last_checked || localDate();
    setRecurringVisibility();
  });

  saveButton.addEventListener("click", (event) => {
    setRecurringVisibility();

    if (recurringInput.checked && !recurrenceInput.value.trim()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (statusText) {
        statusText.textContent = "Event validation found problems.";
        statusText.className = "error";
      }
      if (statusList) {
        const item = document.createElement("li");
        item.textContent = "Enter a recurrence pattern for recurring events.";
        statusList.replaceChildren(item);
      }
    }
  }, true);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";

    if (url.includes("/api/publish-events") && init?.body instanceof FormData) {
      const rawDirectory = init.body.get("directory");
      if (typeof rawDirectory === "string") {
        try {
          const directory = JSON.parse(rawDirectory);
          const slug = document.querySelector("#event-slug")?.value?.trim();
          const event = directory.events?.find((item) => item.event_slug === slug);

          if (event) {
            event.recurring = recurringInput.checked;
            event.recurrence_rule = recurringInput.checked ? recurrenceInput.value.trim() : null;
            event.active = activeInput.checked;
            event.last_checked = lastVerifiedInput.value || localDate();
            if (event.recurring) event.status = "recurring";
            else if (event.status === "recurring") event.status = "upcoming";
            init.body.set("directory", JSON.stringify(directory));
          }
        } catch {
          // Let the existing publisher report malformed directory data.
        }
      }
    }

    return originalFetch(input, init);
  };

  publishButton.addEventListener("click", (event) => {
    if (allowPublish) {
      allowPublish = false;
      return;
    }

    const hasSelectedFlyer = flyerInput.files && flyerInput.files.length > 0;
    if (!hasSelectedFlyer) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    saveButton.click();

    window.setTimeout(() => {
      if (statusText?.classList.contains("error")) return;
      allowPublish = true;
      publishButton.click();
    }, 0);
  }, true);
});
