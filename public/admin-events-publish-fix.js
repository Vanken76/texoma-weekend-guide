document.addEventListener("DOMContentLoaded", () => {
  const publishButton = document.querySelector("#publish-events");
  const saveButton = document.querySelector("#save-event");
  const flyerInput = document.querySelector("#event-flyer");
  const statusText = document.querySelector("#event-status");

  if (!publishButton || !saveButton || !flyerInput) return;

  publishButton.addEventListener("click", (event) => {
    const hasSelectedFlyer = flyerInput.files && flyerInput.files.length > 0;
    if (!hasSelectedFlyer) return;

    saveButton.click();

    if (statusText?.classList.contains("error")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
});
