(() => {
  const eventCards = [...document.querySelectorAll('.events-section .event-card')];
  if (!eventCards.length) return;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const parseRule = (rule = '') => Object.fromEntries(
    String(rule)
      .replace(/^RRULE:/, '')
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

    if (event.status === 'recurring' || event.recurring === true) {
      const endDate = recurrenceEndDate(event);
      return !endDate || endDate >= today;
    }

    if (event.end_datetime) return new Date(event.end_datetime) >= new Date();
    return Boolean(event.start_datetime && event.start_datetime.slice(0, 10) >= today);
  };

  fetch('/data/local-event-directory.json', { cache: 'no-store' })
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

      eventCards.forEach((card) => {
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
