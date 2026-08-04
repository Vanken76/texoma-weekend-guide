(() => {
  const grid = document.querySelector('#event-grid');
  const filters = document.querySelector('.event-filters');
  if (!(grid instanceof HTMLElement) || !(filters instanceof HTMLElement)) return;

  const storageKey = 'twg-event-view-mode';
  const mobileDefault = window.matchMedia('(max-width: 600px)').matches ? 'compact' : 'cards';
  let savedMode = null;
  try {
    savedMode = window.localStorage.getItem(storageKey);
  } catch {
    savedMode = null;
  }
  let mode = savedMode === 'cards' || savedMode === 'compact' ? savedMode : mobileDefault;

  const row = document.createElement('div');
  row.className = 'view-mode-row';
  row.innerHTML = `
    <p class="view-mode-label">Choose how events are displayed.</p>
    <div class="view-mode-toggle" role="group" aria-label="Event display mode">
      <button type="button" data-view-mode="cards">Card view</button>
      <button type="button" data-view-mode="compact">Compact view</button>
    </div>
  `;
  filters.insertAdjacentElement('afterend', row);

  const buttons = [...row.querySelectorAll('[data-view-mode]')];
  const applyMode = (nextMode, remember = true) => {
    mode = nextMode === 'compact' ? 'compact' : 'cards';
    grid.classList.toggle('compact-view', mode === 'compact');
    grid.dataset.viewMode = mode;
    buttons.forEach((button) => {
      const active = button.getAttribute('data-view-mode') === mode;
      button.setAttribute('aria-pressed', String(active));
    });
    if (remember) {
      try {
        window.localStorage.setItem(storageKey, mode);
      } catch {
        // Browsing still works when storage is blocked.
      }
    }
  };

  buttons.forEach((button) => button.addEventListener('click', () => {
    applyMode(button.getAttribute('data-view-mode'));
  }));

  applyMode(mode, false);
})();
