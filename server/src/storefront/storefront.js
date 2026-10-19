// Storefront behaviour. Inlined into the page by the server and allowed by CSP hash.
// The whole catalogue arrives with the page (#catalogue), so every click is local:
// filters, sort, search, product sheets and the bag never wait on the network.
// The only request is placing the order.
(() => {
  const DATA = JSON.parse(document.getElementById('catalogue').textContent);
  const { settings } = DATA;
  const pieces = DATA.pieces;
  const CATS = DATA.categories.map((c) => [c.slug, c.name]);
  const FINISH = [['gold', 'Gold', '#C9A55C'], ['rose', 'Rose gold', '#D6A08A'], ['silver', 'Silver', '#C9CDD1'], ['mixed', 'Mixed', 'linear-gradient(135deg,#C9A55C 50%,#C9CDD1 50%)']];
  const ACCENTS = [['gold', 'All metal', '#C9A55C'], ['enamel', 'Enamel', '#A9D8CB'], ['beads', 'Beads', 'linear-gradient(135deg,#F4EFE4 45%,#E9B8C8 45%,#E9B8C8 70%,#AFC6E6 70%)'], ['pearls', 'Pearls', '#F3EFE6'], ['stones', 'Stones', '#B9C7D6']];
  const BAG_KEY = 'okeanos-bag-v1';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = (id) => pieces.find((p) => p.id === id);
  const thumb = (p) => p.cut || p.photos[0] || null;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  let lightDirty = true;

  // ---------- Money ----------
  const money = new Intl.NumberFormat('en', {
    style: 'currency', currency: settings.currency, maximumFractionDigits: settings.currency === 'LBP' ? 0 : 2,
  });
  // Thousands split by a thin space, never a comma (same as the admin).
  const formatPrice = (cents) => (cents == null ? 'Price on request' : money.format(cents / 100).replace(/,/g, ' '));
  const imgTag = (img, sizes, extra = '') => img
    ? `<img src="${img.l}" srcset="${img.s} 480w, ${img.l} 1200w" sizes="${sizes}" width="${img.w}" height="${img.h}" alt="" ${extra}>`
    : '';

  // ---------- Header height feeds the sticky toolbar offset ----------
  const bar = $('#bar');
  const setBarH = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  setBarH();

  // ---------- Grid ----------
  const grid = $('#grid');
  const cards = {};
  for (const p of pieces) cards[p.id] = buildCard(p);

  function buildCard(p) {
    const card = document.createElement('article');
    card.className = 'card';
    const alt = p.cut ? p.photos[0] : p.photos[1];
    const sizes = '(min-width: 1100px) 25vw, (min-width: 760px) 33vw, 50vw';
    const art = p.cut
      ? `<span class="art cut" style="--src:url('${p.cut.s}')">${imgTag(p.cut, sizes, 'loading="lazy"')}</span>`
      : (p.photos[0] ? imgTag(p.photos[0], sizes, 'class="cover" loading="lazy"') : '');
    const badge = p.soldOut ? '<span class="badge sold">Sold out</span>' : (p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '');
    const swatches = p.options.some((o) => o.swatch)
      ? `<div class="swatches" role="group" aria-label="${esc(p.optionLabel)}">${p.options.map((o, i) =>
          `<button class="sw" type="button" aria-pressed="${i === 0}" aria-label="${esc(o.label)}" data-v="${esc(o.label)}"><span style="background:${o.swatch || '#ddd'}"></span></button>`).join('')}</div>`
      : '';
    const quickLabel = p.options.length ? `Choose ${esc(p.optionLabel.toLowerCase() || 'option')}` : 'Add to bag';
    card.innerHTML = `<div class="tile-wrap">
        <button class="tile" type="button" aria-label="${esc(p.name)} (open details)">${badge}${art}${alt ? imgTag(alt, sizes, 'class="alt" loading="lazy"') : ''}</button>
        ${p.soldOut ? '' : `<button class="quick" type="button">${quickLabel}</button>`}
      </div>
      <div class="meta"><h3><button type="button">${esc(p.name)}</button></h3><p>${esc(p.type)}</p><p class="price">${formatPrice(p.price)}</p>${swatches}</div>`;

    card.querySelector('.tile').addEventListener('click', () => openPiece(p));
    card.querySelector('.meta h3 button').addEventListener('click', () => openPiece(p));
    card.querySelector('.quick')?.addEventListener('click', (e) => {
      if (p.options.length) return openPiece(p);
      addToBag(p, '');
      flash(e.currentTarget, 'Added to bag');
    });
    card.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => {
      card.querySelectorAll('.sw').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      p.pick = b.dataset.v;
    }));
    return card;
  }

  function flash(btn, text) {
    const was = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = was; }, 1400);
  }

  // ---------- Filters + sort ----------
  const state = { cat: new Set(), finish: new Set(), accent: new Set(), collection: new Set(), sort: 'featured', newOnly: false };
  const valueOf = (p, key) => (key === 'collection' ? p.collections : [p[key]]);
  const matches = (p, ignore) => ['cat', 'finish', 'accent', 'collection'].every((key) =>
    key === ignore || !state[key].size || valueOf(p, key).some((v) => state[key].has(v))) && (!state.newOnly || p.isNew);
  const SORTS = {
    newest: (a, b) => b.added.localeCompare(a.added),
    az: (a, b) => a.name.localeCompare(b.name),
    'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
  };
  function visible() {
    const list = pieces.filter((p) => matches(p));
    return SORTS[state.sort] ? [...list].sort(SORTS[state.sort]) : list;
  }
  const activeCount = () => state.cat.size + state.finish.size + state.accent.size + state.collection.size + (state.newOnly ? 1 : 0);

  function render() {
    const list = visible();
    grid.replaceChildren();
    for (const p of list) grid.appendChild(cards[p.id]);
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'no-results';
      empty.textContent = 'No pieces match these filters. Clear a filter to see more.';
      grid.appendChild(empty);
    }
    const n = activeCount();
    $('#filterN').textContent = n ? `(${n})` : '';
    $('#resultCount').textContent = plural(list.length, 'piece');
    const heading = $('#shop-h');
    heading.textContent = state.newOnly ? 'New in'
      : state.cat.size === 1 ? CATS.find((c) => c[0] === [...state.cat][0])[1] : heading.dataset.default;
    $('#applyF').textContent = `Show ${plural(list.length, 'piece')}`;
    refreshFilterCounts();
    arts = $$('.art');
    lightDirty = true;
  }

  const groups = [
    ['cat', 'Type', CATS],
    ['finish', 'Finish', FINISH.filter(([v]) => pieces.some((p) => p.finish === v))],
    ['accent', 'Accent', ACCENTS.filter(([v]) => pieces.some((p) => p.accent === v))],
    ['collection', 'Collection', DATA.collections.map((c) => [c.slug, c.name])],
  ].filter(([, , opts]) => opts.length > 1);

  $('#filterBody').innerHTML = groups.map(([key, label, opts]) => `
    <details class="acc" open>
      <summary>${esc(label)} <svg class="i"><use href="#i-down"/></svg></summary>
      <div class="acc-body">${opts.map(([v, l, col]) => `
        <label class="check"><input type="checkbox" data-g="${key}" value="${esc(v)}" id="f-${key}-${esc(v)}">
          ${col ? `<span class="dot" style="background:${col}"></span>` : ''}<span>${esc(l)}</span><span class="n" data-n="${key}-${esc(v)}"></span></label>`).join('')}
      </div>
    </details>`).join('');

  function refreshFilterCounts() {
    for (const [key, , opts] of groups) {
      for (const [v] of opts) {
        const n = pieces.filter((p) => matches(p, key) && valueOf(p, key).includes(v)).length;
        const count = document.querySelector(`[data-n="${key}-${CSS.escape(v)}"]`);
        if (count) count.textContent = n;
        const box = document.getElementById(`f-${key}-${v}`);
        if (box) box.checked = state[key].has(v);
      }
    }
  }
  $('#filterBody').addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.g) return;
    state[t.dataset.g][t.checked ? 'add' : 'delete'](t.value);
    render();
  });
  $('#clearF').addEventListener('click', () => {
    ['cat', 'finish', 'accent', 'collection'].forEach((k) => state[k].clear());
    state.newOnly = false;
    render();
  });
  $('#applyF').addEventListener('click', () => $('#filterD').close());
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  function showCategory(cat) {
    ['cat', 'finish', 'accent', 'collection'].forEach((k) => state[k].clear());
    state.newOnly = cat === 'new';
    if (cat && cat !== 'new') state.cat.add(cat);
    render();
    $('#shop').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
  $$('[data-cat]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showCategory(a.dataset.cat); }));

  // ---------- Menu ----------
  const newCount = pieces.filter((p) => p.isNew).length;
  $('#menuList').innerHTML = [['new', 'New in', newCount], ['', 'All pieces', pieces.length]]
    .filter(([v, , n]) => v !== 'new' || n > 0)
    .concat(CATS.map(([v, l]) => [v, l, pieces.filter((p) => p.cat === v).length]))
    .map(([v, l, n]) => `<li><button type="button" data-menu-cat="${esc(v)}">${esc(l)}<span class="n">${n}</span></button></li>`).join('');
  $('#menuList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu-cat]');
    if (!b) return;
    $('#menuD').close();
    showCategory(b.dataset.menuCat);
  });
  $$('[data-close-nav]').forEach((a) => a.addEventListener('click', () => $('#menuD').close()));

  // ---------- Search ----------
  const q = $('#q');
  function search() {
    const term = q.value.trim().toLowerCase();
    const hits = pieces.filter((p) => !term || `${p.name} ${p.type} ${p.desc}`.toLowerCase().includes(term));
    $('#results').innerHTML = hits.length
      ? hits.map((p) => `<li><button type="button" data-id="${p.id}"><img src="${thumb(p)?.s ?? ''}" alt=""><span><b>${esc(p.name)}</b><span>${esc(p.type)}</span></span></button></li>`).join('')
      : `<li class="empty">No pieces match “${esc(q.value)}”. Try earrings or rings.</li>`;
  }
  q.addEventListener('input', search);
  $('#results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    $('#searchD').close();
    openPiece(byId(Number(b.dataset.id)));
  });

  // ---------- Product sheet ----------
  const pD = $('#pD');
  let current = null;
  function openPiece(p) {
    current = p;
    $('#pCrumb').textContent = `Pieces / ${CATS.find((c) => c[0] === p.cat)?.[1] ?? ''}`;
    $('#pName').textContent = p.name;
    $('#pPrice').textContent = formatPrice(p.price);
    $('#pDesc').textContent = p.desc;
    const badge = $('#pBadge');
    badge.hidden = !(p.badge || p.soldOut);
    badge.textContent = p.soldOut ? 'Sold out' : p.badge;
    $('#addStatus').textContent = '';
    const addBtn = $('#addBtn');
    addBtn.disabled = p.soldOut;
    addBtn.textContent = p.soldOut ? 'Sold out' : 'Add to bag';

    const images = (p.cut ? [{ ...p.cut, cut: true }] : []).concat(p.photos);
    const slides = $('#pSlides');
    slides.innerHTML = images.map((img, i) =>
      `<div class="slide"><img src="${img.l}" width="${img.w}" height="${img.h}" alt="${esc(p.name)} (photo ${i + 1} of ${images.length})" class="${img.cut ? 'cut' : ''}" ${i ? 'loading="lazy"' : ''}></div>`).join('');
    slides.scrollLeft = 0;
    const dots = $('#pDots');
    dots.innerHTML = images.length > 1 ? images.map((_, i) => `<button type="button" aria-label="Show photo ${i + 1}" aria-current="${i === 0}"></button>`).join('') : '';
    dots.querySelectorAll('button').forEach((d, i) => d.addEventListener('click', () =>
      slides.scrollTo({ left: i * slides.clientWidth, behavior: reduce ? 'auto' : 'smooth' })));

    const fieldset = $('#pOpts');
    fieldset.hidden = !p.options.length;
    if (p.options.length) {
      const pick = p.pick || p.options[0].label;
      const setLabel = (v) => { $('#pOptsLabel').innerHTML = `${esc(p.optionLabel || 'Option')}: <b>${esc(v)}</b>`; };
      $('#pOptsList').innerHTML = p.options.map((o, i) =>
        `<label><input type="radio" name="opt" id="opt-${p.id}-${i}" value="${esc(o.label)}" ${o.label === pick ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('');
      setLabel(pick);
      $('#pOptsList').onchange = (e) => { setLabel(e.target.value); p.pick = e.target.value; };
    }
    $('#pDetails').innerHTML = `<p class="plain">${esc(p.type)}. ${esc(p.material)}.</p>${p.instagram ? `<a href="${esc(p.instagram)}" target="_blank" rel="noopener">See the post on Instagram</a>` : ''}`;
    pD.showModal();
    pD.scrollTop = 0;
  }
  $('#pSlides').addEventListener('scroll', (e) => {
    const s = e.currentTarget;
    const i = Math.round(s.scrollLeft / s.clientWidth);
    $$('#pDots button').forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  }, { passive: true });
  $('#addBtn').addEventListener('click', () => {
    const opt = current.options.length ? (pD.querySelector('input[name="opt"]:checked') || {}).value : '';
    addToBag(current, opt);
    $('#addStatus').textContent = `Added to bag${opt ? `: ${opt}` : ''}`;
  });

  // ---------- Bag (kept in this browser only, so a reload does not empty it) ----------
  let bag = loadBag();
  function loadBag() {
    try {
      const saved = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
      return saved.filter((l) => byId(l.id) && !byId(l.id).soldOut && l.qty > 0 && l.qty <= 20);
    } catch { return []; }
  }
  function saveBag() {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* private mode: the bag still works for this visit */ }
  }
  function addToBag(p, opt) {
    const line = bag.find((l) => l.id === p.id && l.opt === opt);
    if (line) line.qty = Math.min(line.qty + 1, 20);
    else bag.push({ id: p.id, opt, qty: 1 });
    saveBag();
    renderBag();
  }

  function totals() {
    const priced = bag.every((l) => byId(l.id).price != null);
    const subtotal = priced ? bag.reduce((sum, l) => sum + byId(l.id).price * l.qty, 0) : null;
    const delivery = settings.deliveryCents;
    const total = subtotal != null && delivery != null ? subtotal + delivery : null;
    return { subtotal, delivery, total };
  }
  function summaryHtml() {
    const { subtotal, delivery, total } = totals();
    const rows = [
      ['Pieces', subtotal != null ? formatPrice(subtotal) : 'Confirmed by phone'],
      ['Delivery', delivery != null ? formatPrice(delivery) : 'Confirmed by phone'],
    ];
    if (total != null) rows.push(['Total', formatPrice(total)]);
    return rows.map(([k, v], i) => `<div class="${i === 2 ? 'total' : ''}"><span>${k}</span><span>${v}</span></div>`).join('');
  }

  function renderBag() {
    const n = bag.reduce((a, l) => a + l.qty, 0);
    const count = $('#bagCount');
    count.textContent = n;
    count.hidden = !n;
    $('#bagBtn').setAttribute('aria-label', `Open bag (${plural(n, 'piece')})`);
    const list = $('#bagList');
    list.replaceChildren();
    bag.forEach((l, i) => {
      const p = byId(l.id);
      const li = document.createElement('li');
      li.innerHTML = `<img src="${thumb(p)?.s ?? ''}" alt=""><div><b>${esc(p.name)}</b><span>${esc(l.opt || p.type)}</span><span>${formatPrice(p.price)}</span></div>
        <div class="qty"><button type="button" aria-label="Remove one ${esc(p.name)}">−</button><output>${l.qty}</output><button type="button" aria-label="Add one ${esc(p.name)}">+</button></div>`;
      const [minus, plus] = li.querySelectorAll('button');
      minus.addEventListener('click', () => { l.qty -= 1; if (!l.qty) bag.splice(i, 1); saveBag(); renderBag(); });
      plus.addEventListener('click', () => { l.qty = Math.min(l.qty + 1, 20); saveBag(); renderBag(); });
      list.appendChild(li);
    });
    $('#bagEmpty').hidden = n > 0;
    $('#bagSummary').hidden = n === 0;
    $('#bagSummary').innerHTML = summaryHtml();
    $('#bagFoot').hidden = n === 0;
    $('#closedNote').hidden = settings.ordersOpen;
    $('#toCheckout').hidden = !settings.ordersOpen;
  }

  // ---------- Checkout ----------
  const form = $('#checkout');
  let idempotencyKey = null;
  let deliveryPin = null; // optional GPS point shared by the customer

  function showStep(step) {
    $('#stepBag').hidden = step !== 'bag';
    $('#bagFoot').hidden = step !== 'bag' || !bag.length;
    form.hidden = step !== 'details';
    $('#checkoutFoot').hidden = step !== 'details';
    $('#stepDone').hidden = step !== 'done';
    $('#bagH').textContent = { bag: 'Your bag', details: 'Delivery details', done: 'Order placed' }[step];
    $('#bagD').scrollTop = 0;
  }

  $('#toCheckout').addEventListener('click', () => {
    idempotencyKey ??= crypto.randomUUID().replace(/-/g, '');
    $('#checkoutSummary').innerHTML = summaryHtml();
    $('#checkoutError').hidden = true;
    showStep('details');
    $('#cName').focus();
  });
  $('#backToBag').addEventListener('click', () => showStep('bag'));

  $('#useLocation').addEventListener('click', () => {
    const status = $('#locStatus');
    if (!navigator.geolocation) { status.textContent = 'Your browser cannot share a location. The address is enough.'; return; }
    status.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        deliveryPin = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        status.textContent = `Location added (within about ${deliveryPin.accuracy} m).`;
      },
      () => { deliveryPin = null; status.textContent = 'Location not shared. The address is enough.'; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#checkoutError');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const button = $('#placeOrder');
    button.disabled = true;
    button.textContent = 'Placing your order…';
    error.hidden = true;
    const fields = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          website: fields.website,
          customer: { name: fields.name, phone: fields.phone, email: fields.email, city: fields.city, address: fields.address, note: fields.note },
          location: deliveryPin,
          items: bag.map((l) => ({ pieceId: l.id, option: l.opt, quantity: l.qty })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The order could not be placed. Please try again.');
      orderPlaced(result, fields.name);
    } catch (err) {
      error.textContent = err.message === 'Failed to fetch' ? 'No connection. Check your internet and try again.' : err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Place order';
    }
  });

  function orderPlaced(result, name) {
    $('#doneName').textContent = name ? `, ${name.split(' ')[0]}` : '';
    $('#doneNumber').textContent = `Order ${result.number}`;
    $('#doneSummary').innerHTML = summaryHtml();
    const wa = $('#doneWhatsApp');
    if (wa) wa.href = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Hello! I just placed order ${result.number} on the website.`)}`;
    bag = [];
    saveBag();
    idempotencyKey = null;
    deliveryPin = null;
    form.reset();
    $('#locStatus').textContent = 'Helps the driver find you.';
    renderBag();
    showStep('done');
  }

  // ---------- Drawers ----------
  const openOn = (btn, d, after) => $(btn).addEventListener('click', () => { d.showModal(); after?.(); });
  openOn('#menuBtn', $('#menuD'));
  openOn('#filterBtn', $('#filterD'), refreshFilterCounts);
  openOn('#searchBtn', $('#searchD'), () => { search(); q.focus(); });
  openOn('#bagBtn', $('#bagD'), () => { renderBag(); if ($('#stepDone').hidden) showStep('bag'); });
  $('#bagD').addEventListener('close', () => { if (!$('#stepDone').hidden) showStep('bag'); });
  $$('dialog.drawer').forEach((d) => {
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // click on the scrim
  });

  renderBag();

  // ---------- Header turns solid once the big wordmark has passed under it ----------
  const heroEl = $('#hero');
  new IntersectionObserver(([e]) => bar.classList.toggle('solid', !e.isIntersecting && e.boundingClientRect.top < 0),
    { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` }).observe($('.mark'));

  // ---------- Light (shared by the wall and the pieces) ----------
  const light = { x: innerWidth * 0.18, y: innerHeight * 0.12 };
  const target = { x: light.x, y: light.y };
  let lastMove = -1e9;
  const ripples = [];
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  let prev = null;
  function pointer(x, y, tap) {
    target.x = x;
    target.y = y;
    lastMove = now();
    $('#hint').classList.add('gone');
    if (reduce) { light.x = x; light.y = y; }
    const t = now();
    if (!reduce) {
      if (prev) {
        const dt = Math.max(t - prev.t, 1 / 240);
        const v = Math.hypot(x - prev.x, y - prev.y) / dt;
        const last = ripples[ripples.length - 1];
        if (v > 1400 && (!last || t - last.t0 > 0.14)) addRipple(x, y, Math.min(v / 3000, 1));
      }
      if (tap) addRipple(x, y, 0.8);
    }
    prev = { x, y, t };
  }
  function addRipple(x, y, s) {
    ripples.push({ x, y: y + scrollY, t0: now(), s });
    if (ripples.length > 8) ripples.shift();
  }
  addEventListener('pointermove', (e) => pointer(e.clientX, e.clientY, false), { passive: true });
  addEventListener('pointerdown', (e) => pointer(e.clientX, e.clientY, true), { passive: true });
  addEventListener('resize', () => { setBarH(); lightDirty = true; resize(); });

  let arts = [];
  function updatePieces() {
    for (const a of arts) {
      const r = a.getBoundingClientRect();
      if (r.bottom < -100 || r.top > innerHeight + 100 || !r.width) continue;
      const dx = r.left + r.width / 2 - light.x;
      const dy = r.top + r.height / 2 - light.y;
      const d = Math.hypot(dx, dy) || 1;
      const len = Math.min(3 + d / 60, 14);
      a.style.setProperty('--sx', `${(dx / d * len).toFixed(1)}px`);
      a.style.setProperty('--sy', `${(dy / d * len).toFixed(1)}px`);
      a.style.setProperty('--sb', `${(6 + len * 0.7).toFixed(1)}px`);
      a.style.setProperty('--lx', `${((light.x - r.left) / r.width * 100).toFixed(1)}%`);
      a.style.setProperty('--ly', `${((light.y - r.top) / r.height * 100).toFixed(1)}%`);
    }
  }
  render();

  // ---------- WebGL wall ----------
  const canvas = $('#wall');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  let scale = 1;
  let prog;
  const U = {};
  const paint = { v: reduce ? 1 : 0 };
  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }';
  const FS = `precision highp float;
uniform vec2 uRes; uniform float uScale; uniform vec2 uLight; uniform float uScroll;
uniform float uTime; uniform float uPaint; uniform float uHeroH; uniform float uHeroTop;
uniform vec4 uRip[8];
const vec3 PLASTER = vec3(0.839, 0.847, 0.851);
const vec3 PAINT = vec3(0.945, 0.945, 0.937);
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
float strokeMask(vec2 p, out vec2 st){
  float w = min(uHeroH * .15, uRes.x / uScale * .3);
  float top = uHeroTop + uHeroH * .12, len = uHeroH * .74;
  float t = (p.y - top) / len;
  float wobble = .06 * sin(t * 2.6 + .6) + .05 * (noise(vec2(t * 6., 3.)) - .5);
  float s = (p.x - uRes.x / uScale * .5) / (w * .5) - wobble;
  st = vec2(s, t);
  float taper = 1. - .14 * smoothstep(.5, 1., t);
  float edge = taper * (1. + .08 * (noise(vec2(t * 18., s > 0. ? 1. : 7.)) - .5));
  float m = smoothstep(edge, edge - .12, abs(s));
  float tipTop = .02 * noise(vec2(s * 4., 2.)) + .035 * s * s;
  m *= smoothstep(tipTop, tipTop + .02, t);
  float dry = smoothstep(.6, 1.05, t);
  float bristle = noise(vec2(s * 13., t * 1.6)) * .75 + noise(vec2(s * 34., t * 3.)) * .25;
  m *= smoothstep(dry - .12, dry + .1, bristle * (1. - .2 * dry) + .06);
  float reveal = uPaint * 1.14;
  m *= 1. - smoothstep(reveal - .06, reveal, t);
  return m;
}
float height(vec2 p, out float mask){
  vec2 st;
  mask = strokeMask(p, st);
  float h = fbm(p / 220.) * .9 + noise(p / 11.) * .12 + noise(p / 4.) * .04;
  float profile = pow(max(1. - st.x * st.x, 0.), .6);
  float ridges = noise(vec2(st.x * 9., st.y * .9)) * .65 + noise(vec2(st.x * 24., st.y * 2.)) * .35;
  float rim = smoothstep(.55, .9, abs(st.x)) * .3;
  h += mask * (9. * profile + 3.2 * ridges + 3. * rim) * (1. - .5 * smoothstep(.55, 1., st.y));
  for (int i = 0; i < 8; i++){
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w > 0. && age > 0. && age < 2.2){
      float d = length(p - r.xy);
      float front = d - age * 240.;
      h += r.w * 3.2 * sin(front * .085) * exp(-front * front / 5200.) * exp(-age * 2.1) * (.35 + .65 * mask);
    }
  }
  return h;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale + vec2(0., uScroll);
  float m, mx, my;
  float h = height(p, m);
  float hx = height(p + vec2(1., 0.), mx);
  float hy = height(p + vec2(0., 1.), my);
  vec3 n = normalize(vec3(-(hx - h), -(hy - h), 1.));
  vec2 lp = uLight + vec2(0., uScroll);
  vec3 L = vec3(lp - p, 300.);
  float dist = length(L); L /= dist;
  float diff = max(dot(n, L), 0.);
  float shade = diff / max(L.z, .25);
  float fall = mix(1.03, .96, smoothstep(200., 1400., dist));
  vec3 base = mix(PLASTER, PAINT, m);
  float lit = mix(clamp(.4 + .6 * shade, .7, 1.1), clamp(.55 + .45 * shade, .78, 1.06), m);
  vec3 col = base * lit * fall;
  vec3 H = normalize(L + vec3(0., 0., 1.));
  col += pow(max(dot(n, H), 0.), 40.) * .10 * m;
  vec2 st; vec2 away = normalize(p - lp + 1e-3);
  float castShadow = strokeMask(p - away * 7., st);
  col *= 1. - .10 * clamp(castShadow - m, 0., 1.);
  col += (hash(gl_FragCoord.xy) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function resize() {
    if (!gl) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    scale = innerWidth < 700 ? Math.min(dpr, 1) : Math.min(dpr, 1.25);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    lightDirty = true;
  }
  try {
    if (!gl) throw new Error('no webgl');
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const k of ['uRes', 'uScale', 'uLight', 'uScroll', 'uTime', 'uPaint', 'uHeroH', 'uHeroTop', 'uRip']) U[k] = gl.getUniformLocation(prog, k);
    resize();
  } catch {
    document.documentElement.classList.add('no-gl');
  }

  const ease = (t) => 1 - (1 - t) ** 3;
  const PAINT_START = 0.15;
  const PAINT_DUR = 1.6;
  const ripData = new Float32Array(32);
  let hidden = false;
  let lastScroll = -1;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; if (!hidden) requestAnimationFrame(frame); });

  function frame() {
    if (hidden) return;
    const t = now();
    let active = false;
    if (!reduce && t - lastMove > 4) { // idle drift so touch screens still see the relief move
      const k = t * 0.18;
      target.x = innerWidth * (0.5 + 0.32 * Math.sin(k));
      target.y = innerHeight * (0.22 + 0.14 * Math.sin(k * 1.7 + 1));
    }
    const ex = target.x - light.x;
    const ey = target.y - light.y;
    if (Math.abs(ex) + Math.abs(ey) > 0.3) {
      light.x += ex * 0.12;
      light.y += ey * 0.12;
      active = true;
      lightDirty = true;
    }
    if (!reduce && paint.v < 1) {
      paint.v = ease(Math.min(Math.max((t - PAINT_START) / PAINT_DUR, 0), 1));
      active = true;
    }
    if (scrollY !== lastScroll) { lastScroll = scrollY; lightDirty = true; }
    const liveRipples = ripples.some((r) => t - r.t0 < 2.2);
    if (lightDirty) updatePieces();
    if (gl && prog && (active || liveRipples || lightDirty)) {
      ripData.fill(0);
      ripples.forEach((r, i) => ripData.set([r.x, r.y, r.t0, r.s], i * 4));
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uScale, scale);
      gl.uniform2f(U.uLight, light.x, light.y);
      gl.uniform1f(U.uScroll, scrollY);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uPaint, paint.v);
      gl.uniform1f(U.uHeroH, heroEl.offsetHeight);
      gl.uniform1f(U.uHeroTop, heroEl.getBoundingClientRect().top + scrollY);
      gl.uniform4fv(U.uRip, ripData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    lightDirty = false;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
