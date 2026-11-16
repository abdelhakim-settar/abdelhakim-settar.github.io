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
