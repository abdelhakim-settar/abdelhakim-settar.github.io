const search = document.querySelector('#publication-search');
const year = document.querySelector('#publication-year');
if (search && year) {
  const publications = [...document.querySelectorAll('[data-publication]')];
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#no-results');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filter() {
    let visible = 0;
    const query = normalize(search.value.trim());
    for (const publication of publications) {
      const match = (!year.value || publication.dataset.year === year.value) && normalize(publication.textContent).includes(query);
      publication.hidden = !match;
      if (match) visible++;
    }
    count.textContent = document.documentElement.lang === 'fr' ? `${visible} publication${visible > 1 ? 's' : ''} affichée${visible > 1 ? 's' : ''}` : `${visible} publication${visible !== 1 ? 's' : ''} shown`;
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', filter);
  year.addEventListener('change', filter);
  filter();
}

/* Public bibliometrics, refreshed on each page visit. No key or server needed. */
(() => {
  const panels = [...document.querySelectorAll('[data-bibliometrics]')];
  const fr = document.documentElement.lang === 'fr';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ticker = document.querySelector('.topic-ticker');
  const toggle = document.querySelector('.motion-toggle');
  if (toggle && ticker) {
    toggle.addEventListener('click', () => {
      const paused = ticker.classList.toggle('motion-paused');
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', fr ? (paused ? 'Reprendre le défilement' : 'Mettre le défilement en pause') : (paused ? 'Resume animation' : 'Pause animation'));
      toggle.textContent = paused ? '▶' : 'Ⅱ';
    });
  }
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        entry.target.classList.remove('waiting');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    for (const element of document.querySelectorAll('.reveal')) {
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.classList.add('waiting');
        observer.observe(element);
      }
    }
  }
  if (!panels.length) return;
  const AUTHOR = 'https://openalex.org/A5042702773';
  const ORCID = 'https://orcid.org/0000-0002-2147-880X';
  const ENDPOINT = 'https://api.openalex.org/authors/A5042702773?select=id,display_name,orcid,works_count,cited_by_count,summary_stats,counts_by_year';
  const CACHE = 'settar-openalex-v1';
  const validNumber = value => Number.isSafeInteger(value) && value >= 0;
  function valid(data) {
    return data && data.id === AUTHOR && data.orcid === ORCID &&
      validNumber(data.works_count) && validNumber(data.cited_by_count) &&
      data.summary_stats && validNumber(data.summary_stats.h_index) && validNumber(data.summary_stats.i10_index) &&
      Array.isArray(data.counts_by_year) && data.counts_by_year.every(y => validNumber(y.year) && y.year >= 1900 && y.year <= new Date().getFullYear() && validNumber(y.cited_by_count));
  }
  const number = new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB');
  const date = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  function render(snapshot, live) {
    if (!snapshot || !valid(snapshot.data) || !Number.isFinite(Date.parse(snapshot.retrieved_at))) return false;
    const d = snapshot.data;
    for (const panel of panels) {
      const values = { works: d.works_count, citations: d.cited_by_count, h: d.summary_stats.h_index, i10: d.summary_stats.i10_index };
      for (const [key, value] of Object.entries(values)) panel.querySelector(`[data-metric="${key}"]`).textContent = number.format(value);
      panel.querySelector('[data-metrics-status]').textContent = (fr ? (live ? 'OpenAlex · vérifié le ' : 'OpenAlex · dernier relevé disponible : ') : (live ? 'OpenAlex · checked on ' : 'OpenAlex · last available snapshot: ')) + date.format(new Date(snapshot.retrieved_at)) + (fr ? ' (heure de Paris)' : ' (Paris time)');
      panel.dataset.metricsState = live ? 'live' : 'snapshot';
      const chart = panel.querySelector('[data-citation-bars]');
      if (chart) {
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
        const counts = years.map(year => ({ year, count: d.counts_by_year.find(y => y.year === year)?.cited_by_count ?? 0 }));
        const max = Math.max(1, ...counts.map(y => y.count));
        chart.replaceChildren(...counts.map(({ year, count }) => {
          const li = document.createElement('li');
          const value = document.createElement('strong'); value.textContent = number.format(count);
          const bar = document.createElement('span'); bar.className = 'bar'; bar.setAttribute('aria-hidden', 'true'); bar.style.setProperty('--bar-height', `${Math.max(1, count / max * 105)}px`);
          const label = document.createElement('span'); label.textContent = String(year) + (year === currentYear ? '*' : '');
          li.append(value, bar, label); return li;
        }));
      }
    }
    return true;
  }
  let cached;
  try { cached = JSON.parse(localStorage.getItem(CACHE)); } catch (_) { /* Storage is optional. */ }
  const cachedShown = render(cached, false);
  if (!cachedShown) {
    try { render(JSON.parse(document.querySelector('#bibliometrics-snapshot').textContent), false); } catch (_) { /* Static values remain visible. */ }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  fetch(ENDPOINT, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then(response => { if (!response.ok) throw new Error('OpenAlex unavailable'); return response.json(); })
    .then(data => {
      if (!valid(data)) throw new Error('Unmatched author or invalid bibliometrics');
      const snapshot = { retrieved_at: new Date().toISOString(), data };
      render(snapshot, true);
      try { localStorage.setItem(CACHE, JSON.stringify(snapshot)); } catch (_) { /* Private browsing is supported. */ }
    })
    .catch(() => { /* Dated last-known values stay visible; never replace them with zeros. */ })
    .finally(() => clearTimeout(timeout));
})();
