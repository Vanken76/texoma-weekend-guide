(() => {
  const grid = document.querySelector('#event-grid');
  const filters = document.querySelector('.event-filters');
  const dateFilter = document.querySelector('#date-filter');
  if (!(grid instanceof HTMLElement) || !(filters instanceof HTMLElement) || !(dateFilter instanceof HTMLSelectElement)) return;

  const cards = [...grid.querySelectorAll('[data-event-card]')];
  if (!cards.length) return;

  const PAGE_SIZE = 20;
  const originalOrder = [...cards];
  const originalIndex = new Map(originalOrder.map((card, index) => [card, index]));
  const originalLabels = new Map();
  cards.forEach((card) => {
    const label = card.querySelector('.event-date strong');
    if (label) originalLabels.set(card, label.textContent || '');
  });

  const searchInput = document.querySelector('#event-search');
  const cityFilter = document.querySelector('#city-filter');
  const stateFilter = document.querySelector('#state-filter');
  const categoryFilter = document.querySelector('#category-filter');
  const resultCount = document.querySelector('#result-count');
  const noResults = document.querySelector('#no-results');
  const pagination = document.querySelector('#pagination');
  const previousPage = document.querySelector('#previous-page');
  const nextPage = document.querySelector('#next-page');

  const chicagoDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

  const addDays = (dateString, days) => {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return chicagoDate(date);
  };

  const normalizeState = (value = '') => {
    const state = String(value ?? '').trim().toLowerCase();
    if (state === 'texas') return 'tx';
    if (state === 'oklahoma') return 'ok';
    return state;
  };

  const normalizeRule = (rule = '') => String(rule ?? '').trim().replace(/^RRULE:/i, '');
  const parseRule = (rule = '') => Object.fromEntries(
    normalizeRule(rule).split(';').map((part) => part.split('=')).filter(([key, value]) => key && value)
  );
  const dayCode = (dateString) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${dateString}T12:00:00`).getDay()];

  const occursOn = (eventDate, targetDate, recurrenceRule, recurrenceEnd) => {
    if (!eventDate || targetDate < eventDate || (recurrenceEnd && targetDate > recurrenceEnd)) return false;

    const normalized = normalizeRule(recurrenceRule);
    if (normalized.startsWith('RDATE:')) {
      return normalized
        .slice(6)
        .split(',')
        .map((entry) => entry.slice(0, 8))
        .map((entry) => `${entry.slice(0, 4)}-${entry.slice(4, 6)}-${entry.slice(6, 8)}`)
        .includes(targetDate);
    }

    const rule = parseRule(recurrenceRule);
    const frequency = rule.FREQ;
    if (!frequency) return targetDate === eventDate;

    const interval = Math.max(1, Number.parseInt(rule.INTERVAL ?? '1', 10) || 1);
    const start = new Date(`${eventDate}T12:00:00`);
    const target = new Date(`${targetDate}T12:00:00`);
    const daysApart = Math.round((target.getTime() - start.getTime()) / 86400000);

    if (frequency === 'DAILY') return daysApart % interval === 0;

    if (frequency === 'WEEKLY') {
      const allowedDays = (rule.BYDAY ?? dayCode(eventDate)).split(',');
      return allowedDays.includes(dayCode(targetDate)) && Math.floor(daysApart / 7) % interval === 0;
    }

    if (frequency === 'MONTHLY') {
      const monthsApart = (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
      if (monthsApart < 0 || monthsApart % interval !== 0) return false;

      if (rule.BYMONTHDAY) {
        return rule.BYMONTHDAY.split(',').map(Number).includes(target.getDate());
      }

      if (rule.BYDAY) {
        return rule.BYDAY.split(',').some((value) => {
          const match = value.match(/^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
          if (!match || dayCode(targetDate) !== match[2]) return false;
          if (!match[1]) return true;

          const ordinal = Number(match[1]);
          if (ordinal > 0) {
            const occurrence = Math.floor((target.getDate() - 1) / 7) + 1;
            return occurrence === ordinal;
          }

          const nextWeek = new Date(target);
          nextWeek.setDate(target.getDate() + 7);
          return nextWeek.getMonth() !== target.getMonth();
        });
      }

      return target.getDate() === start.getDate();
    }

    if (frequency === 'YEARLY') {
      const yearsApart = target.getFullYear() - start.getFullYear();
      return yearsApart >= 0 && yearsApart % interval === 0 && target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
    }

    return targetDate === eventDate;
  };

  const weekendRange = () => {
    const current = chicagoDate();
    const day = new Date(`${current}T12:00:00`).getDay();
    const thursdayOffset = day === 0 ? -3 : day === 6 ? -2 : day === 5 ? -1 : 4 - day;
    const thursday = addDays(current, thursdayOffset);
    const sunday = addDays(thursday, 3);
    const start = current > thursday ? current : thursday;
    return { start, end: sunday };
  };

  const firstOccurrenceInRange = (card, rangeStart, rangeEnd) => {
    const eventDate = card.dataset.date ?? '';
    if (!eventDate) return null;

    if (card.dataset.recurring !== 'true') {
      return eventDate >= rangeStart && eventDate <= rangeEnd ? eventDate : null;
    }

    for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
      if (occursOn(
        eventDate,
        date,
        card.dataset.recurrenceRule ?? '',
        card.dataset.recurrenceEnd ?? ''
      )) return date;
    }

    return null;
  };

  const formatDate = (dateString) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${dateString}T12:00:00`));

  const matchesOtherFilters = (card) => {
    const query = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    const selectedCity = cityFilter instanceof HTMLSelectElement ? cityFilter.value : 'all';
    const selectedState = stateFilter instanceof HTMLSelectElement ? stateFilter.value : 'all';
    const selectedCategory = categoryFilter instanceof HTMLSelectElement ? categoryFilter.value : 'all';
    const activeQuick = document.querySelector('[data-quick].active');
    const quickFilter = activeQuick instanceof HTMLElement ? activeQuick.dataset.quick ?? 'all' : 'all';
    const search = card.dataset.search ?? '';
    const categories = card.dataset.categories ?? '';

    return (!query || search.includes(query))
      && (selectedCity === 'all' || card.dataset.city === selectedCity)
      && (selectedState === 'all' || normalizeState(card.dataset.state ?? '') === selectedState)
      && (selectedCategory === 'all' || categories.split('|').includes(selectedCategory))
      && (quickFilter === 'all'
        || (quickFilter === 'free' && card.dataset.cost === 'free')
        || categories.includes(quickFilter)
        || search.includes(quickFilter));
  };

  const restoreDefaultView = () => {
    originalOrder.forEach((card) => grid.appendChild(card));
    cards.forEach((card) => {
      const label = card.querySelector('.event-date strong');
      if (label && originalLabels.has(card)) label.textContent = originalLabels.get(card);
    });
  };

  const applyWeekendFix = () => {
    if (dateFilter.value !== 'weekend') {
      restoreDefaultView();
      return;
    }

    const { start: rangeStart, end: rangeEnd } = weekendRange();
    const matches = cards
      .map((card) => ({ card, occurrenceDate: firstOccurrenceInRange(card, rangeStart, rangeEnd) }))
      .filter(({ card, occurrenceDate }) => Boolean(occurrenceDate) && matchesOtherFilters(card))
      .sort((a, b) => {
        const dateComparison = a.occurrenceDate.localeCompare(b.occurrenceDate);
        if (dateComparison !== 0) return dateComparison;
        return (originalIndex.get(a.card) ?? 0) - (originalIndex.get(b.card) ?? 0);
      });

    const matchCards = matches.map(({ card }) => card);
    const matchSet = new Set(matchCards);
    matchCards.forEach((card) => grid.appendChild(card));
    originalOrder.filter((card) => !matchSet.has(card)).forEach((card) => grid.appendChild(card));

    matches.forEach(({ card, occurrenceDate }) => {
      if (card.dataset.recurring !== 'true') return;
      const label = card.querySelector('.event-date strong');
      if (label) label.textContent = `Recurring · ${formatDate(occurrenceDate)}`;
    });

    originalOrder.filter((card) => !matchSet.has(card)).forEach((card) => {
      const label = card.querySelector('.event-date strong');
      if (label && originalLabels.has(card)) label.textContent = originalLabels.get(card);
    });

    const activePageButton = document.querySelector('.page-number.active');
    const requestedPage = activePageButton ? Number.parseInt(activePageButton.textContent || '1', 10) || 1 : 1;
    const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const sliceStart = (page - 1) * PAGE_SIZE;
    const sliceEnd = sliceStart + PAGE_SIZE;
    const visibleSet = new Set(matchCards.slice(sliceStart, sliceEnd));

    cards.forEach((card) => {
      card.hidden = !visibleSet.has(card);
    });

    if (resultCount) {
      resultCount.textContent = matches.length
        ? `Showing ${sliceStart + 1}–${Math.min(sliceEnd, matches.length)} of ${matches.length} events`
        : '0 events';
    }

    if (noResults) noResults.hidden = matches.length !== 0;
    if (pagination) pagination.hidden = matches.length === 0 || totalPages <= 1;
    if (previousPage instanceof HTMLButtonElement) previousPage.disabled = page <= 1;
    if (nextPage instanceof HTMLButtonElement) nextPage.disabled = page >= totalPages;
  };

  let scheduled = false;
  const scheduleFix = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyWeekendFix();
    });
  };

  filters.addEventListener('input', scheduleFix);
  filters.addEventListener('change', scheduleFix);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-quick], #clear-filters, #clear-empty, #pagination button')) scheduleFix();
  });

  scheduleFix();
})();
