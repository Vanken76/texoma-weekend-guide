(() => {
  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get("filter")?.trim().toLowerCase();

  if (!requestedFilter) return;

  const quickButtons = [...document.querySelectorAll("[data-quick]")];
  const matchingButton = quickButtons.find(
    (button) => button.dataset.quick?.trim().toLowerCase() === requestedFilter
  );

  if (matchingButton) {
    matchingButton.click();
  } else {
    const searchInput = document.querySelector("#event-search");
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = requestedFilter;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  document.querySelector(".event-filters")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
})();