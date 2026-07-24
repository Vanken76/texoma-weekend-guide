document.addEventListener("DOMContentLoaded", () => {
  const publishButton = document.querySelector("#publish-events");
  const saveButton = document.querySelector("#save-event");
  const flyerInput = document.querySelector("#event-flyer");
  const statusText = document.querySelector("#event-status");

  if (!publishButton || !saveButton || !flyerInput) return;

  let allowPublish = false;

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
