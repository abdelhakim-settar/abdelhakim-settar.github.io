/* Shared reconciliation of the author's verified bibliography and public indexes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SettarBibliography = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const AUTHOR = 'https://openalex.org/A5042702773';
  const categories = {
    ACL: ['Articles dans des revues à comité de lecture', 'Peer-reviewed journal articles'],
    ACTI: ['Communications avec actes dans des congrès internationaux', 'International conference proceedings'],
    COM: ['Communications sans actes', 'Conference presentations without proceedings'],
    INV: ['Conférences invitées', 'Invited lectures'],
    COS: ['Chapitres d’ouvrages scientifiques', 'Scientific book chapters'],
    ACT: ['Autres communications avec actes', 'Other conference proceedings'],
    CORR: ['Corrections d’articles', 'Article corrections'],
    PRE: ['Prépublications', 'Preprints']
  };
  const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const doi = s => String(s || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  const validDOI = s => /^10\.\d{4,9}\/\S+$/i.test(s);
  const correction = r => r.correction || /^(correction|erratum|corrigendum|retraction)\b/i.test(r.title || '');
  const authorName = s => /abdelhakimsettar|settarabdelhakim/.test(normalize(s));
  const conference = s => /conference|proceedings|symposium|congres|congress|convective heat and mass transfer/i.test(s || '');
  const scope = s => /international|\bint\.?\s*symp|\bintl\b/i.test(s || '') ? 'ACTI' : 'ACT';
  function clean(r) {
    const d = doi(r.doi), category = correction(r) ? 'CORR' : r.category;
    if (!categories[category] || !r.title || !Number.isInteger(r.year) || r.year < 1900 || r.year > new Date().getFullYear() + 1) return null;
    return { ...r, category, title: String(r.title).trim(), doi: validDOI(d) ? d : '', correction: category === 'CORR', url: validDOI(d) ? 'https://doi.org/' + d : /^https:\/\//.test(r.url || '') ? r.url : '', source: String(r.source || '').replace(/HDR/g, 'Bibliographie de l’auteur') };
  }
  function fromOpenAlex(w) {
    if (!w || !Array.isArray(w.authorships) || !w.authorships.some(a => a.author?.id === AUTHOR)) return null;
    const loc = w.primary_location || {}, source = loc.source || {}, title = w.title || w.display_name;
    if (!title || ['paratext', 'dissertation', 'dataset', 'grant', 'book', 'preprint'].includes(w.type)) return null;
    const d = doi(w.doi), venue = source.display_name || '';
    if (/SSRN|preprints\.org/i.test(venue)) return null;
    if (w.type === 'conference-paper' && source.type === 'repository' && !validDOI(d)) return null;
    let category;
    if (['erratum', 'correction'].includes(w.type) || correction({title})) category = 'CORR';
    else if (w.type === 'preprint') category = 'PRE';
    else if (w.type === 'book-chapter') category = 'COS';
    else if (w.type === 'conference-paper' || source.type === 'conference' || conference(venue)) category = scope(venue);
    else if (['article', 'review'].includes(w.type) && source.type === 'journal') category = 'ACL';
    else return null;
    // Anonymous/translated duplicate records without a DOI are not new journal articles.
    if (['ACL', 'CORR'].includes(category) && !validDOI(d)) return null;
    return clean({category, title, authors: w.authorships.map(a => a.author?.display_name || '').filter(Boolean).join(', '), year:w.publication_year, venue, details:[w.biblio?.volume,w.biblio?.issue,[w.biblio?.first_page,w.biblio?.last_page].filter(Boolean).join('–')].filter(Boolean).join(', '), doi:d, url:loc.landing_page_url || w.id, openalex:w.id, source:'OpenAlex', retracted:!!w.is_retracted, automatic:true});
  }
  function fromHAL(w) {
    if (!w || !Array.isArray(w.authFullName_s) || !w.authFullName_s.some(authorName)) return null;
    const title = Array.isArray(w.title_s) ? w.title_s[0] : w.title_s;
    const venue = w.journalTitle_s || w.conferenceTitle_s || '';
    if (/SSRN|preprints\.org/i.test(venue)) return null;
    let category;
    if (correction({title})) category = 'CORR';
    else if (w.docType_s === 'COUV') category = 'COS';
    else if (w.docType_s === 'ART') category = conference(venue) ? scope(venue) : 'ACL';
    else if (w.docType_s === 'PROCEEDINGS') category = scope(venue);
    else if (w.docType_s === 'COMM') category = w.proceedings_s==='1' || /^10\.(?:1063|1109)\//i.test(doi(w.doiId_s)) ? scope(venue) : 'COM';
    else return null;
    // The index occasionally attributes a whole proceedings volume to each contributor.
    if (/^Proceeding(?:s)? of Proceedings/i.test(title || '')) return null;
    return clean({category,title,authors:w.authFullName_s.join(', '),year:w.publicationDateY_i || w.producedDateY_i,venue,details:'',doi:w.doiId_s || '',hal:w.halId_s,url:w.uri_s || '',source:'HAL',automatic:true});
  }
  function reconcile(seed, openalex, hal) {
    const records = seed.map(clean).filter(r=>r && r.category!=='PRE' && !/SSRN/i.test(r.venue));
    for (const candidate of [...(openalex || []).map(fromOpenAlex), ...(hal || []).map(fromHAL)].filter(Boolean)) {
      const key = normalize(candidate.title);
      const old = records.find(r => candidate.doi && r.doi === candidate.doi) || records.find(r => normalize(r.title) === key);
      if (!old) { records.push(candidate); continue; }
      if (old.category === 'PRE' && candidate.category !== 'PRE') Object.assign(old,candidate);
      else if (candidate.category !== 'PRE') {
        if (!old.doi && candidate.doi) {old.doi=candidate.doi;old.url=candidate.url;}
        // Replace erroneous volume-level CONV DOIs by the matching individual paper DOI.
        if (old.doi && candidate.doi.startsWith(old.doi + '.') && /10\.1615\/ichmt\./.test(old.doi)) {old.doi=candidate.doi;old.url=candidate.url;}
        if (!old.hal && candidate.hal) old.hal=candidate.hal;
        if (candidate.openalex) old.openalex=candidate.openalex;
        if (old.automatic && candidate.category === 'COS') old.category='COS';
        if (old.automatic && old.category === 'ACT' && candidate.category === 'ACTI') old.category='ACTI';
      }
    }
    const articles=records.filter(r=>r.category!=='CORR');
    for(const notice of records.filter(r=>r.category==='CORR')) {
      const title=normalize(notice.title.replace(/^(?:correction(?:\s+to)?|erratum|corrigendum)\s*:?\s*/i,''));
      const original=articles.find(r=>normalize(r.title)===title);
      if(original && notice.doi) {
        original.corrections=[...(original.corrections||[])];
        if(!original.corrections.some(c=>c.doi===notice.doi))original.corrections.push({title:notice.title,year:notice.year,doi:notice.doi,url:notice.url});
      }
    }
    const seen = new Set();
    return articles.filter(r => {const k=r.doi || normalize(r.title);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>b.year-a.year || a.title.localeCompare(b.title));
  }
  return {AUTHOR,categories,normalize,doi,clean,fromOpenAlex,fromHAL,reconcile};
});

