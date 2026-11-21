/* ================== Tienda (SPA con rutas hash) ================== */
(function () {
  'use strict';
  const { icon, esc, money, toast, withLoading, formData, fmtDate } = UI;
  const api = UI.createApi('ns_token');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');

  const state = { settings: {}, methods: [], statuses: {}, pstatuses: {}, categories: [], user: null, promos: [], regions: [], shipFree: 0 };

  const REGIONS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'];

  /* ------------------------------ Carrito ------------------------------ */
  const Cart = {
    key: 'ns_cart',
    items() {
      try {
        const v = JSON.parse(localStorage.getItem(this.key) || '[]');
        return Array.isArray(v) ? v.filter((i) => i && Number.isInteger(i.id) && i.qty > 0) : [];
      } catch { return []; }
    },
    save(items) { localStorage.setItem(this.key, JSON.stringify(items)); updateCartCount(); },
    add(id, qty = 1, max = 999) {
      const items = this.items();
      const it = items.find((i) => i.id === id);
      const current = it ? it.qty : 0;
      const next = Math.min(max, current + qty);
      if (next <= current) return false;
      if (it) it.qty = next; else items.push({ id, qty: next });
      this.save(items);
      return true;
    },
    set(id, qty) {
      const items = this.items().map((i) => (i.id === id ? { ...i, qty } : i)).filter((i) => i.qty > 0);
      this.save(items);
    },
    remove(id) { this.save(this.items().filter((i) => i.id !== id)); },
    clear() { localStorage.removeItem(this.key); localStorage.removeItem('ns_coupon'); updateCartCount(); },
    count() { return this.items().reduce((s, i) => s + i.qty, 0); },
    get coupon() { return localStorage.getItem('ns_coupon') || ''; },
    set coupon(v) { if (v) localStorage.setItem('ns_coupon', v); else localStorage.removeItem('ns_coupon'); },
  };

  function updateCartCount() {
    const n = Cart.count();
    ['#cart-count', '#cart-count2'].forEach((sel) => { const el = $(sel); if (el) { el.textContent = n > 99 ? '99+' : String(n); el.dataset.n = n; } });
  }

  /* ------------------------------ Helpers UI ------------------------------ */
  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const discountPct = (p) => (p.compare_price && p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0);
  const lowStock = (p) => p.stock > 0 && p.stock <= 5;
  const img = (src, alt, cls = '') => `<img src="${esc(src || '/img/placeholder.svg')}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async">`;

  function productCard(p) {
    const pct = discountPct(p);
    const out = p.stock <= 0;
    return `<article class="pcard">
      <a href="#/producto/${esc(p.slug)}" class="pcard-img" aria-label="${esc(p.name)}">
        ${img(p.image, p.name)}
        <div class="pcard-badges">
          ${out ? '<span class="pill pill-out">Agotado</span>' : ''}
          ${!out && pct ? `<span class="pill pill-sale">-${pct}%</span>` : ''}
          ${!out && lowStock(p) ? `<span class="pill pill-low">¡Últimas ${p.stock}!</span>` : ''}
        </div>
        ${!out && p.promo ? `<span class="pill pill-promo" style="background:${esc(p.promo.bg_color)};color:${esc(p.promo.text_color)}">${icon('megaphone', 'icon-sm')} ${esc(p.promo.name)}</span>` : ''}
      </a>
      <div class="pcard-body">
        ${p.category_name ? `<span class="pcard-cat">${esc(p.category_name)}</span>` : ''}
        <a href="#/producto/${esc(p.slug)}" class="pcard-name">${esc(p.name)}</a>
        <div class="pcard-foot">
          <div>${pct ? `<span class="price-old">${money(p.compare_price)}</span>` : ''}<span class="price">${money(p.price)}</span></div>
          <button class="add-btn" type="button" data-add="${p.id}" data-stock="${p.stock}" data-name="${esc(p.name)}" ${out ? 'disabled aria-label="Agotado"' : 'aria-label="Agregar al carrito"'}>${icon(out ? 'close' : 'plus')}</button>
        </div>
      </div>
    </article>`;
  }

  function skeletonGrid(n = 8, cls = '') {
    return `<div class="grid ${cls}">${Array.from({ length: n }, () => `<div class="pcard"><div class="pcard-img skeleton" style="border-radius:0"></div><div class="pcard-body"><div class="skeleton" style="height:12px;width:40%"></div><div class="skeleton" style="height:16px;width:90%"></div><div class="skeleton" style="height:20px;width:50%;margin-top:10px"></div></div></div>`).join('')}</div>`;
  }

  function emptyState(ic, title, text, action = '') {
    return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action ? `<div class="mt-2">${action}</div>` : ''}</div>`;
  }

  function errorView(err) {
    app.innerHTML = `<div class="container page">${emptyState('alert', err.status === 404 ? 'No encontrado' : 'Algo salió mal', err.message || 'Inténtalo nuevamente.', '<a class="btn btn-dark" href="#/">Volver al inicio</a>')}</div>`;
  }

  function statusBadge(status) {
    const map = { pendiente: 'b-warning', confirmado: 'b-info', preparando: 'b-violet', enviado: 'b-info', entregado: 'b-success', cancelado: 'b-danger' };
    return `<span class="badge ${map[status] || ''}">${esc(state.statuses[status] || status)}</span>`;
  }
  function payBadge(ps) {
    const map = { pendiente: 'b-warning', pagado: 'b-success', fallido: 'b-danger', reembolsado: 'b-muted' };
    return `<span class="badge ${map[ps] || ''}">${esc(state.pstatuses[ps] || ps)}</span>`;
  }
  const methodLabel = (id) => (state.methods.find((m) => m.id === id) || {}).label || id;

  /* ------------------------------ Logo ------------------------------ */
  function logoHtml(onDark) {
    const s = state.settings;
    const name = s.store_name || 'Tienda';
    const src = onDark ? (s.store_logo_dark || s.store_logo) : s.store_logo;
    const showName = !src || s.logo_show_name !== '0';
    let mark = `<span class="logo-mark">${esc(name.charAt(0).toUpperCase())}</span>`;
    if (src) {
      const im = `<img class="logo-img" src="${esc(src)}" alt="${esc(name)}">`;
      mark = onDark && !s.store_logo_dark ? `<span class="logo-chip">${im}</span>` : im;
    }
    return `${mark}${showName ? `<span class="logo-name">${esc(name)}</span>` : ''}`;
  }

  /* ------------------------------ Cuenta regresiva ------------------------------ */
  function remaining(endsAt) {
    const end = UI.parseDate(endsAt);
    const ms = Math.max(0, end - Date.now());
    const sec = Math.floor(ms / 1000);
    return { ms, d: Math.floor(sec / 86400), h: Math.floor((sec % 86400) / 3600), m: Math.floor((sec % 3600) / 60), s: sec % 60 };
  }
  const p2 = (n) => String(n).padStart(2, '0');
  function countdownHtml(endsAt, mode) {
    const r = remaining(endsAt);
    if (r.ms <= 0) return '¡Terminó!';
    if (mode === 'boxes') return [[r.d, 'días'], [r.h, 'horas'], [r.m, 'min'], [r.s, 'seg']].map(([v, l]) => `<span class="cd-box"><b>${p2(v)}</b><small>${l}</small></span>`).join('');
    return `${r.d ? `${r.d}d ` : ''}${p2(r.h)}h ${p2(r.m)}m ${p2(r.s)}s`;
  }
  function countdown(endsAt, mode = 'inline') {
    return `<span class="cd cd-${mode}" data-countdown="${esc(endsAt)}" data-mode="${mode}">${countdownHtml(endsAt, mode)}</span>`;
  }
  setInterval(() => {
    $$('[data-countdown]').forEach((el) => { el.innerHTML = countdownHtml(el.dataset.countdown, el.dataset.mode); });
  }, 1000);

  function promoScopeLabel(pr) {
    return pr.scope === 'category' && pr.category_name ? `en ${pr.category_name}` : 'en toda la tienda';
  }

  function renderTopbar() {
    const s = state.settings;
    const tb = $('.topbar');
    const pr = state.promos.find((x) => x.show_topbar);
    if (pr) {
      tb.style.background = pr.bg_color; tb.style.color = pr.text_color;
      $('#topbar-msg').innerHTML = `<a href="${esc(pr.cta_link || '#/tienda?on_sale=1')}" class="tb-promo" style="color:inherit">${icon('megaphone', 'icon-sm')} <b>${esc(pr.topbar_text || pr.title)}</b>${pr.show_countdown ? ` · termina en ${countdown(pr.ends_at)}` : ''}</a>`;
      return;
    }
    tb.style.background = ''; tb.style.color = '';
    const free = state.shipFree;
    $('#topbar-msg').textContent = s.topbar_text || (free > 0 ? `Envío gratis desde ${money(free)} · Envíos con Shalom a todo el Perú · Paga con Yape, transferencia o contra entrega` : (s.store_tagline || ''));
  }

  /* ------------------------------ Layout ------------------------------ */
  function renderHeader() {
    const s = state.settings;
    $('#logo').innerHTML = logoHtml(false);
    const u = state.user;
    $('#header-actions').innerHTML = `
      ${u && u.role === 'admin' ? `<a class="hdr-btn" href="/admin">${icon('settings')}<span class="lbl">Panel</span></a>` : ''}
      <a class="hdr-btn" href="${u ? '#/cuenta' : '#/login'}">${icon('user')}<span class="lbl">${u ? esc(u.name.split(' ')[0]) : 'Ingresar'}</span></a>
      <a class="hdr-btn" href="#/carrito" aria-label="Carrito">${icon('cart')}<span class="cart-count" id="cart-count"></span><span class="lbl">Carrito</span></a>`;
    updateCartCount();
    $('#catnav').innerHTML = `<a href="#/tienda" data-cat="">Todo</a>` +
      state.categories.map((c) => `<a href="#/tienda?category=${esc(c.slug)}" data-cat="${esc(c.slug)}">${esc(c.name)}</a>`).join('') +
      `<a href="#/tienda?on_sale=1" class="sale" data-cat="__sale">Ofertas</a>`;
  }

  function renderChrome() {
    const s = state.settings;
    document.documentElement.style.setProperty('--primary', s.primary_color || '#e8572a');
    UI.setMoneyFormat(s.locale, s.currency);
    renderTopbar();
    const fav = document.querySelector('link[rel=icon]');
    if (fav && s.store_logo) { fav.href = s.store_logo; fav.removeAttribute('type'); }
    $('#tb-track').innerHTML = `${icon('truck')} Rastrear pedido`;
    if (s.whatsapp) {
      $('#tb-phone').innerHTML = `${icon('phone')} ${esc(s.contact_phone || s.whatsapp)}`;
      $('#tb-phone').href = `https://wa.me/${encodeURIComponent(s.whatsapp.replace(/\D/g, ''))}`;
      const wa = $('#wa-float');
      wa.href = `https://wa.me/${encodeURIComponent(s.whatsapp.replace(/\D/g, ''))}?text=${encodeURIComponent('Hola, tengo una consulta sobre un producto')}`;
      wa.innerHTML = icon('whatsapp');
      wa.hidden = false;
    } else { $('#tb-phone').hidden = true; }
    if (!$('#search-form > .icon')) $('#search-form').insertAdjacentHTML('afterbegin', icon('search'));
    renderHeader();
    $('#mnav').innerHTML = [['', 'Inicio', 'home', '#/'], ['tienda', 'Tienda', 'grid', '#/tienda'], ['buscar', 'Buscar', 'search', '#buscar'], ['carrito', 'Carrito', 'cart', '#/carrito'], ['cuenta', 'Cuenta', 'user', '#/cuenta']]
      .map(([k, l, ic, h]) => `<a href="${h}" data-nav="${k}">${icon(ic)}${k === 'carrito' ? '<span class="cart-count" id="cart-count2"></span>' : ''}<span>${l}</span></a>`).join('');
    $('#mnav [data-nav=buscar]').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#search-input').focus(), 250); });
    updateCartCount();
    const year = new Date().getFullYear();
    const { bi } = UI;
    const wa = String(s.whatsapp || '').replace(/\D/g, '');
    const social = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']].filter(([k]) => s[k]);
    const perks = [['truck', 1], ['shield-check', 2], ['arrow-repeat', 3], ['headset', 4]].filter(([, n]) => s[`perk${n}_title`]);
    const pays = [['phone', 'Yape / Plin', 'yape'], ['bank', 'Transferencia', 'transferencia'], ['cash-coin', 'Contra entrega', 'contraentrega']]
      .filter(([, , id]) => state.methods.some((m) => m.id === id));
    const col = (title, links) => `<details class="f-col" open><summary>${esc(title)}${bi('chevron-down', 'f-chev')}</summary><ul>${links.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></details>`;
    $('#footer').innerHTML = `
      ${perks.length ? `<div class="f-trust"><div class="container">${perks.map(([ic, n]) => `<div class="f-trust-item"><span>${bi(ic)}</span><div><b>${esc(s[`perk${n}_title`])}</b><small>${esc(s[`perk${n}_text`] || '')}</small></div></div>`).join('')}</div></div>` : ''}
      <div class="container">
        <div class="f-grid">
          <div class="f-brand">
            <a href="#/" class="logo">${logoHtml(true)}</a>
            <p>${esc(s.store_tagline || '')}</p>
            ${social.length || wa ? `<div class="f-social">
              ${social.map(([k, l]) => `<a href="${esc(s[k])}" target="_blank" rel="noopener" aria-label="${l}" title="${l}">${bi(k)}</a>`).join('')}
              ${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp">${bi('whatsapp')}</a>` : ''}
            </div>` : ''}
            ${wa ? `<a class="f-wa" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent('Hola, tengo una consulta')}" target="_blank" rel="noopener">${bi('whatsapp')} Escríbenos por WhatsApp</a>` : ''}
          </div>
          ${col('Comprar', [['#/tienda', 'Todos los productos'], ...state.categories.slice(0, 4).map((c) => [`#/tienda?category=${esc(c.slug)}`, c.name]), ['#/tienda?on_sale=1', 'Ofertas']])}
          ${col('Ayuda', [['#/seguimiento', 'Rastrear pedido'], ['#/pagina/envios', 'Envíos'], ['#/pagina/devoluciones', 'Cambios y devoluciones'], ['#/cuenta', 'Mi cuenta']])}
          ${col('Legal', [['#/pagina/terminos', 'Términos y condiciones'], ['#/pagina/privacidad', 'Política de privacidad'], ['#/pagina/devoluciones', 'Política de devoluciones'], ['#/libro-reclamaciones', 'Libro de Reclamaciones']])}
          <div class="f-contact">
            <h4>Contacto</h4>
            <ul>
              ${s.contact_phone ? `<li>${bi('telephone')}<a href="${wa ? `https://wa.me/${esc(wa)}` : `tel:${esc(s.contact_phone.replace(/\s/g, ''))}`}" ${wa ? 'target="_blank" rel="noopener"' : ''}>${esc(s.contact_phone)}</a></li>` : ''}
              ${s.contact_email ? `<li>${bi('envelope')}<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a></li>` : ''}
              ${s.address ? `<li>${bi('geo-alt')}<span>${esc(s.address)}</span></li>` : ''}
              ${s.business_hours ? `<li>${bi('clock')}<span>${esc(s.business_hours)}</span></li>` : ''}
            </ul>
            <a href="#/libro-reclamaciones" class="lr-seal" aria-label="Libro de Reclamaciones">
              <span class="lr-seal-ic">${bi('journal-bookmark-fill')}</span>
              <span class="lr-seal-txt"><b>LIBRO DE<br>RECLAMACIONES</b></span>
            </a>
          </div>
        </div>
        <div class="f-pay">
          <div><small>Medios de pago</small><div class="f-chips">${pays.map(([ic, l]) => `<span>${bi(ic)} ${esc(l)}</span>`).join('')}</div></div>
          <div><small>Envíos</small><div class="f-chips">${(state.shipFree >= 0 ? [['truck', 'Shalom a todo el Perú'], ['geo-alt', 'Delivery Lima y Callao']] : []).map(([ic, l]) => `<span>${bi(ic)} ${esc(l)}</span>`).join('')}</div></div>
          <div><small>Compra segura</small><div class="f-chips"><span>${bi('lock')} Sitio protegido</span><span>${bi('patch-check')} Boleta de venta</span></div></div>
        </div>
      </div>
      <div class="f-bottom"><div class="container">
        <span>© ${year} ${esc(s.company_name || s.store_name)}${s.company_ruc ? ` · RUC ${esc(s.company_ruc)}` : ''}. Todos los derechos reservados.</span>
        <nav><a href="#/pagina/terminos">Términos</a><a href="#/pagina/privacidad">Privacidad</a><a href="#/libro-reclamaciones">Libro de Reclamaciones</a></nav>
        <button type="button" class="f-top" id="to-top" aria-label="Volver arriba">${bi('arrow-up')}</button>
      </div></div>`;
    $('#to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    if (window.matchMedia('(max-width: 720px)').matches) $$('#footer details.f-col').forEach((d) => d.removeAttribute('open'));
  }

  /* ------------------------------ Router ------------------------------ */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    return { parts, query: new URLSearchParams(query) };
  }

  const routes = {
    '': viewHome,
    tienda: viewShop,
    producto: viewProduct,
    carrito: viewCart,
    checkout: viewCheckout,
    pedido: viewOrder,
    login: viewLogin,
    registro: viewRegister,
    cuenta: viewAccount,
    seguimiento: viewTrack,
    comprobante: viewReceipt,
    pagina: viewPage,
    'libro-reclamaciones': viewComplaints,
  };

  let routeId = 0;
  async function router() {
    const { parts, query } = parseHash();
    const view = routes[parts[0] || ''] || viewNotFound;
    const id = ++routeId;
    closeFilters();
    document.body.classList.remove('has-sticky', 'receipt-mode');
    const navKey = ['login', 'registro'].includes(parts[0]) ? 'cuenta' : ['producto'].includes(parts[0]) ? 'tienda' : (parts[0] || '');
    $$('#mnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
    // Marcar categoría activa
    const activeCat = parts[0] === 'tienda' ? (query.get('on_sale') ? '__sale' : query.get('category') || '') : null;
    $$('#catnav a').forEach((a) => a.classList.toggle('active', activeCat !== null && a.dataset.cat === activeCat));
    if (parts[0] !== 'tienda') $('#search-input').value = '';
    try {
      await view({ parts, query, isCurrent: () => id === routeId });
    } catch (err) {
      if (id === routeId) errorView(err);
    }
    if (id === routeId && !window.__keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    window.__keepScroll = false;
  }

  function go(hash) { if (location.hash === hash) router(); else location.hash = hash; }

  function setTitle(t) { document.title = t ? `${t} · ${state.settings.store_name}` : `${state.settings.store_name} · ${state.settings.store_tagline}`; }

  /* ------------------------------ Vistas ------------------------------ */
  async function viewHome({ isCurrent }) {
    setTitle('');
    const s = state.settings;
    try { state.promos = (await api.get('/api/promotions')).items; renderTopbar(); } catch { /* sin campañas */ }
    if (!isCurrent()) return;
    const banners = state.promos.filter((p) => p.show_banner);
    const promoSlides = banners.map((pr) => `<section class="hero promo-slide slide ${pr.image ? 'has-img' : ''}" style="--bn-bg:${esc(pr.bg_color)};--bn-fg:${esc(pr.text_color)};${pr.image ? `background-image:url('${esc(pr.image)}')` : ''}">
        <div class="hero-text">
          <span class="hero-eyebrow"><i></i> ${esc(pr.name)}${pr.discount_value > 0 ? ` · -${pr.discount_value}% ${esc(promoScopeLabel(pr))}` : ''}</span>
          <h1>${esc(pr.title)}</h1>
          ${pr.subtitle ? `<p>${esc(pr.subtitle)}</p>` : ''}
          ${pr.show_countdown ? `<div class="cd-wrap"><small>Termina en</small>${countdown(pr.ends_at, 'boxes')}</div>` : ''}
          ${pr.cta_text ? `<div class="hero-cta"><a href="${esc(pr.cta_link || '#/tienda?on_sale=1')}" class="btn btn-lg promo-cta">${esc(pr.cta_text)} ${icon('arrowRight')}</a></div>` : ''}
        </div>
        ${!pr.image && pr.discount_value > 0 ? `<div class="promo-big" aria-hidden="true"><b>-${pr.discount_value}%</b><span>${esc(promoScopeLabel(pr))}</span></div>` : ''}
      </section>`).join('');
    app.innerHTML = `<div class="container">
      <div class="slider ${banners.length ? 'multi' : ''}" id="slider">
      <div class="slides">${promoSlides}
      <section class="hero slide">
        <div class="hero-text">
          ${s.hero_eyebrow ? `<span class="hero-eyebrow"><i></i> ${esc(s.hero_eyebrow)}</span>` : ''}
          <h1>${esc(s.hero_title)}</h1>
          <p>${esc(s.hero_subtitle)}</p>
          <div class="hero-cta"><a href="#/tienda" class="btn btn-primary btn-lg">${esc(s.hero_cta_text || 'Comprar ahora')} ${icon('arrowRight')}</a><a href="#/tienda?on_sale=1" class="btn btn-lg btn-outline">Ver ofertas</a></div>
          <div class="hero-stats"><div><b>+${state.categories.reduce((a, c) => a + c.product_count, 0)}</b><span>productos</span></div><div><b>24-72 h</b><span>entrega</span></div><div><b>12 meses</b><span>garantía</span></div></div>
        </div>
        <div class="hero-art" id="hero-art">${'<div class="skeleton" style="border-radius:20px"></div>'.repeat(3)}</div>
      </section></div>
      ${banners.length ? `<button class="sl-btn prev" type="button" aria-label="Anterior">${icon('chevronLeft')}</button><button class="sl-btn next" type="button" aria-label="Siguiente">${icon('chevronRight')}</button><div class="sl-dots">${Array.from({ length: banners.length + 1 }, (_, i) => `<button type="button" data-dot="${i}" aria-label="Ir al banner ${i + 1}"></button>`).join('')}</div>` : ''}
      </div>
      <section class="perks">${[['truck', 1], ['shield', 2], ['refresh', 3], ['headset', 4]].filter(([, n]) => s[`perk${n}_title`]).map(([ic, n]) => `<div class="perk"><div class="perk-ic">${icon(ic)}</div><div><b>${esc(s[`perk${n}_title`])}</b><span>${esc(s[`perk${n}_text`] || '')}</span></div></div>`).join('')}</section>
      ${s.home_show_categories === '0' ? '' : `<section class="section">
        <div class="section-head"><div><h2>Explora por categoría</h2><p>Encuentra rápido lo que necesitas</p></div><a class="link-more" href="#/tienda">Ver todo ${icon('arrowRight')}</a></div>
        <div class="cats">${state.categories.map((c) => `<a class="cat" href="#/tienda?category=${esc(c.slug)}">${img(c.image, c.name)}<div><b>${esc(c.name)}</b><span>${c.product_count} producto${c.product_count === 1 ? '' : 's'}</span></div></a>`).join('')}</div>
      </section>`}
      ${s.home_show_featured === '0' ? '' : `<section class="section">
        <div class="section-head"><div><h2>Destacados</h2><p>Los favoritos de nuestros clientes</p></div><a class="link-more" href="#/tienda?sort=popular">Ver más ${icon('arrowRight')}</a></div>
        <div id="featured">${skeletonGrid(4)}</div>
      </section>`}
      ${s.promo_banner_show === '0' || !s.promo_banner_title ? '' : `<section class="promo">
        <div><h3>${esc(s.promo_banner_title)}</h3>${s.promo_banner_text ? `<p>${esc(s.promo_banner_text).replace(/\b([A-Z0-9]{5,})\b/g, '<code>$1</code>')}</p>` : ''}</div>
        ${s.promo_banner_cta ? `<a href="${esc(s.promo_banner_link || '#/tienda')}" class="btn btn-lg">${esc(s.promo_banner_cta)}</a>` : ''}
      </section>`}
      ${s.home_show_new === '0' ? '' : `<section class="section">
        <div class="section-head"><div><h2>Recién llegados</h2><p>Lo último en nuestro catálogo</p></div><a class="link-more" href="#/tienda?sort=new">Ver más ${icon('arrowRight')}</a></div>
        <div id="newest">${skeletonGrid(4)}</div>
      </section>`}
    </div><div style="height:72px"></div>`;

    initSlider($('#slider'), isCurrent);
    const [feat, newest] = await Promise.all([
      api.get('/api/products?featured=1&limit=8&sort=popular'),
      api.get('/api/products?limit=8&sort=new'),
    ]);
    if (!isCurrent()) return;
    const art = feat.items.slice(0, 3);
    $('#hero-art').innerHTML = art.map((p) => `<a href="#/producto/${esc(p.slug)}">${img(p.image, p.name)}<div class="tag"><span>${esc(p.name)}</span><span>${money(p.price)}</span></div></a>`).join('');
    if ($('#featured')) $('#featured').innerHTML = feat.items.length ? `<div class="grid">${feat.items.map(productCard).join('')}</div>` : emptyState('box', 'Aún no hay destacados', 'Marca productos como destacados desde el panel.');
    if ($('#newest')) $('#newest').innerHTML = newest.items.length ? `<div class="grid">${newest.items.map(productCard).join('')}</div>` : emptyState('box', 'Sin productos', 'Agrega productos desde el panel.');
  }

  function initSlider(root, isCurrent) {
    const slides = $$('.slide', root);
    const dots = $$('[data-dot]', root);
    let i = 0; let timer = null; let paused = false;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
      dots.forEach((d, k) => d.classList.toggle('active', k === i));
    };
    show(0);
    if (slides.length < 2) return;
    const tick = () => { if (!isCurrent() || !document.body.contains(root)) { clearInterval(timer); return; } if (!paused && !document.hidden) show(i + 1); };
    timer = setInterval(tick, 7000);
    $('.prev', root).addEventListener('click', () => show(i - 1));
    $('.next', root).addEventListener('click', () => show(i + 1));
    dots.forEach((d) => d.addEventListener('click', () => show(+d.dataset.dot)));
    root.addEventListener('mouseenter', () => { paused = true; });
    root.addEventListener('mouseleave', () => { paused = false; });
    let sx = null;
    root.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
      sx = null;
    });
  }

  async function viewShop({ query, isCurrent }) {
    const f = {
      q: query.get('q') || '', category: query.get('category') || '', sort: query.get('sort') || 'new',
      min: query.get('min') || '', max: query.get('max') || '', in_stock: query.get('in_stock') || '', on_sale: query.get('on_sale') || '',
      page: parseInt(query.get('page'), 10) || 1,
    };
    const cat = state.categories.find((c) => c.slug === f.category);
    const title = f.q ? `Resultados para “${f.q}”` : f.on_sale ? 'Ofertas' : cat ? cat.name : 'Todos los productos';
    setTitle(title);
    $('#search-input').value = f.q;
    const link = (patch) => `#/tienda${qs({ ...f, page: '', ...patch })}`;
    const chips = [];
    if (f.q) chips.push(['q', `Búsqueda: ${f.q}`]);
    if (cat) chips.push(['category', cat.name]);
    if (f.min) chips.push(['min', `Desde ${money(f.min)}`]);
    if (f.max) chips.push(['max', `Hasta ${money(f.max)}`]);
    if (f.in_stock) chips.push(['in_stock', 'Con stock']);
    if (f.on_sale) chips.push(['on_sale', 'En oferta']);

    app.innerHTML = `<div class="container page">
      <nav class="breadcrumb"><a href="#/">Inicio</a>${icon('chevronRight')}<a href="#/tienda">Tienda</a>${cat ? `${icon('chevronRight')}<span>${esc(cat.name)}</span>` : ''}</nav>
      <div class="shop">
        <aside class="filters" id="filters" aria-label="Filtros">
          <div class="flex between filters-toggle"><b>Filtros</b><button class="btn btn-ghost btn-icon btn-sm" type="button" data-close-filters aria-label="Cerrar filtros">${icon('close')}</button></div>
          <div class="filter-box"><h4>Categorías</h4><div class="filter-list">
            <a href="${link({ category: '' })}" class="${!f.category ? 'active' : ''}">Todas</a>
            ${state.categories.map((c) => `<a href="${link({ category: c.slug })}" class="${f.category === c.slug ? 'active' : ''}"><span>${esc(c.name)}</span><small>${c.product_count}</small></a>`).join('')}
          </div></div>
          <form class="filter-box" id="price-form"><h4>Precio</h4>
            <div class="price-inputs"><input class="input" name="min" type="number" min="0" step="1" placeholder="Mín." value="${esc(f.min)}" aria-label="Precio mínimo"><input class="input" name="max" type="number" min="0" step="1" placeholder="Máx." value="${esc(f.max)}" aria-label="Precio máximo"></div>
            <button class="btn btn-sm btn-block mt-1" type="submit">Aplicar</button>
          </form>
          <div class="filter-box"><h4>Disponibilidad</h4>
            <label class="check"><input type="checkbox" data-toggle="in_stock" ${f.in_stock ? 'checked' : ''}> Solo con stock</label>
            <label class="check mt-1"><input type="checkbox" data-toggle="on_sale" ${f.on_sale ? 'checked' : ''}> En oferta</label>
          </div>
        </aside>
        <section>
          <div class="shop-toolbar">
            <div><h1 class="page-title">${esc(title)}</h1><p class="muted small" id="result-count">Cargando…</p></div>
            <div class="flex">
              <button class="btn btn-sm filters-toggle" type="button" data-open-filters>${icon('filter', 'icon-sm')} Filtros</button>
              <label class="sr-only" for="sort">Ordenar</label>
              <select class="select" id="sort">
                <option value="new">Más recientes</option><option value="popular">Más vendidos</option>
                <option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option><option value="name">Nombre A–Z</option>
              </select>
            </div>
          </div>
          ${chips.length ? `<div class="chips" style="margin-bottom:18px">${chips.map(([k, l]) => `<span class="chip">${esc(l)}<button type="button" data-unset="${k}" aria-label="Quitar filtro">${icon('close')}</button></span>`).join('')}<a href="#/tienda" class="link-btn" style="margin-left:4px">Limpiar todo</a></div>` : ''}
          <div id="results">${skeletonGrid(6, 'cols-3')}</div>
        </section>
      </div>
    </div>`;

    $('#sort').value = f.sort;
    $('#sort').addEventListener('change', (e) => go(link({ sort: e.target.value })));
    $('#price-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(e.target);
      let min = d.min; let max = d.max;
      if (min && max && Number(min) > Number(max)) [min, max] = [max, min];
      go(link({ min, max }));
    });
    $$('[data-toggle]').forEach((c) => c.addEventListener('change', () => go(link({ [c.dataset.toggle]: c.checked ? '1' : '' }))));
    $$('[data-unset]').forEach((b) => b.addEventListener('click', () => go(link({ [b.dataset.unset]: '' }))));

    const data = await api.get(`/api/products${qs({ ...f, limit: 12 })}`);
    if (!isCurrent()) return;
    $('#result-count').textContent = `${data.total} producto${data.total === 1 ? '' : 's'}`;
    if (!data.items.length) {
      $('#results').innerHTML = emptyState('search', 'No encontramos productos', 'Prueba con otros filtros o términos de búsqueda.', '<a class="btn" href="#/tienda">Ver todo el catálogo</a>');
      return;
    }
    const pages = data.pages;
    let pag = '';
    if (pages > 1) {
      const btn = (p, label, extra = '') => `<button type="button" data-page="${p}" ${extra}>${label}</button>`;
      pag = `<nav class="pagination" aria-label="Paginación">${btn(f.page - 1, icon('chevronLeft', 'icon-sm'), f.page <= 1 ? 'disabled aria-label="Anterior"' : 'aria-label="Anterior"')}`;
      for (let p = 1; p <= pages; p++) {
        if (p === 1 || p === pages || Math.abs(p - f.page) <= 1) pag += btn(p, p, p === f.page ? 'class="active" aria-current="page"' : '');
        else if (Math.abs(p - f.page) === 2) pag += '<button type="button" disabled>…</button>';
      }
      pag += `${btn(f.page + 1, icon('chevronRight', 'icon-sm'), f.page >= pages ? 'disabled aria-label="Siguiente"' : 'aria-label="Siguiente"')}</nav>`;
    }
    $('#results').innerHTML = `<div class="grid cols-3">${data.items.map(productCard).join('')}</div>${pag}`;
    $$('[data-page]', $('#results')).forEach((b) => b.addEventListener('click', () => go(`#/tienda${qs({ ...f, page: b.dataset.page > 1 ? b.dataset.page : '' })}`)));
  }

  async function viewProduct({ parts, isCurrent }) {
    app.innerHTML = `<div class="container page"><div class="pdp"><div class="pdp-img skeleton"></div><div class="pdp-info"><div class="skeleton" style="height:16px;width:30%"></div><div class="skeleton" style="height:38px;width:80%"></div><div class="skeleton" style="height:32px;width:40%"></div><div class="skeleton" style="height:90px"></div></div></div></div>`;
    const { product: p, related } = await api.get(`/api/products/${encodeURIComponent(parts[1] || '')}`);
    if (!isCurrent()) return;
    setTitle(p.name);
    const pct = discountPct(p);
    const inCart = (Cart.items().find((i) => i.id === p.id) || {}).qty || 0;
    const maxAdd = Math.max(0, p.stock - inCart);
    const stockHtml = p.stock <= 0 ? '<div class="stock-line out"><i></i>Agotado</div>'
      : lowStock(p) ? `<div class="stock-line low"><i></i>¡Solo quedan ${p.stock} unidades!</div>`
        : '<div class="stock-line"><i></i>En stock, listo para enviar</div>';
    app.innerHTML = `<div class="container page">
      <nav class="breadcrumb"><a href="#/">Inicio</a>${icon('chevronRight')}<a href="#/tienda">Tienda</a>${p.category_slug ? `${icon('chevronRight')}<a href="#/tienda?category=${esc(p.category_slug)}">${esc(p.category_name)}</a>` : ''}${icon('chevronRight')}<span>${esc(p.name)}</span></nav>
      <div class="pdp">
        <div class="pdp-media">
          <div class="pdp-img" id="pdp-main">${img(p.image, p.name)}</div>
          ${p.gallery && p.gallery.length ? `<div class="pdp-thumbs">${[p.image, ...p.gallery].filter(Boolean).map((u, k) => `<button type="button" class="${k === 0 ? 'active' : ''}" data-thumb="${esc(u)}" aria-label="Ver imagen ${k + 1}">${img(u, `${p.name} ${k + 1}`)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="pdp-info">
          ${p.category_name ? `<span class="pcard-cat">${esc(p.category_name)}</span>` : ''}
          <h1>${esc(p.name)}</h1>
          ${pct ? `<div class="pdp-was">Precio original <s>${money(p.compare_price)}</s> <span class="pill pill-sale">-${pct}%</span></div>` : ''}
          <div class="pdp-price"><span class="price">${money(p.price)}</span>${pct ? `<span class="save-txt">Ahorras ${money(p.compare_price - p.price)}</span>` : ''}</div>
          ${p.promo ? `<div class="promo-strip" style="background:${esc(p.promo.bg_color)};color:${esc(p.promo.text_color)}">${icon('megaphone', 'icon-sm')}<span><b>${esc(p.promo.name)}</b> · ${p.promo.pct}% de descuento aplicado</span><span class="grow"></span><span class="small">Termina en ${countdown(p.promo.ends_at)}</span></div>` : ''}
          ${state.settings.tax_included === '1' ? `<span class="muted small" style="margin-top:-10px">Precio incluye ${esc(state.settings.tax_label || 'impuestos')}</span>` : ''}
          ${p.short_description ? `<p class="pdp-short">${esc(p.short_description)}</p>` : ''}
          ${stockHtml}
          ${p.stock > 0 ? `<div class="buy-row">
            <div class="qty" id="qty"><button type="button" data-q="-1" aria-label="Menos">${icon('minus')}</button><input type="number" id="qty-input" value="1" min="1" max="${Math.max(1, maxAdd)}" aria-label="Cantidad"><button type="button" data-q="1" aria-label="Más">${icon('plus')}</button></div>
            <button class="btn btn-dark" type="button" id="add-cart" ${maxAdd ? '' : 'disabled'}>${icon('cart')} Agregar al carrito</button>
            <button class="btn btn-primary" type="button" id="buy-now" ${maxAdd ? '' : 'disabled'}>Comprar ahora</button>
          </div>${inCart ? `<p class="muted small">Ya tienes ${inCart} en tu carrito${maxAdd ? '' : ' (máximo disponible)'}.</p>` : ''}` : `<a class="btn btn-lg" href="https://wa.me/${esc((state.settings.whatsapp || '').replace(/\D/g, ''))}?text=${encodeURIComponent('Hola, ¿cuándo vuelve a estar disponible ' + p.name + '?')}" target="_blank" rel="noopener">${icon('whatsapp')} Avísame cuando vuelva</a>`}
          <div class="pdp-perks">
            <div>${icon('truck')}<span>${state.shipFree > 0 ? `Envío gratis en compras desde ${money(state.shipFree)}` : 'Envíos a todo el Perú con Shalom'}</span></div>
            <div>${icon('shield')}<span>Garantía oficial de 12 meses</span></div>
            <div>${icon('refresh')}<span>Cambios y devoluciones hasta 7 días</span></div>
          </div>
          <dl class="meta-list">${p.sku ? `<dt>SKU</dt><dd>${esc(p.sku)}</dd>` : ''}${p.category_name ? `<dt>Categoría</dt><dd>${esc(p.category_name)}</dd>` : ''}</dl>
        </div>
      </div>
      ${p.description ? `<section class="section card card-pad"><h2 style="font-size:20px;margin-bottom:14px">Descripción</h2><div class="pdp-desc">${esc(p.description)}</div></section>` : ''}
      ${related.length ? `<section class="section"><div class="section-head"><h2>También te puede gustar</h2></div><div class="grid">${related.map(productCard).join('')}</div></section>` : ''}
    </div>
    ${p.stock > 0 ? `<div class="pdp-sticky"><div><b>${money(p.price)}</b>${pct ? `<s>${money(p.compare_price)}</s>` : ''}</div><button class="btn btn-primary" type="button" id="sticky-buy" ${maxAdd ? '' : 'disabled'}>${icon('cart')} Agregar al carrito</button></div>` : ''}`;
    document.body.classList.add('has-sticky');

    $$('[data-thumb]').forEach((b) => b.addEventListener('click', () => {
      $('#pdp-main img').src = b.dataset.thumb;
      $$('[data-thumb]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    if (p.stock > 0) {
      const input = $('#qty-input');
      const clamp = () => { let v = parseInt(input.value, 10) || 1; v = Math.max(1, Math.min(Math.max(1, maxAdd), v)); input.value = v; return v; };
      input.addEventListener('change', clamp);
      $$('[data-q]').forEach((b) => b.addEventListener('click', () => { input.value = (parseInt(input.value, 10) || 1) + Number(b.dataset.q); clamp(); }));
      const add = () => {
        const q = clamp();
        if (!Cart.add(p.id, q, p.stock)) { toast('Ya tienes el máximo disponible en tu carrito', 'error'); return false; }
        return true;
      };
      $('#add-cart').addEventListener('click', () => { if (add()) { toast(`${p.name} agregado al carrito`, 'success'); window.__keepScroll = true; router(); } });
      const sb = $('#sticky-buy');
      if (sb) sb.addEventListener('click', () => { if (add()) { toast(`${p.name} agregado al carrito`, 'success'); window.__keepScroll = true; router(); } });
      $('#buy-now').addEventListener('click', () => { if (add()) go('#/checkout'); });
    }
  }

  function summaryHtml(q, { showCoupon = true } = {}) {
    const s = state.settings;
    const free = Number(q.free_shipping_from);
    const base = q.subtotal - q.discount;
    let freeHtml = '';
    if (free > 0 && q.lines.length) {
      const pct = Math.min(100, (base / free) * 100);
      freeHtml = base >= free
        ? `<div class="free-ship alert alert-success">${icon('truck')}<span>¡Tienes envío gratis!</span></div>`
        : `<div class="free-ship">Te faltan <b>${money(free - base)}</b> para envío gratis<div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }
    return `${freeHtml}
      <div class="sum-row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div>
      ${q.discount ? `<div class="sum-row discount"><span>Descuento${q.coupon ? ` (${esc(q.coupon.code)})` : ''}</span><span>−${money(q.discount)}</span></div>` : ''}
      <div class="sum-row"><span>Envío${q.shipping_method && !q.shipping_estimate ? ` · ${esc(q.shipping_method.name)}` : q.shipping_estimate && q.lines.length ? ' (desde)' : ''}</span><span>${q.shipping ? money(q.shipping) : 'Gratis'}</span></div>
      ${q.tax && !q.tax_included ? `<div class="sum-row"><span>${esc(s.tax_label || 'Impuesto')} (${q.tax_rate}%)</span><span>${money(q.tax)}</span></div>` : ''}
      ${showCoupon ? `<div class="coupon-row" id="coupon-form">
        <input class="input" id="coupon-input" placeholder="Código de cupón" value="${esc(q.coupon ? q.coupon.code : Cart.coupon)}" maxlength="30" aria-label="Cupón" ${q.coupon ? 'readonly' : ''}>
        ${q.coupon ? `<button class="btn" type="button" id="coupon-remove">Quitar</button>` : '<button class="btn btn-dark" type="button" id="coupon-apply">Aplicar</button>'}
      </div>${q.coupon_error && Cart.coupon ? `<p class="small" style="color:var(--danger);margin:-8px 0 12px">${esc(q.coupon_error)}</p>` : ''}` : ''}
      <div class="sum-total"><span>Total</span><b>${money(q.total)}</b></div>
      ${q.tax && q.tax_included ? `<p class="muted small right">Incluye ${esc(s.tax_label || 'impuestos')} ${money(q.tax)}</p>` : ''}`;
  }

  function bindCoupon(rerender) {
    const f = $('#coupon-form');
    if (!f) return;
    const apply = () => {
      const code = ($('#coupon-input').value || '').trim().toUpperCase();
      if (!code) { toast('Escribe un código de cupón', 'error'); return; }
      Cart.coupon = code;
      rerender(true);
    };
    const ap = $('#coupon-apply');
    if (ap) ap.addEventListener('click', apply);
    $('#coupon-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (ap) apply(); } });
    const rm = $('#coupon-remove');
    if (rm) rm.addEventListener('click', () => { Cart.coupon = ''; rerender(); });
  }

  async function getQuote() {
    const items = Cart.items();
    const q = await api.post('/api/cart/quote', { items, coupon: Cart.coupon || null });
    // Sincroniza el carrito con lo que realmente está disponible
    if (q.warnings && q.warnings.length) {
      const lineMap = new Map(q.lines.map((l) => [l.id, l.qty]));
      Cart.save(items.filter((i) => lineMap.has(i.id)).map((i) => ({ id: i.id, qty: lineMap.get(i.id) })));
    }
    return q;
  }

  async function viewCart({ isCurrent }) {
    setTitle('Carrito');
    const render = async (couponAttempt = false) => {
      if (!Cart.items().length) {
        app.innerHTML = `<div class="container page"><h1 class="page-title">Tu carrito</h1><div class="card mt-3">${emptyState('cart', 'Tu carrito está vacío', 'Descubre nuestros productos y agrega tus favoritos.', '<a class="btn btn-primary" href="#/tienda">Ir a la tienda</a>')}</div></div>`;
        return;
      }
      const q = await getQuote();
      if (!isCurrent()) return;
      if (couponAttempt) {
        if (q.coupon) toast(`Cupón ${q.coupon.code} aplicado`, 'success');
        else if (q.coupon_error) toast(q.coupon_error, 'error');
      }
      if (!q.lines.length) { Cart.save([]); return render(); }
      app.innerHTML = `<div class="container page">
        <h1 class="page-title">Tu carrito <span class="muted" style="font-weight:500;font-size:18px">(${Cart.count()} producto${Cart.count() === 1 ? '' : 's'})</span></h1>
        ${q.warnings.length ? `<div class="alert alert-warning mt-2">${icon('alert')}<div>${q.warnings.map((w) => esc(w.message)).join('<br>')}. Ajustamos tu carrito.</div></div>` : ''}
        <div class="cart-layout mt-3">
          <div class="card cart-items">${q.lines.map((l) => `
            <div class="cart-item">
              <a href="#/producto/${esc(l.slug)}">${img(l.image, l.name)}</a>
              <div>
                <a class="cart-item-name" href="#/producto/${esc(l.slug)}">${esc(l.name)}</a>
                ${l.promo ? `<span class="badge b-success plain" style="margin:4px 0">${esc(l.promo.name)} −${l.promo.pct}%</span>` : ''}
                <div class="muted small">${money(l.price)} c/u${l.compare_price > l.price ? ` <s>${money(l.compare_price)}</s>` : ''}${l.stock <= 5 ? ` · <span style="color:var(--warning)">Quedan ${l.stock}</span>` : ''}</div>
                <div class="cart-item-actions">
                  <div class="qty sm"><button type="button" data-dec="${l.id}" ${l.qty <= 1 ? 'disabled' : ''} aria-label="Menos">${icon('minus', 'icon-sm')}</button><input type="number" value="${l.qty}" min="1" max="${l.stock}" data-qty="${l.id}" data-max="${l.stock}" aria-label="Cantidad"><button type="button" data-inc="${l.id}" ${l.qty >= l.stock ? 'disabled' : ''} aria-label="Más">${icon('plus', 'icon-sm')}</button></div>
                  <button class="link-btn" type="button" data-remove="${l.id}">${icon('trash')} Eliminar</button>
                </div>
              </div>
              <div class="right"><b style="font-size:16px">${money(l.total)}</b></div>
            </div>`).join('')}
          </div>
          <aside class="card card-pad summary"><h3>Resumen del pedido</h3>${summaryHtml(q)}
            <a href="#/checkout" class="btn btn-primary btn-lg btn-block mt-2">Finalizar compra ${icon('arrowRight')}</a>
            <a href="#/tienda" class="btn btn-ghost btn-block mt-1">Seguir comprando</a>
            <div class="secure-note">${icon('lock')} Tus datos están protegidos</div>
          </aside>
        </div></div>`;
      const qtyOf = (id) => (Cart.items().find((i) => i.id === id) || {}).qty || 0;
      $$('[data-inc]').forEach((b) => b.addEventListener('click', () => { const id = +b.dataset.inc; Cart.set(id, qtyOf(id) + 1); render(); }));
      $$('[data-dec]').forEach((b) => b.addEventListener('click', () => { const id = +b.dataset.dec; Cart.set(id, Math.max(1, qtyOf(id) - 1)); render(); }));
      $$('[data-qty]').forEach((inp) => inp.addEventListener('change', () => {
        const v = Math.max(1, Math.min(+inp.dataset.max, parseInt(inp.value, 10) || 1));
        Cart.set(+inp.dataset.qty, v); render();
      }));
      $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { Cart.remove(+b.dataset.remove); toast('Producto eliminado'); render(); }));
      bindCoupon(render);
    };
    await render();
  }

  const SHIP_ICON = { shalom: 'package', delivery: 'truck', pickup: 'store', custom: 'truck' };

  /* ------------------------------ Pago por WhatsApp ------------------------------ */
  const waNumber = () => String(state.settings.whatsapp || '').replace(/\D/g, '');
  const waLink = (msg) => `https://wa.me/${waNumber()}?text=${encodeURIComponent(msg)}`;
  function payInfo(method) {
    const s = state.settings;
    if (method === 'yape') return `Pago: Yape / Plin al ${s.yape_number || ''}`;
    if (method === 'transferencia') return `Pago: transferencia bancaria (${s.bank_info || ''})`;
    if (method === 'contraentrega') return 'Pago: contra entrega';
    return `Pago: ${methodLabel(method)}`;
  }
  function waOrderMessage(o) {
    const s = state.settings;
    const ship = o.shipping_type === 'pickup' ? 'Recojo en tienda'
      : `${o.shipping_method || 'Envío'}${o.shipping_agency ? ` · ${o.shipping_agency}` : ''}${o.city ? ` · ${o.city}${o.region ? ', ' + o.region : ''}` : ''}`;
    return [
      `Hola ${s.store_name} 👋, acabo de hacer el pedido *${o.code}*.`,
      '',
      ...o.items.map((it) => `• ${it.qty} × ${it.name} — ${money(it.total)}`),
      o.discount ? `Descuento: −${money(o.discount)}` : null,
      `Envío: ${ship} — ${o.shipping ? money(o.shipping) : 'Gratis'}`,
      `*Total: ${money(o.total)}*`,
      '',
      payInfo(o.payment_method),
      `A nombre de: ${o.customer_name}${o.document ? ` (DNI ${o.document})` : ''}`,
      o.payment_method === 'contraentrega' ? 'Quisiera coordinar la entrega.' : (s.wa_message_extra || 'Adjunto la captura de mi pago.'),
      '',
      `Pedido: ${location.origin}/#/pedido/${o.code}${o.token ? `?token=${o.token}` : ''}`,
    ].filter((x) => x !== null).join('\n');
  }

  function openPage(key, title) {
    UI.modal({ title, size: 'lg', body: `<div class="page-text">${esc(pageText(key))}</div>`, footer: '<button class="btn btn-primary" type="button" data-close>Entendido</button>' });
  }

  async function viewCheckout({ isCurrent }) {
    setTitle('Finalizar compra');
    if (!Cart.items().length) { go('#/carrito'); return; }
    const u = state.user || {};
    const ck = { region: u.region || '', method: null, receipt: 'boleta' };
    const q0 = await getQuote();
    if (!isCurrent()) return;
    if (!q0.lines.length) { go('#/carrito'); return; }
    const m = state.methods;
    const regions = state.regions.length ? state.regions : REGIONS;
    app.innerHTML = `<div class="container page">
      <nav class="breadcrumb"><a href="#/carrito">Carrito</a>${icon('chevronRight')}<span>Finalizar compra</span></nav>
      <h1 class="page-title">Finalizar compra</h1>
      ${q0.warnings.length ? `<div class="alert alert-warning mt-2">${icon('alert')}<div>${q0.warnings.map((w) => esc(w.message)).join('<br>')}. Revisa tu pedido.</div></div>` : ''}
      ${!state.user ? `<div class="alert alert-info mt-2">${icon('user')}<div>¿Ya tienes cuenta? <a href="#/login?next=checkout" style="font-weight:600;text-decoration:underline">Inicia sesión</a>. También puedes comprar como invitado o crear tu cuenta aquí mismo.</div></div>` : ''}
      <form class="checkout mt-3" id="checkout-form" novalidate>
        <div>
          <section class="card card-pad step-card">
            <div class="step-title"><i>1</i>Datos de contacto</div>
            <div class="form-grid">
              <label class="field full"><span>Nombre completo *</span><input class="input" name="customer_name" required minlength="3" maxlength="100" autocomplete="name" value="${esc(u.name || '')}"></label>
              <label class="field"><span>Correo electrónico *</span><input class="input" name="email" type="email" required maxlength="160" autocomplete="email" value="${esc(u.email || '')}"></label>
              <label class="field"><span>Celular / WhatsApp *</span><input class="input" name="phone" type="tel" required minlength="6" maxlength="30" autocomplete="tel" inputmode="tel" value="${esc(u.phone || '')}"></label>
              ${!state.user ? `<label class="check full"><input type="checkbox" id="create-account"> Crear mi cuenta con estos datos para seguir mis pedidos</label>
              <label class="field full" id="pw-row" hidden><span>Crea una contraseña *</span><input class="input" id="new-password" type="password" minlength="8" autocomplete="new-password"><small>Mínimo 8 caracteres, con letras y números.</small>
                <span class="check small mt-1" style="font-weight:400"><input type="checkbox" id="ck-marketing"> Quiero recibir ofertas y novedades (opcional)</span></label>` : ''}
            </div>
          </section>
          <section class="card card-pad step-card">
            <div class="step-title"><i>2</i>Entrega</div>
            <div class="form-grid">
              <label class="field full"><span>Departamento *</span><select class="select" name="region" id="ck-region" required><option value="">Selecciona tu departamento</option>${regions.map((r) => `<option ${r === ck.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
            </div>
            <div class="ship-options mt-2" id="ship-options"></div>
            <div class="form-grid mt-2" id="ship-fields">
              <label class="field full" data-show="shalom"><span>Agencia Shalom de destino *</span><input class="input" name="shipping_agency" maxlength="160" placeholder="Ej: Shalom Cusco – Av. de la Cultura" data-req="shalom"><small>Escribe la agencia donde recogerás. Te enviaremos el N° de orden y la clave por WhatsApp.</small></label>
              <label class="field full" data-show="address"><span>Dirección *</span><input class="input" name="address" minlength="5" maxlength="200" autocomplete="street-address" placeholder="Av. / Calle, número, dpto." value="${esc(u.address || '')}" data-req="address"></label>
              <label class="field" data-show="address shalom"><span>Ciudad / Distrito *</span><input class="input" name="city" maxlength="80" autocomplete="address-level2" value="${esc(u.city || '')}" data-req="address shalom"></label>
              <label class="field" data-show="address"><span>Referencia</span><input class="input" name="reference" maxlength="200" placeholder="Cerca de…, color de fachada, etc."></label>
              <div class="full alert alert-info" data-show="pickup">${icon('store')}<div>Recoge en: <b>${esc(state.settings.address || 'nuestra tienda')}</b>. Te avisaremos por WhatsApp cuando esté listo.</div></div>
              <label class="field full"><span>Notas del pedido</span><textarea class="textarea" name="notes" maxlength="500" rows="2" placeholder="Indicaciones para la entrega (opcional)"></textarea></label>
            </div>
          </section>
          <section class="card card-pad step-card">
            <div class="step-title"><i>3</i>Boleta de venta</div>
            <div class="form-grid">
              <label class="field"><span id="dni-label">DNI / CE (opcional)</span><input class="input" name="document_dni" maxlength="12" inputmode="numeric" autocomplete="off"><small>La boleta sale a nombre de ${'<b id="dni-name">quien compra</b>'}.</small></label>
            </div>
          </section>
          <section class="card card-pad step-card">
            <div class="step-title"><i>4</i>Pago por WhatsApp</div>
            <div class="wa-steps">
              <div><span>1</span>Confirmas tu pedido</div>
              <div><span>2</span>Se abre WhatsApp con tu pedido y el total</div>
              <div><span>3</span>Pagas y nos envías la captura</div>
              <div><span>4</span>Verificamos y recibes tu boleta</div>
            </div>
            <div class="pay-options mt-2">${m.map((pm, i) => `<label class="pay-opt"><input type="radio" name="payment_method" value="${esc(pm.id)}" ${i === 0 ? 'checked' : ''}><div><b>${esc(pm.label)}</b><span>${esc(pm.description)}</span></div>${icon(pm.id === 'transferencia' ? 'bank' : pm.id === 'yape' ? 'smartphone' : pm.id === 'contraentrega' ? 'cash' : 'credit')}</label>`).join('')}</div>
          </section>
        </div>
        <aside class="card card-pad summary">
          <h3>Tu pedido</h3>
          <div class="mini-items">${q0.lines.map((l) => `<div class="mini-item"><div class="img">${img(l.image, l.name)}<span class="q">${l.qty}</span></div><span class="n">${esc(l.name)}${l.promo ? `<br><small class="muted">${esc(l.promo.name)} −${l.promo.pct}%</small>` : ''}</span><b>${money(l.total)}</b></div>`).join('')}</div>
          <div id="checkout-summary">${summaryHtml(q0)}</div>
          <label class="check mt-2 small"><input type="checkbox" name="terms" required> <span>Acepto los <a href="#" data-page="page_terms" style="text-decoration:underline">términos y condiciones</a>, la <a href="#" data-page="page_returns" style="text-decoration:underline">política de cambios</a> y el tratamiento de mis datos según la <a href="#" data-page="page_privacy" style="text-decoration:underline">política de privacidad</a>.</span></label>
          <button class="btn btn-wa btn-lg btn-block mt-2" type="submit" id="place-order" data-loading="Procesando…">${icon('whatsapp')} Confirmar y pagar por WhatsApp · ${money(q0.total)}</button>
          <div class="secure-note">${icon('shield')} No cobramos nada aquí: pagas por Yape/Plin o transferencia y envías la captura</div>
        </aside>
      </form>
    </div>`;

    const form = $('#checkout-form');
    let current = q0;
    const methodById = (id) => (current.methods || []).find((x) => x.id === id);

    async function refresh(couponAttempt) {
      const base = current.subtotal - current.discount;
      const sm = await api.get(`/api/shipping-methods${qs({ region: ck.region, amount: base })}`);
      current.methods = sm.items;
      const avail = sm.items.filter((x) => x.available);
      if (!avail.find((x) => x.id === ck.method)) ck.method = avail.length ? avail[0].id : null;
      $('#ship-options').innerHTML = !ck.region ? `<p class="muted small">Elige tu departamento para ver las opciones y precios de envío.</p>`
        : sm.items.map((x) => `<label class="ship-opt ${x.available ? '' : 'disabled'}"><input type="radio" name="shipping_method_id" value="${x.id}" ${x.id === ck.method ? 'checked' : ''} ${x.available ? '' : 'disabled'}>
          <span class="ship-ic">${icon(SHIP_ICON[x.type] || 'truck')}</span>
          <div><b>${esc(x.name)}</b><span>${esc(x.description || '')}${x.eta ? ` · ${esc(x.eta)}` : ''}</span>${!x.available ? `<span class="muted">No disponible en ${esc(ck.region)}</span>` : x.free_from > 0 && !x.free ? `<span class="free-hint">Gratis desde ${money(x.free_from)}</span>` : ''}</div>
          <b class="ship-price">${!x.available ? '—' : x.cost ? money(x.cost) : 'Gratis'}</b></label>`).join('') || '<p class="muted">No hay métodos de envío disponibles.</p>';
      $$('[name=shipping_method_id]', form).forEach((r) => r.addEventListener('change', () => { ck.method = +r.value; refresh(); }));
      applyVisibility();
      const nq = await api.post('/api/cart/quote', { items: Cart.items(), coupon: Cart.coupon || null, shipping_method_id: ck.method, region: ck.region });
      nq.methods = current.methods;
      current = nq;
      if (couponAttempt) { if (nq.coupon) toast(`Cupón ${nq.coupon.code} aplicado`, 'success'); else if (nq.coupon_error) toast(nq.coupon_error, 'error'); }
      $('#checkout-summary').innerHTML = summaryHtml(nq);
      $('#place-order').innerHTML = `${icon('whatsapp')} Confirmar y pagar por WhatsApp · ${money(nq.total)}`;
      bindCoupon(refresh);
    }

    function applyVisibility() {
      const mt = (methodById(ck.method) || {}).type;
      const mode = mt === 'shalom' ? 'shalom' : mt === 'pickup' ? 'pickup' : mt ? 'address' : 'none';
      $$('[data-show]', form).forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(mode); });
      $('#dni-label').textContent = mode === 'shalom' ? 'DNI / CE de quien recoge *' : 'DNI / CE (opcional)';
      ck.mode = mode;
    }

    $('#ck-region').addEventListener('change', (e) => { ck.region = e.target.value; refresh(); });
    form.elements.customer_name.addEventListener('input', (e) => { $('#dni-name').textContent = e.target.value.trim() || 'quien compra'; });
    if (form.elements.customer_name.value) $('#dni-name').textContent = form.elements.customer_name.value;
    const ca = $('#create-account');
    if (ca) ca.addEventListener('change', () => { $('#pw-row').hidden = !ca.checked; });
    $$('[data-page]', form).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openPage(a.dataset.page, a.textContent); }));
    form.addEventListener('input', (e) => e.target.classList.remove('invalid'));
    form.addEventListener('change', (e) => e.target.classList.remove('invalid'));
    await refresh();

    form.addEventListener('submit', async (e) => {
      if (e.target !== form) return;
      e.preventDefault();
      applyVisibility();
      const bad = [];
      const need = (el, ok) => { if (!ok) { el.classList.add('invalid'); bad.push(el); } };
      ['customer_name', 'email', 'phone'].forEach((n) => { const el = form.elements[n]; need(el, el.checkValidity() && el.value.trim()); });
      need($('#ck-region'), !!ck.region);
      if (!ck.method) { toast('Elige un método de envío', 'error'); return; }
      $$('[data-req]', form).forEach((el) => { if (el.dataset.req.split(' ').includes(ck.mode)) need(el, el.value.trim().length >= (el.minLength > 0 ? el.minLength : 1)); });
      const dni = form.elements.document_dni;
      if (ck.mode === 'shalom' || dni.value.trim()) need(dni, /^[A-Za-z0-9]{8,12}$/.test(dni.value.trim()));
      const pw = $('#new-password');
      if (ca && ca.checked) need(pw, pw.value.length >= 8 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value));
      if (bad.length) { toast(bad[0] === pw ? 'La contraseña debe tener 8+ caracteres con letras y números' : 'Revisa los campos marcados', 'error'); bad[0].focus(); return; }
      if (!form.elements.terms.checked) { toast('Debes aceptar los términos y condiciones', 'error'); form.elements.terms.focus(); return; }

      const d = formData(form);
      const payload = {
        customer_name: d.customer_name, email: d.email, phone: d.phone, region: ck.region,
        address: ck.mode === 'address' ? d.address : '', city: ck.mode === 'pickup' ? '' : d.city, reference: ck.mode === 'address' ? d.reference : '',
        notes: d.notes, shipping_method_id: ck.method, shipping_agency: ck.mode === 'shalom' ? d.shipping_agency : '',
        receipt_type: 'boleta', document: d.document_dni,
        payment_method: d.payment_method, items: Cart.items(), coupon: Cart.coupon || null,
      };
      await withLoading($('#place-order'), async () => {
        try {
          if (ca && ca.checked && !state.user) {
            try {
              const r = await api.post('/api/auth/register', { name: d.customer_name, email: d.email, phone: d.phone, password: pw.value, privacy: true, marketing: $('#ck-marketing').checked });
              localStorage.setItem('ns_token', r.token); state.user = r.user; renderHeader();
              toast('Cuenta creada', 'success');
            } catch (err) {
              toast(err.status === 409 ? 'Ya existe una cuenta con ese correo. Inicia sesión o desmarca “Crear mi cuenta”.' : err.message, 'error', 6000);
              return;
            }
          }
          const res = await api.post('/api/orders', payload);
          if (res.payment && res.payment.redirectUrl) { Cart.clear(); location.href = res.payment.redirectUrl; return; }
          const mt = methodById(ck.method) || {};
          const msg = waOrderMessage({
            code: res.order.code, token: res.order.token, items: current.lines, discount: current.discount,
            shipping: current.shipping, shipping_method: mt.name, shipping_type: mt.type, shipping_agency: payload.shipping_agency,
            city: payload.city, region: ck.region, total: res.order.total, payment_method: payload.payment_method,
            customer_name: payload.customer_name, document: payload.document,
          });
          Cart.clear();
          let opened = false;
          if (state.settings.wa_auto_open !== '0' && waNumber()) {
            try { const w = window.open(waLink(msg), '_blank'); if (w) { w.opener = null; opened = true; } } catch { opened = false; }
          }
          sessionStorage.setItem(`wa_${res.order.code}`, msg);
          go(`#/pedido/${encodeURIComponent(res.order.code)}?token=${encodeURIComponent(res.order.token)}&nuevo=1${opened ? '&wa=1' : ''}`);
        } catch (err) {
          toast(err.message, 'error', 5000);
          if (err.status === 409) setTimeout(() => go('#/carrito'), 1200);
        }
      });
    });
  }

  async function viewOrder({ parts, query, isCurrent }) {
    const code = parts[1] || '';
    const tokenQ = query.get('token') || '';
    app.innerHTML = `<div class="container page"><div class="skeleton" style="height:240px"></div></div>`;
    const { order: o, instructions } = await api.get(`/api/orders/${encodeURIComponent(code)}${qs({ token: tokenQ })}`);
    if (!isCurrent()) return;
    setTitle(`Pedido ${o.code}`);
    const steps = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado'];
    const idx = steps.indexOf(o.status);
    const stepIcons = ['receipt', 'check', 'package', 'truck', 'home'];
    const isNew = query.get('nuevo') === '1';
    app.innerHTML = `<div class="container page">
      ${isNew ? `<div class="success-hero"><div class="success-ic">${icon('check')}</div><h1 class="page-title">¡Gracias por tu compra!</h1><p class="muted mt-1">Recibimos tu pedido. Te enviaremos novedades a <b>${esc(o.email)}</b>.</p><span class="order-code">${icon('receipt', 'icon-sm')} ${esc(o.code)}</span></div>`
        : `<nav class="breadcrumb"><a href="#/">Inicio</a>${icon('chevronRight')}${state.user ? `<a href="#/cuenta/pedidos">Mis pedidos</a>${icon('chevronRight')}` : ''}<span>${esc(o.code)}</span></nav>
        <div class="flex between" style="flex-wrap:wrap;margin-bottom:20px"><div><h1 class="page-title">Pedido ${esc(o.code)}</h1><p class="muted">Realizado el ${fmtDate(o.created_at, true)}</p></div><div class="flex">${statusBadge(o.status)}${payBadge(o.payment_status)}</div></div>`}
      <div class="order-grid">
        <div style="display:flex;flex-direction:column;gap:20px">
          ${o.payment_status === 'pendiente' && o.status !== 'cancelado' ? `<section class="card card-pad wa-next">
            <div class="wa-next-head"><span class="wa-badge">${icon('whatsapp')}</span><div><h3>${o.payment_method === 'contraentrega' ? 'Coordina tu entrega por WhatsApp' : 'Envíanos la captura de tu pago'}</h3>
            <p class="muted small">${query.get('wa') === '1' ? 'Abrimos WhatsApp en otra pestaña. Si no se abrió, usa el botón.' : 'Tu pedido está reservado. Escríbenos por WhatsApp para completarlo.'}</p></div></div>
            ${instructions ? `<div class="alert alert-info mt-2">${icon('info')}<div class="instructions">${esc(instructions)}</div></div>` : ''}
            ${waNumber() ? `<a class="btn btn-wa btn-lg btn-block mt-2" target="_blank" rel="noopener" href="${esc(waLink(sessionStorage.getItem(`wa_${o.code}`) || waOrderMessage({ ...o, token: tokenQ })))}">${icon('whatsapp')} ${o.payment_method === 'contraentrega' ? 'Escribir por WhatsApp' : 'Enviar captura por WhatsApp'}</a>` : ''}
            <p class="muted small mt-1" style="text-align:center">${icon('receipt', 'icon-sm')} Tu boleta aparecerá aquí cuando verifiquemos el pago.</p>
          </section>` : ''}
          ${o.status === 'cancelado' ? `<div class="alert alert-danger">${icon('alert')}<div>Este pedido fue cancelado. Si tienes dudas, contáctanos.</div></div>`
            : `<section class="card card-pad"><h3 style="font-size:16px;margin-bottom:18px">Estado del pedido</h3>
            <div class="timeline"><span class="bar" style="width:calc(${(Math.max(0, idx) / (steps.length - 1)) * 100}% - ${(Math.max(0, idx) / (steps.length - 1)) * 36}px)"></span>
              ${steps.map((s, i) => { const done = i < idx || (i === idx && i === steps.length - 1); const cur = i === idx && !done; return `<div class="tl-step ${done ? 'done' : cur ? 'current' : ''}"><span class="tl-dot">${icon(done ? 'check' : stepIcons[i])}</span>${esc(state.statuses[s] || s)}</div>`; }).join('')}
            </div></section>`}

          <section class="card">
            <div class="card-pad" style="padding-bottom:6px"><h3 style="font-size:16px">Productos</h3></div>
            ${o.items.map((it) => `<div class="cart-item" style="grid-template-columns:64px 1fr auto;padding:14px 22px">${img(it.image, it.name)}<div><b style="font-weight:600">${esc(it.name)}</b><div class="muted small">${it.qty} × ${money(it.price)}</div></div><b>${money(it.total)}</b></div>`).join('')}
          </section>
          ${o.events.length ? `<section class="card card-pad"><h3 style="font-size:16px;margin-bottom:16px">Historial</h3><div class="events">${o.events.slice().reverse().map((e) => `<div class="event"><i></i><div>${esc(e.message)}<small>${fmtDate(e.created_at, true)}</small></div></div>`).join('')}</div></section>` : ''}
        </div>
        <aside style="display:flex;flex-direction:column;gap:20px">
          <section class="card card-pad"><h3 style="font-size:16px;margin-bottom:12px">Resumen</h3>
            <div class="sum-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
            ${o.discount ? `<div class="sum-row discount"><span>Descuento${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</span><span>−${money(o.discount)}</span></div>` : ''}
            <div class="sum-row"><span>Envío</span><span>${o.shipping ? money(o.shipping) : 'Gratis'}</span></div>
            ${o.tax && state.settings.tax_included !== '1' ? `<div class="sum-row"><span>${esc(state.settings.tax_label)}</span><span>${money(o.tax)}</span></div>` : ''}
            <div class="sum-total"><span>Total</span><b>${money(o.total)}</b></div>
            ${o.tax && state.settings.tax_included === '1' ? `<p class="muted small right">Incluye ${esc(state.settings.tax_label)} ${money(o.tax)}</p>` : ''}
            <div class="sum-row mt-1"><span>Pago</span><span>${esc(methodLabel(o.payment_method))}</span></div>
            <div class="sum-row"><span>Estado de pago</span><span>${payBadge(o.payment_status)}</span></div>
          </section>
          <section class="card card-pad"><h3 style="font-size:16px;margin-bottom:12px">Entrega${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ''}</h3>
            <p><b>${esc(o.customer_name)}</b></p>
            ${o.shipping_type === 'pickup' ? `<p class="muted">Recojo en tienda: ${esc(state.settings.address || '')}</p>`
              : o.shipping_type === 'shalom' ? `<p class="muted">Agencia: ${esc(o.shipping_agency || '')}<br>${esc(o.city)}${o.region ? `, ${esc(o.region)}` : ''}</p>`
                : `<p class="muted">${esc(o.address)}<br>${esc(o.city)}${o.region ? `, ${esc(o.region)}` : ''}${o.reference ? `<br>Ref.: ${esc(o.reference)}` : ''}</p>`}
            <p class="muted mt-1">${esc(o.phone)} · ${esc(o.email)}</p>
            ${o.tracking_code ? `<div class="tracking-box mt-2">${icon('truck')}<div><small>N° de guía / orden</small><b>${esc(o.tracking_code)}</b></div>${o.tracking_url ? `<a class="btn btn-sm" href="${esc(o.tracking_url)}" target="_blank" rel="noopener">Rastrear</a>` : ''}</div>` : o.shipping_type === 'shalom' && o.status !== 'cancelado' ? '<p class="small muted mt-1">Te enviaremos el N° de orden Shalom y la clave por WhatsApp cuando despachemos.</p>' : ''}
          </section>
          <section class="card card-pad"><h3 style="font-size:16px;margin-bottom:6px">Boleta de venta</h3>
            ${o.payment_status === 'pagado' && o.receipt_number ? `<p class="small" style="color:var(--success);font-weight:600">${icon('check', 'icon-sm')} Pago verificado · ${esc(o.receipt_number)}</p>
            <a class="btn btn-primary btn-block mt-1" href="#/comprobante/${esc(o.code)}?token=${esc(tokenQ)}">${icon('receipt')} Ver / descargar boleta</a>`
              : `<p class="muted small">${o.status === 'cancelado' ? 'Pedido cancelado.' : 'Se emite cuando verifiquemos tu pago.'}</p>`}
          </section>
          ${isNew ? `<a class="btn btn-dark btn-block" href="#/tienda">Seguir comprando</a>` : `<a class="btn btn-ghost btn-block small" href="#/libro-reclamaciones?pedido=${esc(o.code)}">${UI.bi('journal-bookmark-fill', 'icon-sm')} ¿Algún problema? Libro de Reclamaciones</a>`}
        </aside>
      </div>
    </div>`;
  }

  function authLayout(title, subtitle, formHtml, alt) {
    return `<div class="container page"><div class="auth-wrap"><div class="card auth-card">
      <h1>${esc(title)}</h1><p class="muted mt-1">${esc(subtitle)}</p>${formHtml}</div>
      <p class="auth-alt">${alt}</p></div></div>`;
  }

  function afterLogin(query) {
    const next = query.get('next');
    renderHeader();
    if (next === 'checkout') go('#/checkout');
    else if (state.user.role === 'admin' && next === 'admin') location.href = '/admin';
    else go('#/cuenta');
  }

  function viewLogin({ query }) {
    if (state.user) { go('#/cuenta'); return; }
    setTitle('Iniciar sesión');
    const next = query.get('next') ? `?next=${encodeURIComponent(query.get('next'))}` : '';
    app.innerHTML = authLayout('Bienvenido de nuevo', 'Ingresa a tu cuenta para ver tus pedidos.', `
      <form id="login-form" novalidate>
        <label class="field"><span>Correo electrónico</span><input class="input" name="email" type="email" required autocomplete="email"></label>
        <label class="field"><span>Contraseña</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Ingresando…">Ingresar</button>
      </form>
      <div class="alert alert-info demo-hint">${icon('info')}<div>Cuenta demo: <b>cliente@tienda.com</b> / <b>Cliente123!</b></div></div>`,
    `¿No tienes cuenta? <a href="#/registro${next}">Crea una gratis</a>`);
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.email || !d.password) { toast('Completa correo y contraseña', 'error'); return; }
      await withLoading(e.submitter || $('button[type=submit]', e.target), async () => {
        try {
          const res = await api.post('/api/auth/login', d);
          localStorage.setItem('ns_token', res.token);
          state.user = res.user;
          toast(`Hola, ${res.user.name.split(' ')[0]}`, 'success');
          afterLogin(query);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  function viewRegister({ query }) {
    if (state.user) { go('#/cuenta'); return; }
    setTitle('Crear cuenta');
    const next = query.get('next') ? `?next=${encodeURIComponent(query.get('next'))}` : '';
    app.innerHTML = authLayout('Crea tu cuenta', 'Compra más rápido y sigue tus pedidos.', `
      <form id="reg-form" novalidate>
        <label class="field"><span>Nombre completo</span><input class="input" name="name" required minlength="2" maxlength="80" autocomplete="name"></label>
        <label class="field"><span>Correo electrónico</span><input class="input" name="email" type="email" required autocomplete="email"></label>
        <label class="field"><span>Teléfono <small>(opcional)</small></span><input class="input" name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
        <label class="field"><span>Contraseña</span><input class="input" name="password" type="password" required minlength="8" autocomplete="new-password"><small>Mínimo 8 caracteres, con letras y números.</small></label>
        <label class="check small"><input type="checkbox" name="privacy"> <span>He leído y acepto la <a href="#" data-page="page_privacy" style="text-decoration:underline">política de privacidad</a> y los <a href="#" data-page="page_terms" style="text-decoration:underline">términos y condiciones</a>.</span></label>
        <label class="check small"><input type="checkbox" name="marketing"> <span>Quiero recibir ofertas y novedades por correo o WhatsApp (opcional).</span></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Creando cuenta…">Crear cuenta</button>
      </form>`,
    `¿Ya tienes cuenta? <a href="#/login${next}">Inicia sesión</a>`);
    $$('#reg-form [data-page]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openPage(a.dataset.page, a.textContent); }));
    $('#reg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.privacy) { toast('Debes aceptar la política de privacidad para crear tu cuenta', 'error'); return; }
      await withLoading($('button[type=submit]', e.target), async () => {
        try {
          const res = await api.post('/api/auth/register', d);
          localStorage.setItem('ns_token', res.token);
          state.user = res.user;
          toast('¡Cuenta creada con éxito!', 'success');
          afterLogin(query);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  async function viewAccount({ parts, isCurrent }) {
    if (!state.user) { go('#/login'); return; }
    const tab = ['pedidos', 'privacidad'].includes(parts[1]) ? parts[1] : 'perfil';
    setTitle('Mi cuenta');
    const u = state.user;
    app.innerHTML = `<div class="container page"><h1 class="page-title" style="margin-bottom:24px">Mi cuenta</h1>
      <div class="account">
        <aside class="card acc-nav">
          <div class="acc-user"><span class="avatar">${esc(u.name.charAt(0).toUpperCase())}</span><div><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div></div>
          <a href="#/cuenta" class="${tab === 'perfil' ? 'active' : ''}">${icon('user')} Mis datos</a>
          <a href="#/cuenta/pedidos" class="${tab === 'pedidos' ? 'active' : ''}">${icon('package')} Mis pedidos</a>
          <a href="#/cuenta/privacidad" class="${tab === 'privacidad' ? 'active' : ''}">${icon('shield')} Privacidad</a>
          ${u.role === 'admin' ? `<a href="/admin">${icon('settings')} Panel de administración</a>` : ''}
          <button type="button" id="logout">${icon('logout')} Cerrar sesión</button>
        </aside>
        <section id="acc-body"><div class="skeleton" style="height:300px"></div></section>
      </div></div>`;
    $('#logout').addEventListener('click', logout);

    if (tab === 'privacidad') {
      $('#acc-body').innerHTML = `<div class="card card-pad">
        <h3 style="font-size:17px">Tus datos personales</h3>
        <p class="muted small mt-1">Conforme a la Ley N° 29733 puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos. Lee nuestra <a href="#/pagina/privacidad" style="text-decoration:underline">política de privacidad</a>.</p>
        <label class="switch mt-3"><input type="checkbox" id="mk-toggle" ${u.marketing_consent ? 'checked' : ''}><i></i> Recibir ofertas y novedades por correo o WhatsApp</label>
        <div class="priv-actions mt-3">
          <div><b>Descargar mis datos</b><p class="muted small">Obtén un archivo con tu cuenta, pedidos y reclamaciones.</p><button class="btn mt-1" type="button" id="dl-data">${icon('download')} Descargar</button></div>
          <div><b>Rectificar mis datos</b><p class="muted small">Corrige tu nombre, teléfono o dirección en “Mis datos”.</p><a class="btn mt-1" href="#/cuenta">${icon('edit')} Ir a mis datos</a></div>
          <div class="danger-zone"><b>Eliminar mi cuenta</b><p class="muted small">Se borran tus datos de contacto. Los pedidos se conservan sin vínculo a tu cuenta por obligación tributaria.</p><button class="btn btn-danger mt-1" type="button" id="del-acc">${icon('trash')} Eliminar cuenta</button></div>
        </div></div>`;
      $('#mk-toggle').addEventListener('change', async (e) => {
        try { const r = await api.put('/api/auth/me', { name: u.name, phone: u.phone, address: u.address, city: u.city, region: u.region, marketing: e.target.checked }); state.user = r.user; toast('Preferencia guardada', 'success'); }
        catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
      });
      $('#dl-data').addEventListener('click', async () => {
        try {
          const res = await api.get('/api/auth/me/export', { raw: true });
          const blob = await res.blob(); const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'mis-datos.json'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } catch (err) { toast(err.message, 'error'); }
      });
      $('#del-acc').addEventListener('click', () => UI.modal({
        title: 'Eliminar mi cuenta', size: 'sm',
        body: '<p>Esta acción no se puede deshacer. Escribe tu contraseña para confirmar.</p><input class="input mt-2" type="password" id="del-pw" autocomplete="current-password" placeholder="Contraseña">',
        footer: '<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-danger" type="button" id="del-ok" data-loading="Eliminando…">Eliminar definitivamente</button>',
        onMount: (el, close) => $('#del-ok', el).addEventListener('click', () => withLoading($('#del-ok', el), async () => {
          try { await api.del('/api/auth/me', { password: $('#del-pw', el).value }); close(); localStorage.removeItem('ns_token'); state.user = null; renderHeader(); toast('Tu cuenta fue eliminada'); go('#/'); }
          catch (err) { toast(err.message, 'error'); }
        })),
      }));
      return;
    }

    if (tab === 'pedidos') {
      const { items } = await api.get('/api/orders/mine');
      if (!isCurrent()) return;
      $('#acc-body').innerHTML = `<div class="card">${items.length ? `
        <div class="order-row muted small" style="font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:12px"><span>Pedido</span><span>Fecha</span><span>Estado</span><span>Total</span><span></span></div>
        ${items.map((o) => `<div class="order-row"><div><b>${esc(o.code)}</b><div class="muted small">${o.items_count} producto${o.items_count === 1 ? '' : 's'}</div></div><span>${fmtDate(o.created_at)}</span><span>${statusBadge(o.status)}</span><b>${money(o.total)}</b><a class="btn btn-sm" href="#/pedido/${esc(o.code)}?token=${esc(o.token)}">Ver detalle</a></div>`).join('')}`
        : emptyState('package', 'Aún no tienes pedidos', 'Cuando compres, verás aquí el seguimiento.', '<a class="btn btn-primary" href="#/tienda">Explorar productos</a>')}</div>`;
      return;
    }

    $('#acc-body').innerHTML = `<form class="card card-pad" id="profile-form" novalidate>
        <h3 style="font-size:17px;margin-bottom:18px">Datos personales</h3>
        <div class="form-grid">
          <label class="field"><span>Nombre completo</span><input class="input" name="name" required value="${esc(u.name)}"></label>
          <label class="field"><span>Correo</span><input class="input" value="${esc(u.email)}" disabled></label>
          <label class="field"><span>Teléfono</span><input class="input" name="phone" value="${esc(u.phone)}"></label>
          <label class="field"><span>Ciudad / Distrito</span><input class="input" name="city" value="${esc(u.city)}"></label>
          <label class="field full"><span>Dirección</span><input class="input" name="address" value="${esc(u.address)}"></label>
          <label class="field"><span>Región</span><input class="input" name="region" list="regions2" value="${esc(u.region)}"><datalist id="regions2">${REGIONS.map((r) => `<option value="${r}">`).join('')}</datalist></label>
        </div>
        <h3 style="font-size:17px;margin:28px 0 6px">Cambiar contraseña</h3><p class="muted small" style="margin-bottom:16px">Déjalo en blanco si no deseas cambiarla.</p>
        <div class="form-grid">
          <label class="field"><span>Contraseña actual</span><input class="input" name="current_password" type="password" autocomplete="current-password"></label>
          <label class="field"><span>Nueva contraseña</span><input class="input" name="new_password" type="password" autocomplete="new-password"></label>
        </div>
        <div class="flex mt-3" style="justify-content:flex-end"><button class="btn btn-primary" type="submit" data-loading="Guardando…">Guardar cambios</button></div>
      </form>`;
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      await withLoading($('button[type=submit]', e.target), async () => {
        try {
          const res = await api.put('/api/auth/me', d);
          state.user = res.user;
          renderHeader();
          toast('Datos actualizados', 'success');
          e.target.current_password.value = ''; e.target.new_password.value = '';
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  function viewTrack() {
    setTitle('Rastrear pedido');
    app.innerHTML = authLayout('Rastrea tu pedido', 'Ingresa el código de tu pedido y el correo con el que compraste.', `
      <form id="track-form" novalidate>
        <label class="field"><span>Código de pedido</span><input class="input" name="code" required placeholder="PED-000000-XXXXX" style="text-transform:uppercase"></label>
        <label class="field"><span>Correo electrónico</span><input class="input" name="email" type="email" required></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Buscando…">Buscar pedido</button>
      </form>`, '<a href="#/">Volver a la tienda</a>');
    $('#track-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.code || !d.email) { toast('Completa ambos campos', 'error'); return; }
      await withLoading($('button[type=submit]', e.target), async () => {
        try {
          const r = await api.post('/api/orders/track', d);
          go(`#/pedido/${encodeURIComponent(r.code)}?token=${encodeURIComponent(r.token)}`);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  /* ------------------------------ Comprobante ------------------------------ */
  function numberToWords(n) {
    const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    const u100 = (x) => (x < 30 ? U[x] : D[Math.floor(x / 10)] + (x % 10 ? ` Y ${U[x % 10]}` : ''));
    const u1000 = (x) => (x === 100 ? 'CIEN' : `${C[Math.floor(x / 100)]} ${u100(x % 100)}`.trim());
    const apoc = (w) => w.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
    const conv = (x) => {
      if (x === 0) return 'CERO';
      const mill = Math.floor(x / 1e6); const th = Math.floor((x % 1e6) / 1000); const r = x % 1000;
      let out = '';
      if (mill) out += mill === 1 ? 'UN MILLÓN ' : `${apoc(conv(mill))} MILLONES `;
      if (th) out += th === 1 ? 'MIL ' : `${apoc(u1000(th))} MIL `;
      if (r) out += u1000(r);
      return out.trim();
    };
    const int = Math.floor(n + 1e-9);
    const cents = Math.round((n - int) * 100);
    return `${conv(int)} CON ${String(cents).padStart(2, '0')}/100`;
  }

  async function viewReceipt({ parts, query, isCurrent }) {
    const code = parts[1] || '';
    app.innerHTML = '<div class="container page"><div class="skeleton" style="height:500px;max-width:820px;margin:0 auto"></div></div>';
    const { order: o } = await api.get(`/api/orders/${encodeURIComponent(code)}${qs({ token: query.get('token') || '' })}`);
    if (!isCurrent()) return;
    const s = state.settings;
    if (o.payment_status !== 'pagado' || !o.receipt_number) {
      setTitle('Boleta pendiente');
      app.innerHTML = `<div class="container page"><div class="card card-pad" style="max-width:560px;margin:0 auto;text-align:center">
        <div class="success-ic" style="background:var(--warning-bg);color:var(--warning)">${icon('clock')}</div>
        <h1 class="page-title" style="font-size:24px">Tu boleta aún no está lista</h1>
        <p class="muted mt-1">Se emite cuando verifiquemos el pago del pedido <b>${esc(o.code)}</b>. Si ya pagaste, envíanos la captura por WhatsApp.</p>
        ${waNumber() ? `<a class="btn btn-wa btn-lg mt-3" target="_blank" rel="noopener" href="${esc(waLink(waOrderMessage({ ...o, token: query.get('token') || '' })))}">${icon('whatsapp')} Enviar captura por WhatsApp</a>` : ''}
        <div class="mt-2"><a class="btn btn-ghost" href="#/pedido/${esc(o.code)}?token=${esc(query.get('token') || '')}">${icon('arrowLeft')} Volver al pedido</a></div></div></div>`;
      return;
    }
    const docTitle = 'BOLETA DE VENTA';
    setTitle(`${docTitle} ${o.receipt_number || o.code}`);
    document.body.classList.add('receipt-mode');
    const rate = Number(s.tax_rate) || 0;
    const base = o.subtotal - o.discount;
    const gravada = s.tax_included === '1' ? base - o.tax : base;
    const logo = s.store_logo ? `<img src="${esc(s.store_logo)}" alt="${esc(s.store_name)}" class="rc-logo">` : `<span class="logo-mark" style="width:46px;height:46px;font-size:22px">${esc((s.store_name || 'T').charAt(0))}</span>`;
    app.innerHTML = `<div class="container page receipt-page">
      <div class="rc-actions no-print"><a class="btn" href="#/pedido/${esc(o.code)}?token=${esc(query.get('token') || '')}">${icon('arrowLeft')} Volver al pedido</a><button class="btn btn-primary" type="button" id="rc-print">${icon('download')} Imprimir / Guardar PDF</button></div>
      <article class="receipt">
        <header class="rc-head">
          <div class="rc-issuer">${logo}<div><b>${esc(s.company_name || s.store_name)}</b><span>${esc(s.address || '')}</span><span>${esc([s.contact_phone, s.contact_email].filter(Boolean).join(' · '))}</span></div></div>
          <div class="rc-box">${s.company_ruc ? `<span>R.U.C. ${esc(s.company_ruc)}</span>` : ''}<b>${docTitle}</b><span class="rc-num">${esc(o.receipt_number || o.code)}</span></div>
        </header>
        <section class="rc-client">
          <dl>
            <dt>Cliente</dt><dd>${esc(o.customer_name)}</dd>
            <dt>DNI / CE</dt><dd>${esc(o.document || '—')}</dd>
            <dt>Dirección</dt><dd>${o.shipping_type === 'pickup' ? 'Recojo en tienda' : o.shipping_type === 'shalom' ? esc(`Agencia ${o.shipping_agency || ''} · ${o.city}${o.region ? ', ' + o.region : ''}`) : esc(`${o.address}, ${o.city}${o.region ? ', ' + o.region : ''}`)}</dd>
          </dl>
          <dl>
            <dt>Fecha de emisión</dt><dd>${fmtDate(o.created_at, true)}</dd>
            <dt>Moneda</dt><dd>${esc(s.currency_name || s.currency)}</dd>
            <dt>Forma de pago</dt><dd>${esc(methodLabel(o.payment_method))}</dd>
            <dt>Pedido</dt><dd>${esc(o.code)}</dd>
          </dl>
        </section>
        <table class="rc-table"><thead><tr><th>Cant.</th><th>Código</th><th>Descripción</th><th class="r">P. unit.</th><th class="r">Importe</th></tr></thead><tbody>
          ${o.items.map((it) => `<tr><td>${it.qty}</td><td>${esc(it.sku || '—')}</td><td>${esc(it.name)}</td><td class="r">${money(it.price)}</td><td class="r">${money(it.total)}</td></tr>`).join('')}
          ${o.shipping ? `<tr><td>1</td><td>ENV</td><td>Servicio de envío${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ''}</td><td class="r">${money(o.shipping)}</td><td class="r">${money(o.shipping)}</td></tr>` : ''}
        </tbody></table>
        <section class="rc-bottom">
          <div class="rc-words"><small>SON:</small><b>${esc(numberToWords(o.total))} ${esc(s.currency_name || s.currency)}</b>
            ${o.coupon_code ? `<p class="muted small mt-1">Cupón aplicado: ${esc(o.coupon_code)}</p>` : ''}
            <p class="muted small mt-1">${esc(s.receipt_footer || '')}</p></div>
          <table class="rc-totals">
            ${o.discount ? `<tr><td>Descuento</td><td class="r">−${money(o.discount)}</td></tr>` : ''}
            <tr><td>Op. gravada</td><td class="r">${money(gravada)}</td></tr>
            <tr><td>${esc(s.tax_label || 'IGV')} (${rate}%)</td><td class="r">${money(o.tax)}</td></tr>
            ${o.shipping ? `<tr><td>Envío</td><td class="r">${money(o.shipping)}</td></tr>` : ''}
            <tr class="rc-total"><td>Importe total</td><td class="r">${money(o.total)}</td></tr>
          </table>
        </section>
        <footer class="rc-foot">${esc(s.store_name)} · ${esc(s.contact_email || '')} · Gracias por tu compra</footer>
      </article>
    </div>`;
    $('#rc-print').addEventListener('click', () => window.print());
  }

  const PAGES = { terminos: ['page_terms', 'Términos y condiciones'], devoluciones: ['page_returns', 'Cambios y devoluciones'], envios: ['page_shipping', 'Envíos'], privacidad: ['page_privacy', 'Política de privacidad'] };
  function pageText(key) {
    const s = state.settings;
    return String(s[key] || '')
      .replace(/\{empresa\}/g, s.company_name || s.store_name || '')
      .replace(/\{ruc_texto\}/g, s.company_ruc ? `, con RUC ${s.company_ruc}` : '')
      .replace(/\{ruc\}/g, s.company_ruc || '')
      .replace(/\{direccion\}/g, s.address || '')
      .replace(/\{correo\}/g, s.contact_email || '')
      .replace(/\{tienda\}/g, s.store_name || '')
      .replace(/\{web\}/g, location.origin);
  }
  function viewPage({ parts }) {
    const pg = PAGES[parts[1]];
    if (!pg) { viewNotFound(); return; }
    setTitle(pg[1]);
    app.innerHTML = `<div class="container page"><nav class="breadcrumb"><a href="#/">Inicio</a>${icon('chevronRight')}<span>${esc(pg[1])}</span></nav>
      <article class="card card-pad legal"><h1 class="page-title">${esc(pg[1])}</h1><div class="page-text mt-2">${esc(pageText(pg[0]))}</div></article></div>`;
  }

  /* ------------------------------ Libro de Reclamaciones ------------------------------ */
  const LR_LEGAL = 'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles improrrogables.';
  const LR_DEFS = '<b>Reclamo:</b> disconformidad relacionada a los productos o servicios. <b>Queja:</b> disconformidad no relacionada a los productos o servicios, o malestar o descontento respecto a la atención al público.';

  function lrHeader(p, number, date) {
    return `<div class="lr-head">
      <div class="lr-title"><span class="lr-seal-ic">${UI.bi('journal-bookmark-fill')}</span><div><b>LIBRO DE RECLAMACIONES</b><span>Hoja de Reclamación Virtual</span></div></div>
      <div class="lr-num"><small>N°</small><b>${esc(number || 'Se asigna al enviar')}</b><small>Fecha: ${esc(date)}</small></div>
    </div>
    <div class="lr-provider"><b>${esc(p.company_name || p.store_name || '')}</b>${p.company_ruc ? ` · RUC ${esc(p.company_ruc)}` : ''}<br><span>${esc(p.address || '')}</span></div>`;
  }

  async function viewComplaints({ parts, query, isCurrent }) {
    if (parts[1]) return viewComplaintSheet({ parts, query, isCurrent });
    setTitle('Libro de Reclamaciones');
    const s = state.settings; const u = state.user || {};
    const today = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    app.innerHTML = `<div class="container page lr-page">
      <article class="card lr-card">
        ${lrHeader({ company_name: s.company_name || s.store_name, company_ruc: s.company_ruc, address: s.address }, '', today)}
        <form id="lr-form" novalidate>
          <h3 class="lr-sec"><span>1</span> Identificación del consumidor reclamante</h3>
          <div class="form-grid">
            <label class="field full"><span>Nombre y apellidos *</span><input class="input" name="consumer_name" maxlength="120" value="${esc(u.name || '')}" autocomplete="name"></label>
            <label class="field"><span>Tipo de documento *</span><select class="select" name="doc_type"><option>DNI</option><option value="CE">Carné de extranjería</option><option>Pasaporte</option><option>RUC</option></select></label>
            <label class="field"><span>N° de documento *</span><input class="input" name="doc_number" maxlength="15" inputmode="numeric"></label>
            <label class="field full"><span>Domicilio *</span><input class="input" name="address" maxlength="200" value="${esc(u.address || '')}" autocomplete="street-address"></label>
            <label class="field"><span>Teléfono</span><input class="input" name="phone" type="tel" maxlength="30" value="${esc(u.phone || '')}" autocomplete="tel"></label>
            <label class="field"><span>Correo electrónico *</span><input class="input" name="email" type="email" maxlength="160" value="${esc(u.email || '')}" autocomplete="email"><small>Te enviaremos aquí la copia de tu hoja y nuestra respuesta.</small></label>
            <label class="check full"><input type="checkbox" name="is_minor" id="lr-minor"> Soy menor de edad</label>
            <label class="field" data-minor hidden><span>Padre, madre o apoderado *</span><input class="input" name="guardian_name" maxlength="120"></label>
            <label class="field" data-minor hidden><span>Documento del padre, madre o apoderado *</span><input class="input" name="guardian_doc" maxlength="15"></label>
          </div>
          <h3 class="lr-sec"><span>2</span> Identificación del bien contratado</h3>
          <div class="form-grid">
            <div class="field full"><span>Tipo *</span><div class="seg-pick"><label><input type="radio" name="good_type" value="producto" checked><span>Producto</span></label><label><input type="radio" name="good_type" value="servicio"><span>Servicio</span></label></div></div>
            <label class="field"><span>Código de pedido (si tienes)</span><input class="input" name="order_code" maxlength="40" value="${esc(query.get('pedido') || '')}" placeholder="PED-…"></label>
            <label class="field"><span>Monto reclamado (${esc(s.currency || 'PEN')})</span><input class="input" name="amount" type="number" min="0" step="0.01"></label>
            <label class="field full"><span>Descripción del producto o servicio *</span><input class="input" name="good_description" maxlength="500" placeholder="Ej: Audífonos inalámbricos Pulse ANC"></label>
          </div>
          <h3 class="lr-sec"><span>3</span> Detalle de la reclamación y pedido del consumidor</h3>
          <div class="lr-types">
            <label class="lr-type"><input type="radio" name="type" value="reclamo" checked><div><b>Reclamo</b><span>Disconformidad relacionada a los productos o servicios.</span></div></label>
            <label class="lr-type"><input type="radio" name="type" value="queja"><div><b>Queja</b><span>Disconformidad no relacionada a los productos o servicios, o malestar o descontento respecto a la atención al público.</span></div></label>
          </div>
          <div class="form-grid mt-2">
            <label class="field full"><span>Detalle *</span><textarea class="textarea" name="detail" rows="5" maxlength="3000" placeholder="Describe qué ocurrió"></textarea></label>
            <label class="field full"><span>Pedido del consumidor *</span><textarea class="textarea" name="request" rows="3" maxlength="2000" placeholder="¿Qué solución solicitas?"></textarea></label>
          </div>
          <h3 class="lr-sec"><span>4</span> Observaciones y acciones adoptadas por el proveedor</h3>
          <p class="muted small">Esta sección la completa ${esc(s.store_name)} al responder. Te enviaremos la respuesta a tu correo electrónico.</p>
          <div class="lr-legal mt-2"><p>${LR_LEGAL}</p><p class="mt-1">Tus datos se utilizan únicamente para atender esta hoja de reclamación, conforme a nuestra <a href="#/pagina/privacidad" target="_blank">política de privacidad</a>. Al enviarla recibirás una copia en tu correo.</p></div>
          <button class="btn btn-primary btn-lg btn-block mt-3" type="submit" id="lr-send" data-loading="Enviando…">${icon('book')} Enviar hoja de reclamación</button>
        </form>
      </article>
    </div>`;
    const form = $('#lr-form');
    $('#lr-minor').addEventListener('change', (e) => $$('[data-minor]', form).forEach((el) => { el.hidden = !e.target.checked; }));
    form.addEventListener('input', (e) => e.target.classList.remove('invalid'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(form);
      const bad = [];
      const need = (n, ok) => { if (!ok) { form.elements[n].classList.add('invalid'); bad.push(n); } };
      need('consumer_name', d.consumer_name.trim().length >= 3);
      need('doc_number', d.doc_number.trim().length >= 6);
      need('address', d.address.trim().length >= 5);
      need('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim()));
      if (d.is_minor) { need('guardian_name', d.guardian_name.trim().length >= 3); need('guardian_doc', d.guardian_doc.trim().length >= 6); }
      need('good_description', d.good_description.trim().length >= 3);
      need('detail', d.detail.trim().length >= 10);
      need('request', d.request.trim().length >= 5);
      if (bad.length) { toast('Completa los campos marcados', 'error'); form.elements[bad[0]].focus(); return; }
      await withLoading($('#lr-send'), async () => {
        try {
          const r = await api.post('/api/complaints', d);
          toast('Hoja de reclamación registrada', 'success');
          go(`#/libro-reclamaciones/${encodeURIComponent(r.number)}?token=${encodeURIComponent(r.token)}&nuevo=1`);
        } catch (err) { toast(err.message, 'error', 6000); }
      });
    });
  }

  async function viewComplaintSheet({ parts, query, isCurrent }) {
    app.innerHTML = '<div class="container page"><div class="skeleton" style="height:500px;max-width:860px;margin:0 auto"></div></div>';
    const { complaint: c } = await api.get(`/api/complaints/${encodeURIComponent(parts[1])}${qs({ token: query.get('token') || '' })}`);
    if (!isCurrent()) return;
    setTitle(`Hoja de Reclamación ${c.number}`);
    document.body.classList.add('receipt-mode');
    const d = (x) => (x ? new Date(x.replace(' ', 'T') + 'Z').toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
    const row = (k, v) => `<div class="lr-row"><span>${esc(k)}</span><div>${v}</div></div>`;
    app.innerHTML = `<div class="container page lr-page">
      ${query.get('nuevo') === '1' ? `<div class="alert alert-success no-print" style="margin-bottom:16px">${icon('check')}<div><b>Registramos tu ${esc(c.type)} N° ${esc(c.number)}.</b> Enviamos una copia a <b>${esc(c.email)}</b>. Responderemos a más tardar el <b>${esc(c.due_date.split('-').reverse().join('/'))}</b>.</div></div>` : ''}
      <div class="rc-actions no-print"><a class="btn" href="#/">${icon('arrowLeft')} Volver a la tienda</a><button class="btn btn-primary" type="button" id="lr-print">${icon('download')} Imprimir / Guardar PDF</button></div>
      <article class="card lr-card lr-sheet">
        ${lrHeader(c.provider, c.number, d(c.created_at))}
        <h3 class="lr-sec"><span>1</span> Identificación del consumidor reclamante</h3>
        ${row('Nombre', esc(c.consumer_name))}${row('Documento', `${esc(c.doc_type)} ${esc(c.doc_number)}`)}${row('Domicilio', esc(c.address))}${row('Teléfono', esc(c.phone || '—'))}${row('Correo', esc(c.email))}
        ${c.is_minor ? row('Padre, madre o apoderado', `${esc(c.guardian_name)} · ${esc(c.guardian_doc)}`) : ''}
        <h3 class="lr-sec"><span>2</span> Identificación del bien contratado</h3>
        ${row('Tipo', c.good_type === 'producto' ? 'Producto' : 'Servicio')}${c.order_code ? row('Pedido', esc(c.order_code)) : ''}${row('Monto reclamado', c.amount ? money(c.amount) : '—')}${row('Descripción', esc(c.good_description))}
        <h3 class="lr-sec"><span>3</span> Detalle de la reclamación y pedido del consumidor</h3>
        ${row('Tipo', `<b>${c.type === 'reclamo' ? 'Reclamo' : 'Queja'}</b>`)}${row('Detalle', `<div class="page-text">${esc(c.detail)}</div>`)}${row('Pedido', `<div class="page-text">${esc(c.request)}</div>`)}
        <h3 class="lr-sec"><span>4</span> Observaciones y acciones adoptadas por el proveedor</h3>
        ${c.response ? `${row('Fecha de respuesta', d(c.responded_at))}${row('Respuesta', `<div class="page-text">${esc(c.response)}</div>`)}` : `<p class="muted small">Pendiente de respuesta · plazo máximo: ${esc(c.due_date.split('-').reverse().join('/'))} (15 días hábiles).</p>`}
        <div class="lr-legal mt-3"><p>${LR_DEFS}</p><p class="mt-1">${LR_LEGAL}</p></div>
      </article>
    </div>`;
    $('#lr-print').addEventListener('click', () => window.print());
  }

  function viewNotFound() {
    setTitle('Página no encontrada');
    app.innerHTML = `<div class="container page">${emptyState('search', 'Página no encontrada', 'El enlace que seguiste no existe o fue movido.', '<a class="btn btn-dark" href="#/">Ir al inicio</a>')}</div>`;
  }

  /* ------------------------------ Eventos globales ------------------------------ */
  function logout() {
    localStorage.removeItem('ns_token');
    state.user = null;
    renderHeader();
    toast('Sesión cerrada');
    go('#/');
  }

  function openFilters() {
    const f = $('#filters');
    if (!f) return;
    f.classList.add('open');
    const bd = document.createElement('div');
    bd.className = 'filters-backdrop';
    bd.addEventListener('click', closeFilters);
    document.body.appendChild(bd);
  }
  function closeFilters() {
    const f = $('#filters');
    if (f) f.classList.remove('open');
    $$('.filters-backdrop').forEach((b) => b.remove());
  }

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      e.preventDefault();
      const id = +add.dataset.add;
      const stock = +add.dataset.stock;
      if (Cart.add(id, 1, stock)) {
        toast(`${add.dataset.name} agregado al carrito`, 'success');
        add.innerHTML = icon('check');
        setTimeout(() => { add.innerHTML = icon('plus'); }, 1200);
      } else toast('Ya tienes el máximo disponible en tu carrito', 'error');
      return;
    }
    if (e.target.closest('[data-open-filters]')) openFilters();
    if (e.target.closest('[data-close-filters]')) closeFilters();
  });

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    go(`#/tienda${qs({ q })}`);
  });

  window.addEventListener('hashchange', router);
  window.addEventListener('auth:expired', () => { state.user = null; renderHeader(); });
  window.addEventListener('storage', (e) => { if (e.key === 'ns_cart') updateCartCount(); });

  /* ------------------------------ Inicio ------------------------------ */
  async function init() {
    try {
      const [cfg, cats, pr] = await Promise.all([api.get('/api/settings'), api.get('/api/categories'), api.get('/api/promotions').catch(() => ({ items: [] }))]);
      state.promos = pr.items;
      state.settings = cfg.settings;
      state.methods = cfg.payment_methods;
      state.regions = cfg.regions || [];
      state.shipFree = cfg.shipping_free_from || 0;
      state.statuses = cfg.statuses;
      state.pstatuses = cfg.payment_statuses;
      state.categories = cats.items;
      if (localStorage.getItem('ns_token')) {
        try { state.user = (await api.get('/api/auth/me')).user; } catch { state.user = null; }
      }
      renderChrome();
      await router();
    } catch (err) {
      app.innerHTML = `<div class="container page">${emptyState('alert', 'No se pudo cargar la tienda', err.message, '<button class="btn btn-dark" type="button" id="retry">Reintentar</button>')}</div>`;
      const r = $('#retry'); if (r) r.addEventListener('click', () => location.reload());
    }
  }
  init();
})();
