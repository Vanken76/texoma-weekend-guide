(() => {
  const grid = document.querySelector('#business-grid');
  if (!grid || document.querySelector('[data-name="among the pages"]')) return;

  const article = document.createElement('article');
  article.className = 'business-card';
  article.dataset.name = 'among the pages';
  article.dataset.location = '400 w. main st., durant, ok 74701';
  article.dataset.categories = 'bookstore|independent bookstore|shopping|local business';
  article.dataset.search = 'among the pages 400 w. main st. durant ok 74701 bookstore independent bookstore shopping local business romance fiction book club craft classes author events downtown durant texoma';

  article.innerHTML = `
    <h2><a href="/businesses/among-the-pages/">Among the Pages</a></h2>
    <p class="location">400 W. Main St., Durant, OK 74701</p>
    <p>Independent bookstore specializing in romance and fiction, with books, special orders, book clubs, craft classes, author events, and community gatherings. Permanent storefront opening August 15, 2026.</p>
    <p class="categories">Bookstore · Independent Bookstore · Shopping · Local Business</p>
    <div class="business-hours">
      <h3>Hours</h3>
      <dl><dt>Saturday</dt><dd>10:00 AM–4:00 PM</dd></dl>
    </div>
    <p class="notice">Temporarily closed while preparing for the permanent storefront opening.</p>
    <div class="links">
      <a href="/businesses/among-the-pages/">View business details</a>
      <a href="https://bookshop.org/shop/amongthepagesbooks" target="_blank" rel="noopener noreferrer">Website</a>
      <a href="https://www.facebook.com/profile.php?id=61578239519543" target="_blank" rel="noopener noreferrer">Facebook</a>
    </div>`;

  grid.prepend(article);

  const count = document.querySelector('#result-count');
  const headerText = document.querySelector('.directory-header p:last-child');
  const currentCount = grid.querySelectorAll('.business-card').length;
  if (count) count.textContent = `Showing ${currentCount} businesses`;
  if (headerText) headerText.textContent = `Search and filter ${currentCount} completed local business listings.`;
})();