const search = document.querySelector('#publication-search');
const year = document.querySelector('#publication-year');
const category = document.querySelector('#publication-category');
if (search && year) {
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#no-results');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const synonyms = {cinetique:'kinetic', reformage:'reforming', vaporeformage:'reforming', hydrogene:'hydrogen', transferts:'transfer', thermique:'thermal', mousse:'foam', mousses:'foam', biomasse:'biomass', materiaux:'material', numerique:'numerical'};
  function filter() {
    const publications = [...document.querySelectorAll('[data-publication]')];
    const groups = [...document.querySelectorAll('[data-publication-group]')];
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
  document.addEventListener('bibliography-updated',filter);
  document.addEventListener('click',event=>{
    const link=event.target.closest('.publication-categories a, .type-output-row');
    if(link) {
      if (category) category.value = link.hash.slice(1);
      year.value = '';
      search.value = '';
      filter();
    }
  });
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

/* Refresh the full bibliography and its charts together from public indexes. */
(() => {
  const seedElement = document.querySelector('#bibliography-seed');
  const core = globalThis.SettarBibliography;
  if (!seedElement || !core) return;
  const fr = document.documentElement.lang === 'fr';
  const status = document.querySelector('[data-bibliography-status]');
  const CACHE = 'settar-bibliography-v2';
  const seed = JSON.parse(seedElement.textContent);
  const number = new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB');
  const date = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {dateStyle:'long',timeStyle:'short',timeZone:'Europe/Paris'});
  const label = (f,e) => fr ? f : e;
  const element = (tag, text, cls) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  function link(url,text) {
    const a=element('a',text);
    try {const parsed=new URL(url);if(parsed.protocol==='https:')a.href=parsed.href;} catch (_) { /* Keep untrusted URLs inert. */ }
    return a;
  }
  function article(r) {
    const row=element('article',undefined,'pub');row.dataset.publication='';row.dataset.year=String(r.year);row.dataset.category=r.category;
    row.append(element('div',String(r.year),'pub-year'));
    const body=element('div'), tags=element('div',undefined,'pub-tags');tags.append(element('span',r.category,'tag hceres-tag'));
    if(r.retracted)tags.append(element('span',label('Article rétracté','Retracted article'),'tag correction-tag'));
    const title=element('h3');title.lang='en';title.append(r.url ? link(r.url,r.title) : document.createTextNode(r.title));
    const authors=element('p',r.authors.replace(/\bsettar\b/gi,'SETTAR'));
    const venue=element('p'), italic=element('i',r.venue);venue.append(italic);if(r.details)venue.append(document.createTextNode(' · '+r.details));
    const ids=element('p',undefined,'pub-identifiers');if(r.doi)ids.append(link('https://doi.org/'+r.doi,'DOI : '+r.doi));if(r.hal)ids.append(link('https://hal.science/'+r.hal,'HAL ↗'));
    body.append(tags,title,authors,venue,ids);row.append(body);
    const marks=[['10.3390/hydrogen','journal-hydrogen.png','Hydrogen','https://www.mdpi.com/journal/hydrogen'],['10.1155/mse/','journal-mse.jpg','Modelling and Simulation in Engineering','https://onlinelibrary.wiley.com/journal/8203'],['10.1063/','publisher-aip.svg','AIP Publishing','https://publishing.aip.org/publications/conference-proceedings/'],['10.1002/app.','journal-japs.jpg','Journal of Applied Polymer Science','https://onlinelibrary.wiley.com/journal/10974628'],['10.1002/er.','journal-ijer.jpg','International Journal of Energy Research','https://onlinelibrary.wiley.com/journal/1099114X']];
    const mark=marks.find(m=>r.doi.startsWith(m[0]));if(mark){const brand=link(mark[3],'');brand.className='journal-mark'+(mark[1]==='publisher-aip.svg'?' dark':'');const img=element('img');img.src='/'+mark[1];img.alt=mark[2];img.width=260;img.height=52;img.loading='lazy';brand.append(img);body.insertBefore(brand,title);}
    for(const c of r.corrections||[]){const p=element('p',undefined,'minor');p.append(link('https://doi.org/'+c.doi,label('Correction liée à cet article','Correction associated with this article')+' · '+c.year+' ↗'));body.append(p);}
    row.append(r.url ? link(r.url,'↗') : element('span'));
    row.lastChild.className='pub-link';
    if(r.url)row.lastChild.setAttribute('aria-label',label('Consulter la référence','View reference'));
    return row;
  }
  let active=[];
  function render(snapshot, liveSources) {
    if(!snapshot || !Array.isArray(snapshot.records) || !Number.isFinite(Date.parse(snapshot.retrieved_at)))return false;
    const records=core.reconcile(snapshot.records,[],[]);if(records.length<seed.records.length)return false;
    active=records;
    const counts=Object.fromEntries(Object.keys(core.categories).map(c=>[c,records.filter(r=>r.category===c).length]));
    const groupContainer=document.querySelector('[data-publication-groups]');
    const groupNodes=[],navNodes=[];
    for(const [cat,titles] of Object.entries(core.categories)) {
      if(!counts[cat])continue;
      const section=element('section',undefined,'publication-group');section.id=cat;section.dataset.publicationGroup='';
      const heading=element('div',undefined,'publication-group-heading');heading.append(element('span',cat,'category-code'),element('h2',titles[fr?0:1]),element('span',String(counts[cat]),'category-count'));
      section.append(heading,...records.filter(r=>r.category===cat).map(article));groupNodes.push(section);
      const nav=link('#'+cat,'');nav.setAttribute('href','#'+cat);nav.append(element('strong',cat),element('span',titles[fr?0:1]),element('em',String(counts[cat])));navNodes.push(nav);
    }
    groupContainer.replaceChildren(...groupNodes);
    document.querySelector('.publication-categories').replaceChildren(...navNodes);
    const category=document.querySelector('#publication-category'),selected=category.value;
    category.replaceChildren(new Option(label('Toutes les catégories','All categories'),''),...Object.entries(core.categories).filter(([c])=>counts[c]).map(([c,t])=>new Option(c+' · '+t[fr?0:1],c)));
    category.value=selected;
    const year=document.querySelector('#publication-year'),selectedYear=year.value;
    year.replaceChildren(new Option(label('Toutes les années','All years'),''),...[...new Set(records.map(r=>r.year))].sort((a,b)=>b-a).map(y=>new Option(String(y),String(y))));year.value=selectedYear;
    const types=['ACL','ACTI','COM','COS','INV',...(counts.ACT?['ACT']:[])],colors=['#4c89df','#34b583','#89b640','#e4bf25','#e68843','#8295b5'];
    const max=Math.max(1,...types.map(c=>counts[c]));
    document.querySelector('[data-type-chart]').replaceChildren(...types.map((cat,i)=>{const row=link('#'+cat,'');row.setAttribute('href','#'+cat);row.className='type-output-row';const track=element('span',undefined,'type-output-track'),bar=element('i');bar.style.width=((counts[cat]||0)/max*100)+'%';bar.style.background=colors[i];track.append(bar);row.append(element('span',cat),track,element('strong',number.format(counts[cat]||0)));return row;}));
    const period=document.querySelector('[data-contribution-period]');
    if(period)period.textContent=label('Bibliographie consolidée : ','Consolidated bibliography: ')+number.format(records.length)+label(' références',' references');
    const time=date.format(new Date(snapshot.retrieved_at));
    status.textContent=(liveSources.length ? label('Bibliographie actualisée · ','Bibliography refreshed · ')+liveSources.join(' + ')+' · ' : label('Dernier relevé disponible · ','Last available snapshot · '))+time+label(' (heure de Paris)',' (Paris time)');
    status.dataset.state=liveSources.length?'live':'snapshot';
    document.dispatchEvent(new CustomEvent('bibliography-updated'));
    return true;
  }
  let cached;try{cached=JSON.parse(localStorage.getItem(CACHE));}catch(_){}
  if(!render(cached,[]))render(seed,[]);
  async function get(url) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{const r=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw new Error('Index unavailable');return await r.json();}finally{clearTimeout(timeout);}
  }
  async function openalex() {
    const endpoint='https://api.openalex.org/works?filter=author.id:A5042702773&per-page=200&select=id,doi,title,publication_year,type,primary_location,authorships,biblio,is_retracted';
    let records=[],count=0;
    for(let page=1;page<=20;page++){
      const d=await get(endpoint+'&page='+page);
      if(!d.meta || !Number.isSafeInteger(d.meta.count) || !Array.isArray(d.results) || d.results.some(w=>!w.authorships?.some(a=>a.author?.id===core.AUTHOR)))throw new Error('Invalid author index');
      count=d.meta.count;records.push(...d.results);if(records.length>=count)return records;if(!d.results.length)throw new Error('Incomplete author index');
    }
    throw new Error('Author index exceeds pagination limit');
  }
  async function hal() {
    const query='authIdHal_s:abdelhakim-settar OR authFullName_t:"Abdelhakim Settar"';
    const endpoint='https://api.archives-ouvertes.fr/search/?q='+encodeURIComponent(query)+'&wt=json&rows=1000&fl=title_s,authFullName_s,journalTitle_s,conferenceTitle_s,publicationDateY_i,producedDateY_i,doiId_s,docType_s,peerReviewing_s,halId_s,uri_s,proceedings_s';
    const d=await get(endpoint);if(!d.response || !Number.isSafeInteger(d.response.numFound) || !Array.isArray(d.response.docs) || d.response.numFound>d.response.docs.length)throw new Error('Incomplete HAL bibliography');return d.response.docs;
  }
  Promise.allSettled([openalex(),hal()]).then(results=>{
    const sources=[],oa=results[0].status==='fulfilled'?results[0].value:[],halRecords=results[1].status==='fulfilled'?results[1].value:[];
    if(results[0].status==='fulfilled')sources.push('OpenAlex');if(results[1].status==='fulfilled')sources.push('HAL');if(!sources.length)return;
    const snapshot={retrieved_at:new Date().toISOString(),records:core.reconcile(active,oa,halRecords)};
    render(snapshot,sources);try{localStorage.setItem(CACHE,JSON.stringify(snapshot));}catch(_){}
  });
  // Export exactly the references shown after synchronization, including added records.
  const exportLink=document.querySelector('[data-bibliography-export]');
  if(exportLink)exportLink.addEventListener('click',()=>{
    const keys=['category','year','title','authors','venue','details','doi','url'];
    const quote=v=>'"'+String(v??'').replace(/^[=+@\t\r-]/,"'$&").replace(/"/g,'""')+'"';
    const csv='\uFEFF'+[keys.map(quote).join(','),...active.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\r\n');
    if(exportLink.dataset.blob)URL.revokeObjectURL(exportLink.dataset.blob);
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));exportLink.href=url;exportLink.dataset.blob=url;
  });
})();
