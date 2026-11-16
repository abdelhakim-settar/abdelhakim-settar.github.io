const search = document.querySelector('#publication-search');
const year = document.querySelector('#publication-year');
const category = document.querySelector('#publication-category');
if (search && year) {
  const publications = [...document.querySelectorAll('[data-publication]')];
  const groups = [...document.querySelectorAll('[data-publication-group]')];
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#no-results');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const synonyms = {cinetique:'kinetic', reformage:'reforming', vaporeformage:'reforming', hydrogene:'hydrogen', transferts:'transfer', thermique:'thermal', mousse:'foam', mousses:'foam', biomasse:'biomass', materiaux:'material', numerique:'numerical'};
  function filter() {
    let visible = 0;
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    for (const publication of publications) {
      const match = (!year.value || publication.dataset.year === year.value) &&
        (!category || !category.value || publication.dataset.category === category.value) &&
        terms.every(term => normalize(publication.textContent).includes(term) || synonyms[term] && normalize(publication.textContent).includes(synonyms[term]));
      publication.hidden = !match;
      if (match) visible++;
    }
    for (const group of groups) {
      const shown = [...group.querySelectorAll('[data-publication]')].filter(p => !p.hidden).length;
      group.hidden = shown === 0;
      const badge = group.querySelector('.category-count');
      if (badge) badge.textContent = String(shown);
    }
    count.textContent = document.documentElement.lang === 'fr'
      ? `${visible} référence${visible > 1 ? 's' : ''} affichée${visible > 1 ? 's' : ''}`
      : `${visible} reference${visible !== 1 ? 's' : ''} shown`;
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', filter);
  year.addEventListener('change', filter);
  if (category) category.addEventListener('change', filter);
  for (const link of document.querySelectorAll('.publication-categories a, .type-output-row')) {
    link.addEventListener('click', () => {
      if (category) category.value = link.hash.slice(1);
      year.value = '';
      search.value = '';
      filter();
    });
  }
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
      Array.isArray(data.counts_by_year) && data.counts_by_year.every(y => validNumber(y.year) && y.year >= 1900 && y.year <= new Date().getFullYear() && validNumber(y.cited_by_count) && validNumber(y.works_count));
  }
  const number = new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB');
  const date = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  function annualChart(panel, data) {
    const target = panel.querySelector('[data-output-trends]');
    if (!target) return;
    const years = [...data.counts_by_year].sort((a, b) => a.year - b.year);
    if (!years.length) { target.replaceChildren(); return; }
    const W = 760, H = 265, left = 43, right = 43, top = 28, bottom = 45;
    const width = W - left - right, height = H - top - bottom;
    const maxW = Math.max(1, ...years.map(y => y.works_count));
    const maxC = Math.max(1, ...years.map(y => y.cited_by_count));
    const step = width / years.length;
    const x = i => left + (i + .5) * step;
    const y = (n, max) => top + height * (1 - n / max);
    const labels = fr ? ['Travaux', 'Citations'] : ['Works', 'Citations'];
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fr ? 'Travaux et citations par année, deux axes distincts' : 'Works and citations by year, two separate axes'}"><text x="${left}" y="15" fill="#3679c8">${labels[0]}</text><text x="${W-right}" y="15" text-anchor="end" fill="#243c73">${labels[1]}</text>`;
    for (let i = 0; i <= 4; i++) {
      const yy = top + height * i / 4;
      svg += `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#dde5ec"/><text x="${left-9}" y="${yy+4}" text-anchor="end" fill="#3679c8">${Math.round(maxW*(1-i/4))}</text><text x="${W-right+9}" y="${yy+4}" fill="#243c73">${Math.round(maxC*(1-i/4))}</text>`;
    }
    years.forEach((r, i) => {
      const yy = y(r.works_count, maxW), bw = Math.min(25, step * .48);
      svg += `<rect x="${x(i)-bw/2}" y="${yy}" width="${bw}" height="${top+height-yy}" fill="#4688db" rx="2"><title>${r.year}: ${r.works_count} ${labels[0]}</title></rect><text x="${x(i)}" y="${H-18}" text-anchor="middle" fill="#718594">${r.year}${r.year===new Date().getFullYear()?'*':''}</text>`;
    });
    svg += `<polyline points="${years.map((r,i)=>`${x(i)},${y(r.cited_by_count,maxC)}`).join(' ')}" fill="none" stroke="#243c73" stroke-width="2.5"/>`;
    years.forEach((r,i) => { svg += `<circle cx="${x(i)}" cy="${y(r.cited_by_count,maxC)}" r="4" fill="#243c73" stroke="white"><title>${r.year}: ${r.cited_by_count} ${labels[1]}</title></circle>`; });
    target.innerHTML = svg + '</svg>';
    const tbody = panel.querySelector('[data-output-years]');
    if (tbody) tbody.innerHTML = years.map(r=>`<tr><th scope="row">${r.year}</th><td>${number.format(r.works_count)}</td><td>${number.format(r.cited_by_count)}</td></tr>`).join('');
  }
  function render(snapshot, live) {
    if (!snapshot || !valid(snapshot.data) || !Number.isFinite(Date.parse(snapshot.retrieved_at))) return false;
    const d = snapshot.data;
    for (const panel of panels) {
      const values = { works: d.works_count, citations: d.cited_by_count, h: d.summary_stats.h_index, i10: d.summary_stats.i10_index };
      for (const [key, value] of Object.entries(values)) panel.querySelector(`[data-metric="${key}"]`).textContent = number.format(value);
      panel.querySelector('[data-metrics-status]').textContent = (fr ? (live ? 'OpenAlex · vérifié le ' : 'OpenAlex · dernier relevé disponible : ') : (live ? 'OpenAlex · checked on ' : 'OpenAlex · last available snapshot: ')) + date.format(new Date(snapshot.retrieved_at)) + (fr ? ' (heure de Paris)' : ' (Paris time)');
      panel.dataset.metricsState = live ? 'live' : 'snapshot';
      annualChart(panel, d);
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
