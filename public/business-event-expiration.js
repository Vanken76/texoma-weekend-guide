(() => {
  const eventCards = [...document.querySelectorAll('.events-section .event-card')];
  if (!eventCards.length) return;

  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  const parseRule = (rule = '') => Object.fromEntries(
    String(rule)
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((part) => part.split('='))
      .filter(([key, value]) => key && value)
  );

  const recurrenceEndDate = (event) => {
    if (event.recurrence_end_date) return event.recurrence_end_date;
    const until = parseRule(event.recurrence_rule).UNTIL;
    if (!until || !/^\d{8}/.test(until)) return null;
    return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  };

  const isCurrent = (event) => {
    if (!event || event.active === false || event.publish_ready !== true) return false;
    if (!['upcoming', 'recurring'].includes(event.status)) return false;

    if (event.status === 'recurring' || event.recurring === true) {
      const endDate = recurrenceEndDate(event);
      return !endDate || endDate >= today;
    }

    if (event.end_datetime) {
      const end = new Date(event.end_datetime);
      return !Number.isNaN(end.getTime()) && end >= now;
    }

    const startDate = typeof event.start_datetime === 'string'
      ? event.start_datetime.slice(0, 10)
      : null;
    return Boolean(startDate && startDate >= today);
  };

  // Immediate DOM fallback: stale static HTML can survive at an edge even after
  // the source event record has expired. Remove clearly past one-time cards
  // without waiting on the directory fetch. Same-day events are kept all day.
  eventCards.forEach((card) => {
    const status = card.querySelector('.event-status')?.textContent?.trim().toLowerCase() || '';
    if (status.includes('recurring')) return;

    const dateText = [...card.querySelectorAll('p')]
      .map((node) => node.textContent?.trim() || '')
      .find((text) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(text));
    if (!dateText) return;

    const match = dateText.match(/(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/);
    if (!match) return;
    const [, monthName, day, year] = match;
    const month = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    }[monthName];
    const cardDate = `${year}-${month}-${String(day).padStart(2, '0')}`;
    if (cardDate < today) card.remove();
  });

  const remainingCards = [...document.querySelectorAll('.events-section .event-card')];
  if (!remainingCards.length) {
    document.querySelector('.events-section')?.remove();
    return;
  }

  fetch(`/data/local-event-directory.json?fresh=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  })
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load event directory');
      return response.json();
    })
    .then((directory) => {
      const eventsBySlug = new Map(
        (directory.events || [])
          .filter((event) => event.event_slug)
          .map((event) => [event.event_slug, event])
      );

      remainingCards.forEach((card) => {
        if (!card.isConnected) return;
        const link = card.querySelector('a[href^="/events/"]');
        const slug = link?.getAttribute('href')?.match(/^\/events\/([^/]+)\/?/)?.[1];
        if (!slug) return;
        const event = eventsBySlug.get(slug);
        if (!isCurrent(event)) card.remove();
      });

      const section = document.querySelector('.events-section');
      if (section && !section.querySelector('.event-card')) section.remove();
    })
    .catch((error) => console.warn('Expired business events were not removed:', error));
})();
