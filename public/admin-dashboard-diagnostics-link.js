(() => {
  const nav = document.querySelector('.admin-links');
  if (!(nav instanceof HTMLElement)) return;
  if (nav.querySelector('a[href="/admin-diagnostics/"]')) return;
  const link = document.createElement('a');
  link.href = '/admin-diagnostics/';
  link.textContent = 'Diagnostics';
  nav.appendChild(link);
})();
