/* ================== Panel de administración ================== */
(function () {
  'use strict';
  const { icon, esc, money, moneyShort, toast, modal, confirmDialog, withLoading, formData, debounce, fmtDate } = UI;
  const TOKEN = 'ns_admin_token';
  const api = UI.createApi(TOKEN);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = $('#root');

  const state = { user: null, settings: {}, statuses: {}, pstatuses: {}, methods: [], categories: [], regions: [] };

  const STATUS_CLS = { pendiente: 'b-warning', confirmado: 'b-info', preparando: 'b-violet', enviado: 'b-info', entregado: 'b-success', cancelado: 'b-danger' };
  const PAY_CLS = { pendiente: 'b-warning', pagado: 'b-success', fallido: 'b-danger', reembolsado: 'b-muted' };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLS[s] || ''}">${esc(state.statuses[s] || s)}</span>`;
  const payBadge = (s) => `<span class="badge ${PAY_CLS[s] || ''}">${esc(state.pstatuses[s] || s)}</span>`;
  const methodLabel = (id) => (state.methods.find((m) => m.id === id) || {}).label || id;
  const qs = (obj) => { const p = new URLSearchParams(); Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };
  const thumb = (src, alt = '') => `<img class="thumb" src="${esc(src || '/img/placeholder.svg')}" alt="${esc(alt)}" loading="lazy">`;

  const NAV = [
    { id: 'dashboard', label: 'Resumen', icon: 'chart' },
    { id: 'pedidos', label: 'Pedidos', icon: 'receipt', count: true },
    { id: 'productos', label: 'Productos', icon: 'box' },
    { id: 'categorias', label: 'Categorías', icon: 'grid' },
    { id: 'clientes', label: 'Clientes', icon: 'users' },
    { id: 'cupones', label: 'Cupones', icon: 'ticket' },
    { id: 'campanas', label: 'Campañas', icon: 'megaphone' },
    { id: 'envios', label: 'Envíos', icon: 'truck' },
    { id: 'reclamaciones', label: 'Reclamaciones', icon: 'book', countId: 'lr-count' },
    { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
  ];

  /* ============================ Logo ============================ */
  function logoHtml(onDark) {
    const s = state.settings;
    const name = s.store_name || 'Tienda';
    const src = onDark ? (s.store_logo_dark || s.store_logo) : s.store_logo;
    if (!src) return `<span class="logo-mark">${esc(name.charAt(0).toUpperCase())}</span>`;
    const img = `<img class="logo-img" src="${esc(src)}" alt="${esc(name)}">`;
    return onDark && !s.store_logo_dark ? `<span class="logo-chip">${img}</span>` : img;
  }
  function applyFavicon() {
    const link = document.querySelector('link[rel=icon]');
    if (link) { link.href = state.settings.store_logo || '/img/favicon.svg'; link.type = state.settings.store_logo ? '' : 'image/svg+xml'; }
  }

  /* ============================ Login ============================ */
  function renderLogin() {
    document.title = 'Ingresar · Panel de administración';
    root.innerHTML = `<div class="adm-login">
      <div class="adm-login-art">
        <div class="logo" style="color:#fff">${logoHtml(true)}${state.settings.store_logo && state.settings.logo_show_name === '0' ? '' : esc(state.settings.store_name || 'Tienda')}</div>
        <div><h2>LUBIZJEANS: tu universo denim, bajo control</h2><p>Colección, fotografías, tallas, inventario y pedidos en un solo lugar.</p>
          <ul><li>${icon('check')} Gestiona jeans y sus existencias reales</li><li>${icon('check')} Controla los pedidos de tu marca</li><li>${icon('check')} Exportación de ventas a CSV</li></ul></div>
        <small style="color:#6c707b;position:relative;z-index:1">© ${new Date().getFullYear()} ${esc(state.settings.store_name || '')}</small>
      </div>
      <div class="adm-login-form">
        <form id="adm-login" novalidate>
          <div><h1>Iniciar sesión</h1><p class="muted mt-1">Acceso exclusivo para administradores.</p></div>
          <label class="field"><span>Correo</span><input class="input" type="email" name="email" required autocomplete="username"></label>
          <label class="field"><span>Contraseña</span><input class="input" type="password" name="password" required autocomplete="current-password"></label>
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Ingresando…">Ingresar al panel</button>
          <div class="alert alert-info small">${icon('info')}<div>Acceso reservado para la persona administradora de LubizJeans. Cambia tu contraseña inicial en un entorno seguro.</div></div>
          <a href="/" class="btn btn-ghost">${icon('arrowLeft')} Volver a la tienda</a>
        </form>
      </div>
    </div>`;
    $('#adm-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.email || !d.password) { toast('Completa correo y contraseña', 'error'); return; }
      await withLoading($('button[type=submit]', e.target), async () => {
        try {
          const res = await api.post('/api/auth/login', d);
          if (res.user.role !== 'admin') { toast('Esta cuenta no tiene permisos de administrador', 'error'); return; }
          localStorage.setItem(TOKEN, res.token);
          state.user = res.user;
          await boot();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  /* ============================ Layout ============================ */
  function renderShell() {
    const u = state.user;
    root.innerHTML = `<div class="adm">
      <aside class="sidebar" id="sidebar">
        <a class="logo" href="#/dashboard" id="side-logo">${sideLogo()}</a>
        <div class="side-label">Gestión</div>
        ${NAV.map((n) => `<a class="side-link" href="#/${n.id}" data-nav="${n.id}">${icon(n.icon)}${n.label}${n.count ? '<span class="count" id="pending-count"></span>' : ''}${n.countId ? `<span class="count" id="${n.countId}"></span>` : ''}</a>`).join('')}
        <div class="side-foot">
          <a class="side-link" href="/" target="_blank" rel="noopener">${icon('store')} Ver tienda ${icon('external', 'icon-sm')}</a>
          <button class="side-link" type="button" id="adm-logout">${icon('logout')} Cerrar sesión</button>
          <div class="side-user"><span class="avatar">${esc(u.name.charAt(0).toUpperCase())}</span><div><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div></div>
        </div>
      </aside>
      <div class="adm-main">
        <header class="adm-top"><button class="btn btn-ghost btn-icon menu-btn" type="button" id="menu-btn" aria-label="Menú">${icon('menu')}</button><h1 id="page-title">Resumen</h1><div class="grow"></div><span class="muted small" id="today"></span></header>
        <div class="adm-content" id="view"></div>
      </div>
    </div>`;
    $('#today').textContent = new Date().toLocaleDateString(state.settings.locale || 'es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#adm-logout').addEventListener('click', () => { localStorage.removeItem(TOKEN); state.user = null; renderLogin(); toast('Sesión cerrada'); });
    $('#menu-btn').addEventListener('click', openSidebar);
  }
  function sideLogo() {
    return `${logoHtml(true)}<span>${esc(state.settings.store_name)}<small>Administración</small></span>`;
  }
  function openSidebar() {
    $('#sidebar').classList.add('open');
    const bd = document.createElement('div');
    bd.className = 'side-backdrop';
    bd.addEventListener('click', closeSidebar);
    document.body.appendChild(bd);
  }
  function closeSidebar() { const s = $('#sidebar'); if (s) s.classList.remove('open'); $$('.side-backdrop').forEach((b) => b.remove()); }

  async function refreshPending() {
    try {
      const r = await api.get('/api/admin/orders?status=pendiente&limit=1');
      const el = $('#pending-count');
      if (el) el.textContent = r.total ? String(r.total) : '';
      const c = await api.get('/api/admin/complaints?status=abiertos');
      const lc = $('#lr-count'); if (lc) lc.textContent = c.items.length ? String(c.items.length) : '';
    } catch { /* silencioso */ }
  }

  /* ============================ Router ============================ */
  const views = { dashboard: viewDashboard, pedidos: viewOrders, productos: viewProducts, categorias: viewCategories, clientes: viewCustomers, cupones: viewCoupons, campanas: viewPromotions, envios: viewShipping, reclamaciones: viewComplaintsAdmin, ajustes: viewSettings };
  let rid = 0;
  async function router() {
    if (!state.user) return;
    const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'dashboard';
    const view = views[id] || viewDashboard;
    const nav = NAV.find((n) => n.id === id) || NAV[0];
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav.id));
    $('#page-title').textContent = nav.label;
    document.title = `${nav.label} · ${state.settings.store_name} Admin`;
    closeSidebar();
    const v = $('#view');
    v.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton mt-2" style="height:320px"></div>';
    const my = ++rid;
    try { await view(v, () => my === rid); }
    catch (err) { if (my === rid) v.innerHTML = `<div class="card">${emptyBox('alert', 'No se pudo cargar', err.message)}</div>`; }
    window.scrollTo(0, 0);
  }
  const emptyBox = (ic, t, d) => `<div class="empty">${icon(ic)}<h3>${esc(t)}</h3><p>${esc(d)}</p></div>`;

  function pager(data, onPage) {
    const from = data.total ? (data.page - 1) * (data.limit || 20) + 1 : 0;
    const html = `<div class="pager"><span>${data.total} registro${data.total === 1 ? '' : 's'}</span>
      <div class="flex"><button class="btn btn-sm" type="button" data-pg="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 'icon-sm')} Anterior</button>
      <span style="padding:0 8px">Página ${data.page} de ${data.pages}</span>
      <button class="btn btn-sm" type="button" data-pg="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Siguiente ${icon('chevronRight', 'icon-sm')}</button></div></div>`;
    void from;
    return { html, bind: (el) => $$('[data-pg]', el).forEach((b) => b.addEventListener('click', () => onPage(+b.dataset.pg))) };
  }

  /* ============================ Dashboard ============================ */
  async function viewDashboard(v, alive) {
    const s = await api.get('/api/admin/stats');
    if (!alive()) return;
    const delta = s.prev_month_revenue ? ((s.month_revenue - s.prev_month_revenue) / s.prev_month_revenue) * 100 : null;
    const totalStatus = s.by_status.reduce((a, b) => a + b.n, 0) || 1;
    const statusOrder = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado'];
    v.innerHTML = `
      ${s.complaints_open ? `<a href="#/reclamaciones" class="alert alert-danger" style="margin-bottom:16px;text-decoration:none">${icon('book')}<div><b>Tienes ${s.complaints_open} hoja${s.complaints_open === 1 ? '' : 's'} de reclamación por responder.</b> El plazo legal es de 15 días hábiles improrrogables. Clic para atender.</div></a>` : ''}
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top">Ventas del mes<span class="kpi-ic">${icon('chart')}</span></div><b>${money(s.month_revenue)}</b>
          <small>${delta === null ? 'Sin datos del mes anterior' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%</span> vs. mes anterior`}</small></div>
        <div class="card kpi"><div class="kpi-top">Pedidos del mes<span class="kpi-ic">${icon('receipt')}</span></div><b>${s.month_orders}</b><small>${s.orders} pedidos válidos en total</small></div>
        <div class="card kpi"><div class="kpi-top">Ticket promedio<span class="kpi-ic">${icon('tag')}</span></div><b>${money(s.avg_ticket)}</b><small>Ventas totales ${money(s.revenue)}</small></div>
        <a class="card kpi" href="#/pedidos" id="kpi-verify"><div class="kpi-top">Pagos por verificar<span class="kpi-ic" style="background:#e7f9ee;color:#1a9c4b">${icon('whatsapp')}</span></div><b>${s.to_verify}</b><small>Revisa las capturas en WhatsApp y confírmalos · ${s.pending} pedidos por atender</small></a>
      </div>
      <div class="dash-grid">
        <section class="card"><div class="panel-head"><h3>Ventas · últimos 30 días</h3><span class="muted small">Total ${money(s.series.reduce((a, d) => a + d.revenue, 0))}</span></div><div class="panel-body" id="chart-wrap"></div></section>
        <section class="card"><div class="panel-head"><h3>Pedidos por estado</h3></div><div class="panel-body"><div class="status-bars">
          ${statusOrder.map((st) => { const n = (s.by_status.find((b) => b.status === st) || {}).n || 0; return `<div class="status-bar"><span>${esc(state.statuses[st])}</span><div class="track"><i style="width:${(n / totalStatus) * 100}%"></i></div><b class="right">${n}</b></div>`; }).join('')}
        </div>
        <div class="flex mt-3" style="gap:24px"><div><div class="muted small">Clientes</div><b style="font-size:20px">${s.customers}</b></div><div><div class="muted small">Productos activos</div><b style="font-size:20px">${s.products}</b></div><div><div class="muted small">Cobrado</div><b style="font-size:20px">${moneyShort(s.paid)}</b></div></div>
        </div></section>
      </div>
      <div class="dash-grid">
        <section class="card"><div class="panel-head"><h3>Pedidos recientes</h3><a class="btn btn-sm" href="#/pedidos">Ver todos</a></div>
          <div class="panel-body" style="padding:12px 0 4px"><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Pago</th><th class="right">Total</th></tr></thead><tbody>
          ${s.recent.map((o) => `<tr class="clickable" data-order="${o.id}"><td><div class="cell-main">${esc(o.code)}</div><div class="cell-sub nowrap">${fmtDate(o.created_at, true)}</div></td><td>${esc(o.customer_name)}</td><td>${statusBadge(o.status)}</td><td>${payBadge(o.payment_status)}</td><td class="right"><b>${money(o.total)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin pedidos aún</td></tr>'}
          </tbody></table></div></div></section>
        <div style="display:flex;flex-direction:column;gap:16px">
          <section class="card"><div class="panel-head"><h3>Más vendidos</h3></div><div class="panel-body"><div class="list-rows">
            ${s.top.map((t, i) => `<div class="list-row"><b class="muted" style="width:18px">${i + 1}</b><span class="grow">${esc(t.name)}</span><span class="muted small nowrap">${t.qty} u.</span></div>`).join('') || '<p class="muted small">Sin ventas aún</p>'}
          </div></div></section>
          <section class="card"><div class="panel-head"><h3>Stock bajo</h3><span class="badge b-warning plain">≤ ${s.low_stock_threshold}</span></div><div class="panel-body"><div class="list-rows">
            ${s.low_stock.map((p) => `<div class="list-row">${thumb(p.image, p.name)}<span class="grow">${esc(p.name)}</span><span class="stock-num ${p.stock === 0 ? 'out' : 'low'}">${p.stock === 0 ? 'Agotado' : p.stock}</span></div>`).join('') || '<p class="muted small">Todo el inventario está en buen nivel 👍</p>'}
          </div></div></section>
        </div>
      </div>`;
    drawChart($('#chart-wrap'), s.series);
    $('#kpi-verify').addEventListener('click', () => { orderFilter.payment = 'pendiente'; orderFilter.status = ''; orderFilter.page = 1; });
    $$('[data-order]', v).forEach((tr) => tr.addEventListener('click', () => openOrder(+tr.dataset.order)));
  }

  function drawChart(el, series) {
    const W = 760; const H = 260; const pl = 56; const pr = 8; const pt = 12; const pb = 28;
    const max = Math.max(...series.map((d) => d.revenue), 1);
    const step = niceStep(max / 4);
    const top = Math.ceil(max / step) * step;
    const iw = W - pl - pr; const ih = H - pt - pb;
    const bw = iw / series.length;
    let grid = '';
    for (let y = 0; y <= top + 0.0001; y += step) {
      const yy = pt + ih - (y / top) * ih;
      grid += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end">${esc(moneyShort(y))}</text>`;
    }
    const bars = series.map((d, i) => {
      const h = (d.revenue / top) * ih;
      const x = pl + i * bw + bw * 0.18;
      return `<rect class="bar" x="${x}" y="${pt + ih - h}" width="${bw * 0.64}" height="${Math.max(h, d.revenue ? 2 : 0)}" rx="3" data-i="${i}"/>`;
    }).join('');
    const labels = series.map((d, i) => (i % 5 === 0 || i === series.length - 1)
      ? `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(new Date(d.date + 'T12:00:00').toLocaleDateString(state.settings.locale || 'es-PE', { day: '2-digit', month: 'short' }))}</text>` : '').join('');
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Ventas diarias de los últimos 30 días">${grid}${bars}${labels}</svg>`;
    let tip = null;
    $$('.bar', el).forEach((b) => {
      b.addEventListener('mouseenter', () => {
        const d = series[+b.dataset.i];
        tip = document.createElement('div');
        tip.className = 'chart-tip';
        tip.innerHTML = `<b>${esc(new Date(d.date + 'T12:00:00').toLocaleDateString(state.settings.locale || 'es-PE', { weekday: 'short', day: 'numeric', month: 'short' }))}</b><br>${money(d.revenue)} · ${d.orders} pedido${d.orders === 1 ? '' : 's'}`;
        document.body.appendChild(tip);
      });
      b.addEventListener('mousemove', (e) => { if (tip) { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY - 46}px`; } });
      b.addEventListener('mouseleave', () => { if (tip) tip.remove(); tip = null; });
    });
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  /* ============================ Pedidos ============================ */
  const orderFilter = { q: '', status: '', payment: '', from: '', to: '', page: 1 };
  async function viewOrders(v, alive) {
    v.innerHTML = `<div class="toolbar">
        <div class="search-box">${icon('search')}<input class="input" id="o-q" placeholder="Buscar por código, cliente, correo o teléfono" value="${esc(orderFilter.q)}"></div>
        <select class="select" id="o-status"><option value="">Todos los estados</option>${Object.entries(state.statuses).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <select class="select" id="o-pay"><option value="">Todos los pagos</option>${Object.entries(state.pstatuses).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <input class="input" type="date" id="o-from" value="${esc(orderFilter.from)}" aria-label="Desde">
        <input class="input" type="date" id="o-to" value="${esc(orderFilter.to)}" aria-label="Hasta">
        <button class="btn ${orderFilter.payment === 'pendiente' ? 'btn-dark' : ''}" type="button" id="o-verify">${icon('whatsapp', 'icon-sm')} Por verificar</button>
        <div class="spacer"></div>
        <button class="btn" type="button" id="o-export" data-loading="Exportando…">${icon('download')} Exportar CSV</button>
      </div>
      <div class="card" id="o-table"></div>`;
    $('#o-status').value = orderFilter.status;
    $('#o-pay').value = orderFilter.payment;
    const load = async () => {
      const data = await api.get(`/api/admin/orders${qs({ ...orderFilter, limit: 20 })}`);
      if (!alive()) return;
      data.limit = 20;
      const pg = pager(data, (p) => { orderFilter.page = p; load(); });
      $('#o-table').innerHTML = data.items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Pago</th><th>Estado</th><th class="right">Total</th><th></th></tr></thead><tbody>
        ${data.items.map((o) => `<tr class="clickable" data-order="${o.id}">
          <td><div class="cell-main">${esc(o.code)}</div><div class="cell-sub nowrap">${fmtDate(o.created_at, true)}</div></td>
          <td><div>${esc(o.customer_name)}</div><div class="cell-sub">${esc(o.email)}</div></td>
          <td>${o.items_count}</td>
          <td>${payBadge(o.payment_status)}<div class="cell-sub mt-1">${esc(methodLabel(o.payment_method))}</div></td>
          <td>${statusBadge(o.status)}</td>
          <td class="right"><b>${money(o.total)}</b></td>
          <td class="right">${icon('chevronRight', 'icon-sm')}</td></tr>`).join('')}
        </tbody></table></div>${pg.html}` : emptyBox('receipt', 'No hay pedidos', 'Prueba cambiando los filtros.');
      pg.bind($('#o-table'));
      $$('[data-order]', $('#o-table')).forEach((tr) => tr.addEventListener('click', () => openOrder(+tr.dataset.order, load)));
    };
    const reload = () => { orderFilter.page = 1; load(); };
    $('#o-q').addEventListener('input', debounce((e) => { orderFilter.q = e.target.value.trim(); reload(); }, 350));
    $('#o-status').addEventListener('change', (e) => { orderFilter.status = e.target.value; reload(); });
    $('#o-pay').addEventListener('change', (e) => { orderFilter.payment = e.target.value; reload(); });
    $('#o-verify').addEventListener('click', (e) => {
      const on = orderFilter.payment !== 'pendiente';
      orderFilter.payment = on ? 'pendiente' : ''; $('#o-pay').value = orderFilter.payment;
      e.currentTarget.classList.toggle('btn-dark', on); reload();
    });
    $('#o-from').addEventListener('change', (e) => { orderFilter.from = e.target.value; reload(); });
    $('#o-to').addEventListener('change', (e) => { orderFilter.to = e.target.value; reload(); });
    $('#o-export').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      try {
        const res = await api.get(`/api/admin/orders/export${qs({ ...orderFilter, page: '' })}`, { raw: true });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('CSV descargado', 'success');
      } catch (err) { toast(err.message, 'error'); }
    }));
    await load();
  }

  function waCustomer(o, msg) {
    let n = String(o.phone || '').replace(/\D/g, '');
    if (n.length === 9 && n.startsWith('9')) n = `51${n}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }
  const receiptUrl = (o) => `${location.origin}/#/comprobante/${encodeURIComponent(o.code)}?token=${encodeURIComponent(o.access_token)}`;

  async function openOrder(id, onChange) {
    const { order: o } = await api.get(`/api/admin/orders/${id}`);
    const isCancelled = o.status === 'cancelado';
    const m = modal({
      title: `Pedido ${o.code}`, size: 'lg',
      body: `<div class="flex" style="margin:-6px 0 18px;flex-wrap:wrap">${statusBadge(o.status)}${payBadge(o.payment_status)}<span class="muted small">Creado ${fmtDate(o.created_at, true)}</span></div>
      ${o.payment_status === 'pendiente' && o.status !== 'cancelado' ? `<div class="verify-box">
        <div class="verify-head"><span class="verify-ic">${icon('whatsapp')}</span><div><b>Pago por verificar · ${money(o.total)}</b><p class="small muted">${esc(methodLabel(o.payment_method))}. Revisa la captura que te envió por WhatsApp y confirma cuando el dinero esté en tu cuenta. Al confirmar se emite la boleta.</p></div></div>
        <div class="verify-actions"><input class="input" id="quick-ref" placeholder="N° de operación (opcional)" maxlength="120">
        <button class="btn btn-wa" type="button" id="confirm-pay" data-loading="Confirmando…">${icon('check')} Confirmar pago recibido</button>
        <a class="btn" target="_blank" rel="noopener" href="${esc(waCustomer(o, `Hola ${o.customer_name.split(' ')[0]}, te escribimos de ${state.settings.store_name} por tu pedido *${o.code}* (${money(o.total)}).`))}">${icon('whatsapp', 'icon-sm')} Escribir al cliente</a></div>
      </div>` : ''}
      <div class="detail-grid">
        <div>
          <div class="detail-box"><h4>Productos</h4>${o.items.map((it) => `<div class="item-line"><img src="${esc(it.image || '/img/placeholder.svg')}" alt=""><div><div style="font-weight:600">${esc(it.name)}</div><div class="cell-sub">${esc(it.sku || '')} · ${it.qty} × ${money(it.price)}</div></div><b>${money(it.total)}</b></div>`).join('')}
            <div style="margin-top:12px">
              <div class="sum-row flex between small"><span class="muted">Subtotal</span><span>${money(o.subtotal)}</span></div>
              ${o.discount ? `<div class="flex between small"><span class="muted">Descuento ${o.coupon_code ? `(${esc(o.coupon_code)})` : ''}</span><span style="color:var(--success)">−${money(o.discount)}</span></div>` : ''}
              <div class="flex between small"><span class="muted">Envío</span><span>${o.shipping ? money(o.shipping) : 'Gratis'}</span></div>
              <div class="flex between small"><span class="muted">${esc(state.settings.tax_label || 'Impuesto')} ${state.settings.tax_included === '1' ? '(incluido)' : ''}</span><span>${money(o.tax)}</span></div>
              <div class="flex between" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><b>Total</b><b style="font-size:18px">${money(o.total)}</b></div>
            </div>
          </div>
          <div class="detail-box"><h4>Historial</h4><div class="ev-list">${o.events.slice().reverse().map((e) => `<div class="ev"><i></i><div>${esc(e.message)}<small>${fmtDate(e.created_at, true)}</small></div></div>`).join('')}</div>
            <form class="flex mt-2" id="note-form"><input class="input" name="note" placeholder="Agregar nota interna…" maxlength="500" style="height:38px"><button class="btn btn-sm" type="submit">Agregar</button></form>
          </div>
        </div>
        <div>
          <div class="detail-box"><h4>Cliente</h4><dl class="kv">
            <dt>Nombre</dt><dd>${esc(o.customer_name)}</dd>
            <dt>Correo</dt><dd><a href="mailto:${esc(o.email)}" style="color:var(--primary)">${esc(o.email)}</a></dd>
            <dt>Teléfono</dt><dd>${esc(o.phone)} <a href="https://wa.me/${esc(o.phone.replace(/\D/g, '').length === 9 ? '51' + o.phone.replace(/\D/g, '') : o.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:var(--success);font-weight:600">WhatsApp</a></dd>
            ${o.document ? `<dt>DNI / CE</dt><dd>${esc(o.document)}</dd>` : ''}
            <dt>Dirección</dt><dd>${esc(o.address)}, ${esc(o.city)}${o.region ? `, ${esc(o.region)}` : ''}</dd>
            ${o.reference ? `<dt>Referencia</dt><dd>${esc(o.reference)}</dd>` : ''}
            ${o.notes ? `<dt>Notas</dt><dd>${esc(o.notes)}</dd>` : ''}
          </dl></div>
          <form class="detail-box" id="status-form"><h4>Estado del pedido</h4>
            ${isCancelled ? '<p class="muted small">El pedido está cancelado (estado final). El stock ya fue devuelto.</p>' : `
            <select class="select" name="status">${Object.entries(state.statuses).map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <input class="input mt-1" name="note" placeholder="Nota (opcional, ej. N° de guía)" maxlength="300">
            <button class="btn btn-dark btn-block mt-1" type="submit" data-loading="Guardando…">Actualizar estado</button>`}
          </form>
          <form class="detail-box" id="ship-form"><h4>Envío · ${esc(o.shipping_method || 'Sin método')}</h4>
            ${o.shipping_type === 'shalom' || o.shipping_agency ? `<label class="field"><span>Agencia Shalom de destino</span><input class="input" name="shipping_agency" maxlength="160" value="${esc(o.shipping_agency || '')}"></label>` : ''}
            <label class="field mt-1"><span>N° de guía / orden de envío</span><input class="input" name="tracking_code" maxlength="80" value="${esc(o.tracking_code || '')}" placeholder="Ej: N° de orden Shalom"></label>
            <label class="field mt-1"><span>Costo de envío cobrado</span><input class="input" name="shipping" type="number" min="0" step="0.01" value="${o.shipping}"></label>
            <button class="btn btn-block mt-1" type="submit" data-loading="Guardando…">Guardar envío</button>
            <small class="muted">El cliente verá la guía en su pedido. Si cambias el costo, el total se recalcula.</small>
          </form>
          <div class="detail-box"><h4>Boleta de venta</h4>
            ${o.receipt_number ? `<p><b>${esc(o.receipt_number)}</b></p>
              <div class="flex mt-1" style="flex-wrap:wrap"><button class="btn btn-sm" type="button" id="open-receipt">${icon('receipt', 'icon-sm')} Ver / imprimir</button>
              <a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${esc(waCustomer(o, `Hola ${o.customer_name.split(' ')[0]}, confirmamos tu pago del pedido *${o.code}* ✅\nAquí tienes tu boleta ${o.receipt_number}:\n${receiptUrl(o)}\n¡Gracias por tu compra en ${state.settings.store_name}!`))}">${icon('whatsapp', 'icon-sm')} Enviar boleta</a></div>`
              : `<p class="muted small">Se emite automáticamente al confirmar el pago.</p>`}
          </div>
          <form class="detail-box" id="pay-form"><h4>Pago · ${esc(methodLabel(o.payment_method))}</h4>

            <select class="select" name="payment_status">${Object.entries(state.pstatuses).map(([k, l]) => `<option value="${k}" ${k === o.payment_status ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <input class="input mt-1" name="payment_ref" placeholder="N° de operación / referencia" maxlength="120" value="${esc(o.payment_ref || '')}">
            <button class="btn btn-block mt-1" type="submit" data-loading="Guardando…">Actualizar pago</button>
          </form>
        </div>
      </div>`,
      footer: `<button class="btn" type="button" id="print-order">${icon('eye')} Ver como cliente</button><button class="btn btn-primary" type="button" data-close>Cerrar</button>`,
    });
    const after = async (msg) => { toast(msg, 'success'); m.close(); refreshPending(); if (onChange) await onChange(); else await router(); openOrder(id, onChange); };
    const sf = $('#status-form', m.el);
    if (!isCancelled) sf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(sf);
      if (d.status === o.status && !d.note) { toast('Selecciona un estado distinto'); return; }
      if (d.status === 'cancelado' && !(await confirmDialog('Al cancelar se devolverá el stock y el pedido no podrá reactivarse. ¿Continuar?', { title: 'Cancelar pedido', okText: 'Sí, cancelar', danger: true }))) return;
      await withLoading($('button[type=submit]', sf), async () => {
        try { await api.patch(`/api/admin/orders/${id}/status`, d); await after('Estado actualizado'); } catch (err) { toast(err.message, 'error'); }
      });
    });
    const pf = $('#pay-form', m.el);
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withLoading($('button[type=submit]', pf), async () => {
        try { await api.patch(`/api/admin/orders/${id}/payment`, formData(pf)); await after('Pago actualizado'); } catch (err) { toast(err.message, 'error'); }
      });
    });
    const nf = $('#note-form', m.el);
    nf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = nf.note.value.trim();
      if (!note) return;
      try { await api.post(`/api/admin/orders/${id}/note`, { note }); await after('Nota agregada'); } catch (err) { toast(err.message, 'error'); }
    });
    const openReceipt = () => window.open(receiptUrl(o), '_blank', 'noopener');
    $('#print-order', m.el).addEventListener('click', () => window.open(`/#/pedido/${encodeURIComponent(o.code)}?token=${encodeURIComponent(o.access_token)}`, '_blank', 'noopener'));
    const orb = $('#open-receipt', m.el); if (orb) orb.addEventListener('click', openReceipt);
    const cp = $('#confirm-pay', m.el);
    if (cp) cp.addEventListener('click', () => withLoading(cp, async () => {
      try { await api.patch(`/api/admin/orders/${id}/payment`, { payment_status: 'pagado', payment_ref: $('#quick-ref', m.el).value }); await after('Pago confirmado · boleta emitida'); }
      catch (err) { toast(err.message, 'error'); }
    }));
    const shf = $('#ship-form', m.el);
    shf.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withLoading($('button[type=submit]', shf), async () => {
        try { await api.patch(`/api/admin/orders/${id}/shipping`, formData(shf)); await after('Envío actualizado'); } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  /* ============================ Productos ============================ */
  const prodFilter = { q: '', category: '', status: '', page: 1 };
  async function viewProducts(v, alive) {
    await loadCategories();
    v.innerHTML = `<div class="toolbar">
      <div class="search-box">${icon('search')}<input class="input" id="p-q" placeholder="Buscar por nombre o SKU" value="${esc(prodFilter.q)}"></div>
      <select class="select" id="p-cat"><option value="">Todas las categorías</option>${state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <select class="select" id="p-status"><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="low">Stock bajo</option></select>
      <div class="spacer"></div>
      <button class="btn" type="button" id="p-bulk">${icon('tag')} Descuento masivo</button>
      <button class="btn btn-primary" type="button" id="p-new">${icon('plus')} Nuevo producto</button>
    </div><div class="card" id="p-table"></div>`;
    $('#p-cat').value = prodFilter.category;
    $('#p-status').value = prodFilter.status;
    const threshold = Number(state.settings.low_stock_threshold) || 5;
    const load = async () => {
      const data = await api.get(`/api/admin/products${qs({ ...prodFilter, limit: 20 })}`);
      if (!alive()) return;
      const pg = pager(data, (p) => { prodFilter.page = p; load(); });
      $('#p-table').innerHTML = data.items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Categoría</th><th class="right">Precio</th><th class="right">Stock</th><th class="right">Vendidos</th><th>Destacado</th><th>Activo</th><th></th></tr></thead><tbody>
        ${data.items.map((p) => `<tr>
          <td><div class="flex">${thumb(p.image, p.name)}<div><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.sku || 'Sin SKU')}</div></div></div></td>
          <td>${esc(p.category_name || '—')}</td>
          <td class="right nowrap"><b>${money(p.price)}</b>${p.compare_price > p.price ? `<div class="cell-sub"><s>${money(p.compare_price)}</s> <span class="badge b-success plain" style="height:20px;padding:0 6px">-${Math.round((1 - p.price / p.compare_price) * 100)}%</span></div>` : ''}</td>
          <td class="right"><span class="stock-num ${p.stock === 0 ? 'out' : p.stock <= threshold ? 'low' : ''}">${p.stock}</span></td>
          <td class="right">${p.sold}</td>
          <td><button class="star-btn ${p.featured ? 'on' : ''}" type="button" data-feat="${p.id}" data-v="${p.featured ? 0 : 1}" aria-label="Destacar">${icon('star')}</button></td>
          <td><label class="switch"><input type="checkbox" data-active="${p.id}" ${p.active ? 'checked' : ''}><i></i></label></td>
          <td><div class="actions"><a class="btn btn-ghost btn-icon btn-sm" href="/#/producto/${esc(p.slug)}" target="_blank" rel="noopener" title="Ver en tienda">${icon('eye')}</a><button class="btn btn-ghost btn-icon btn-sm" type="button" data-edit="${p.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${p.id}" data-name="${esc(p.name)}" title="Eliminar">${icon('trash')}</button></div></td>
        </tr>`).join('')}</tbody></table></div>${pg.html}` : emptyBox('box', 'No hay productos', 'Crea tu primer producto o ajusta los filtros.');
      pg.bind($('#p-table'));
      const t = $('#p-table');
      $$('[data-active]', t).forEach((c) => c.addEventListener('change', async () => {
        try { await api.patch(`/api/admin/products/${c.dataset.active}`, { active: c.checked }); toast(c.checked ? 'Producto visible en la tienda' : 'Producto oculto', 'success'); }
        catch (err) { c.checked = !c.checked; toast(err.message, 'error'); }
      }));
      $$('[data-feat]', t).forEach((b) => b.addEventListener('click', async () => {
        try { await api.patch(`/api/admin/products/${b.dataset.feat}`, { featured: b.dataset.v === '1' }); load(); } catch (err) { toast(err.message, 'error'); }
      }));
      $$('[data-edit]', t).forEach((b) => b.addEventListener('click', async () => {
        try { const { product } = await api.get(`/api/admin/products/${b.dataset.edit}`); productForm(product, load); } catch (err) { toast(err.message, 'error'); }
      }));
      $$('[data-del]', t).forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDialog(`¿Eliminar "${b.dataset.name}"? Los pedidos anteriores conservarán su información.`, { title: 'Eliminar producto', okText: 'Eliminar', danger: true }))) return;
        try { await api.del(`/api/admin/products/${b.dataset.del}`); toast('Producto eliminado', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
      }));
    };
    const reload = () => { prodFilter.page = 1; load(); };
    $('#p-q').addEventListener('input', debounce((e) => { prodFilter.q = e.target.value.trim(); reload(); }, 350));
    $('#p-cat').addEventListener('change', (e) => { prodFilter.category = e.target.value; reload(); });
    $('#p-status').addEventListener('change', (e) => { prodFilter.status = e.target.value; reload(); });
    $('#p-new').addEventListener('click', () => productForm(null, load));
    $('#p-bulk').addEventListener('click', () => modal({
      title: 'Descuento masivo', size: 'sm',
      body: `<form id="bulk-form" class="form-grid" novalidate>
        <label class="field full"><span>Aplicar a</span><select class="select" name="category_id"><option value="">Todos los productos</option>${state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field full"><span>Descuento %</span><input class="input" name="percent" type="number" min="0" max="95" step="1" value="10"><small>Se calcula sobre el precio original. Pon <b>0</b> para quitar los descuentos y volver al precio original.</small></label>
      </form>`,
      footer: '<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="bulk-ok" data-loading="Aplicando…">Aplicar</button>',
      onMount: (el, close) => $('#bulk-ok', el).addEventListener('click', () => withLoading($('#bulk-ok', el), async () => {
        const d = formData($('#bulk-form', el));
        try { const r = await api.post('/api/admin/products/bulk-discount', d); toast(`${r.updated} productos actualizados`, 'success'); close(); load(); } catch (err) { toast(err.message, 'error'); }
      })),
    }));
    await load();
  }

  const SPINNER = '<span class="spinner" style="width:24px;height:24px;border:3px solid var(--muted-2);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span>';
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
  const RAW_TYPES = /^image\/(gif|svg\+xml)$/;

  function imageField(current, { name = 'image', label = 'Imagen', aspect = '1', variant = '', transparent = false, hint = 'JPG, PNG o WEBP · se recorta y optimiza antes de subir' } = {}) {
    return `<div class="field full" data-img-field="${esc(name)}" data-aspect="${esc(aspect)}" data-transparent="${transparent ? 1 : 0}"><span>${esc(label)}</span>
      <div class="img-upload">
        <div class="img-preview ${esc(variant)}" data-preview>${current ? `<img src="${esc(current)}" alt="">` : icon('image')}</div>
        <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:0">
          <input type="hidden" name="${esc(name)}" value="${esc(current || '')}">
          <div class="img-actions">
            <label class="btn btn-sm">${icon('upload', 'icon-sm')} Subir<input type="file" accept="${ACCEPT}" data-file hidden></label>
            <button type="button" class="btn btn-sm" data-edit-img ${current ? '' : 'hidden'}>${icon('edit', 'icon-sm')} Editar</button>
            <button type="button" class="btn btn-sm btn-ghost" data-clear-img ${current ? '' : 'hidden'} style="color:var(--danger)">Quitar</button>
          </div>
          <small class="muted">${esc(hint)}</small>
        </div>
      </div></div>`;
  }

  async function uploadRaw(file) {
    if (file.size > 4 * 1024 * 1024) throw new Error('La imagen supera 4 MB');
    const fd = new FormData(); fd.append('image', file);
    return (await api.post('/api/admin/upload', fd)).url;
  }

  function bindImageFields(root) {
    $$('[data-img-field]', root).forEach((box) => {
      const hidden = $('input[type=hidden]', box);
      const prev = $('[data-preview]', box);
      const file = $('[data-file]', box);
      const editB = $('[data-edit-img]', box);
      const clr = $('[data-clear-img]', box);
      const aspect = box.dataset.aspect;
      const transparent = box.dataset.transparent === '1';
      const set = (url) => {
        hidden.value = url || '';
        prev.innerHTML = url ? `<img src="${esc(url)}" alt="">` : icon('image');
        editB.hidden = !url; clr.hidden = !url;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const edit = async (src) => {
        const blob = await ImageEditor.open({ src, aspect, transparent });
        if (!blob) return;
        prev.innerHTML = SPINNER;
        try { set(await ImageEditor.upload(api, blob)); toast('Imagen lista', 'success'); }
        catch (err) { set(hidden.value); toast(err.message, 'error'); }
      };
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(f.type)) { toast('Formato no permitido. Usa JPG, PNG, WEBP, GIF o SVG.', 'error'); return; }
        if (f.size > 25 * 1024 * 1024) { toast('La imagen es demasiado pesada (máx. 25 MB)', 'error'); return; }
        if (RAW_TYPES.test(f.type)) {
          prev.innerHTML = SPINNER;
          try { set(await uploadRaw(f)); } catch (err) { set(hidden.value); toast(err.message, 'error'); }
          return;
        }
        edit(f);
      });
      editB.addEventListener('click', () => {
        if (/\.svg(\?|$)/i.test(hidden.value)) { toast('Los SVG son vectoriales: se usan tal cual. Para recortarlo, súbelo en PNG.'); return; }
        edit(hidden.value);
      });
      clr.addEventListener('click', () => set(''));
    });
  }

  function bindGallery(el, initial) {
    const g = $('#gallery', el);
    let imgs = initial.filter(Boolean);
    let busy = 0;
    const MAX = 13;
    const render = () => {
      g.innerHTML = imgs.map((u, i) => `<div class="g-tile"><img src="${esc(u)}" alt="Imagen ${i + 1}">${i === 0 ? '<span class="g-main">Principal</span>' : ''}
        <div class="g-tools">${i > 0 ? `<button type="button" data-g="main" data-i="${i}" title="Hacer principal" aria-label="Hacer principal">${icon('star')}</button><button type="button" data-g="left" data-i="${i}" title="Mover a la izquierda" aria-label="Mover">${icon('chevronLeft')}</button>` : ''}
        <button type="button" data-g="edit" data-i="${i}" title="Editar" aria-label="Editar">${icon('edit')}</button><button type="button" data-g="del" data-i="${i}" title="Quitar" aria-label="Quitar">${icon('trash')}</button></div></div>`).join('')
        + Array.from({ length: busy }, () => `<div class="g-tile" style="display:grid;place-items:center">${SPINNER}</div>`).join('')
        + (imgs.length + busy < MAX ? `<label class="g-add">${icon('plus')}Agregar imágenes<input type="file" accept="${ACCEPT}" multiple hidden data-gfile></label>` : '');
      const fi = $('[data-gfile]', g);
      if (fi) fi.addEventListener('change', () => add([...fi.files]));
      $$('[data-g]', g).forEach((b) => b.addEventListener('click', () => act(b.dataset.g, +b.dataset.i)));
    };
    const add = async (files) => {
      files = files.filter((f) => /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(f.type)).slice(0, MAX - imgs.length - busy);
      if (!files.length) return;
      if (files.length === 1 && !RAW_TYPES.test(files[0].type)) {
        const blob = await ImageEditor.open({ src: files[0], aspect: '1' });
        if (!blob) return;
        busy++; render();
        try { imgs.push(await ImageEditor.upload(api, blob)); } catch (err) { toast(err.message, 'error'); }
        busy--; render();
        return;
      }
      busy += files.length; render();
      for (const f of files) {
        try {
          const raw = RAW_TYPES.test(f.type);
          const blob = raw ? f : await ImageEditor.resize(f);
          imgs.push(raw ? await uploadRaw(blob) : await ImageEditor.upload(api, blob));
        } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); }
        busy--; render();
      }
      toast('Imágenes agregadas', 'success');
    };
    const act = async (a, i) => {
      if (a === 'del') imgs.splice(i, 1);
      if (a === 'main') imgs.unshift(imgs.splice(i, 1)[0]);
      if (a === 'left' && i > 0) [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]];
      if (a === 'edit') {
        if (/\.svg(\?|$)/i.test(imgs[i])) { toast('Los SVG se usan tal cual'); return; }
        const blob = await ImageEditor.open({ src: imgs[i], aspect: '1' });
        if (!blob) return;
        try { imgs[i] = await ImageEditor.upload(api, blob); toast('Imagen actualizada', 'success'); } catch (err) { toast(err.message, 'error'); }
      }
      render();
    };
    render();
    return { get: () => imgs.slice(), busy: () => busy > 0 };
  }

  function productForm(p, onSaved) {
    const isNew = !p;
    p = p || { active: 1, featured: 0, stock: 0 };
    const regular = p.compare_price && p.compare_price > p.price ? p.compare_price : p.price;
    const pct = regular && p.price < regular ? Math.round((1 - p.price / regular) * 10000) / 100 : 0;
    modal({
      title: isNew ? 'Nuevo producto' : 'Editar producto', size: 'lg',
      body: `<form id="prod-form" class="form-grid" novalidate>
        <label class="field full"><span>Nombre *</span><input class="input" name="name" required maxlength="140" value="${esc(p.name || '')}"></label>
        <label class="field"><span>Categoría</span><select class="select" name="category_id"><option value="">Sin categoría</option>${state.categories.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>SKU</span><input class="input" name="sku" maxlength="60" value="${esc(p.sku || '')}" placeholder="Código interno"></label>
        <div class="full price-box">
          <label class="field"><span>Precio original *</span><input class="input" id="pr-regular" type="number" min="0" step="0.01" required value="${regular ?? ''}"></label>
          <label class="field"><span>Descuento %</span><input class="input" id="pr-pct" type="number" min="0" max="95" step="0.01" value="${pct || ''}" placeholder="0"></label>
          <label class="field"><span>Precio final (nuevo)</span><input class="input" id="pr-final" type="number" min="0" step="0.01" value="${p.price ?? ''}"></label>
          <div class="price-result" id="pr-result"></div>
        </div>
        <label class="field"><span>Stock *</span><input class="input" name="stock" type="number" min="0" step="1" required value="${p.stock ?? 0}"></label>
        <label class="field"><span>URL amigable <small>(opcional)</small></span><input class="input" name="slug" maxlength="100" value="${esc(p.slug || '')}" placeholder="se-genera-automaticamente"></label>
        <label class="field full"><span>Descripción corta</span><input class="input" name="short_description" maxlength="300" value="${esc(p.short_description || '')}" placeholder="Se muestra junto al precio"></label>
        <label class="field full"><span>Descripción completa</span><textarea class="textarea" name="description" rows="6" maxlength="10000">${esc(p.description || '')}</textarea></label>
        <div class="field full"><span>Imágenes <small>(la primera es la principal · hasta 13 · pasa el mouse para editar, mover o quitar)</small></span><div class="gallery-grid" id="gallery"></div></div>
        <div class="full flex" style="gap:28px"><label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><i></i> Visible en la tienda</label><label class="switch"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}><i></i> Destacado en inicio</label></div>
      </form>`,
      footer: `<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="prod-save" data-loading="Guardando…">${isNew ? 'Crear producto' : 'Guardar cambios'}</button>`,
      onMount: (el, close) => {
        const gallery = bindGallery(el, [p.image, ...(p.gallery || [])]);
        const form = $('#prod-form', el);
        const rg = $('#pr-regular', el); const pc = $('#pr-pct', el); const fn = $('#pr-final', el);
        const r2 = (n) => Math.round(n * 100) / 100;
        const showRes = () => {
          const R = Number(rg.value); const F = Number(fn.value);
          $('#pr-result', el).innerHTML = R > 0 && F > 0 && F < R
            ? `<span class="badge b-success plain">-${r2((1 - F / R) * 100)}%</span> Antes <s>${money(R)}</s> → Ahora <b>${money(F)}</b> · ahorro ${money(R - F)}`
            : R > 0 ? `Precio de venta: <b>${money(F > 0 ? F : R)}</b> (sin descuento)` : '';
        };
        rg.addEventListener('input', () => { const P = Number(pc.value) || 0; fn.value = rg.value ? r2(Number(rg.value) * (1 - P / 100)) : ''; showRes(); });
        pc.addEventListener('input', () => { const P = Math.min(95, Math.max(0, Number(pc.value) || 0)); if (rg.value) fn.value = r2(Number(rg.value) * (1 - P / 100)); showRes(); });
        fn.addEventListener('input', () => { const R = Number(rg.value); const F = Number(fn.value); pc.value = R > 0 && F > 0 && F < R ? r2((1 - F / R) * 100) : ''; showRes(); });
        showRes();
        const save = () => withLoading($('#prod-save', el), async () => {
          if (gallery.busy()) { toast('Espera a que terminen de subir las imágenes'); return; }
          const d = formData(form);
          const R = Number(rg.value); const F = Number(fn.value) || R;
          if (!(R > 0) && R !== 0) { toast('Ingresa el precio original', 'error'); return; }
          if (F > R) { toast('El precio final no puede ser mayor que el original', 'error'); return; }
          d.price = F < R ? F : R;
          d.compare_price = F < R ? R : '';
          const list = gallery.get();
          d.image = list[0] || '';
          d.gallery = list.slice(1);
          if (!d.name.trim() || rg.value === '' || d.stock === '') { toast('Completa nombre, precio y stock', 'error'); return; }
          try {
            if (isNew) await api.post('/api/admin/products', d); else await api.put(`/api/admin/products/${p.id}`, d);
            toast(isNew ? 'Producto creado' : 'Cambios guardados', 'success');
            close(); onSaved();
          } catch (err) { toast(err.message, 'error'); }
        });
        $('#prod-save', el).addEventListener('click', save);
        form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      },
    });
  }

  /* ============================ Categorías ============================ */
  async function loadCategories() { state.categories = (await api.get('/api/admin/categories')).items; }

  async function viewCategories(v, alive) {
    await loadCategories();
    if (!alive()) return;
    v.innerHTML = `<div class="toolbar"><p class="muted">Organiza tu catálogo. El orden define cómo aparecen en la tienda.</p><div class="spacer"></div><button class="btn btn-primary" type="button" id="c-new">${icon('plus')} Nueva categoría</button></div>
      <div class="card">${state.categories.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Categoría</th><th>URL</th><th class="right">Productos</th><th class="right">Orden</th><th>Activa</th><th></th></tr></thead><tbody>
      ${state.categories.map((c) => `<tr><td><div class="flex">${thumb(c.image, c.name)}<div><div class="cell-main">${esc(c.name)}</div><div class="cell-sub">${esc(c.description || '')}</div></div></div></td>
        <td class="muted">/${esc(c.slug)}</td><td class="right">${c.product_count}</td><td class="right">${c.sort}</td>
        <td>${c.active ? '<span class="badge b-success">Activa</span>' : '<span class="badge b-muted">Oculta</span>'}</td>
        <td><div class="actions"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-edit="${c.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${c.id}" data-name="${esc(c.name)}" title="Eliminar">${icon('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('grid', 'Sin categorías', 'Crea la primera para organizar tus productos.')}</div>`;
    const reload = () => router();
    $('#c-new').addEventListener('click', () => categoryForm(null, reload));
    $$('[data-edit]', v).forEach((b) => b.addEventListener('click', () => categoryForm(state.categories.find((c) => c.id === +b.dataset.edit), reload)));
    $$('[data-del]', v).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`¿Eliminar la categoría "${b.dataset.name}"?`, { title: 'Eliminar categoría', okText: 'Eliminar', danger: true }))) return;
      try { await api.del(`/api/admin/categories/${b.dataset.del}`); toast('Categoría eliminada', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function categoryForm(c, onSaved) {
    const isNew = !c;
    c = c || { active: 1, sort: state.categories.length };
    modal({
      title: isNew ? 'Nueva categoría' : 'Editar categoría',
      body: `<form id="cat-form" class="form-grid" novalidate>
        <label class="field"><span>Nombre *</span><input class="input" name="name" required maxlength="80" value="${esc(c.name || '')}"></label>
        <label class="field"><span>Orden</span><input class="input" name="sort" type="number" min="0" value="${c.sort ?? 0}"></label>
        <label class="field full"><span>Descripción</span><input class="input" name="description" maxlength="300" value="${esc(c.description || '')}"></label>
        <label class="field full"><span>URL amigable <small>(opcional)</small></span><input class="input" name="slug" maxlength="100" value="${esc(c.slug || '')}"></label>
        ${imageField(c.image, { aspect: '1' })}
        <label class="switch full"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><i></i> Visible en la tienda</label>
      </form>`,
      footer: `<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="cat-save" data-loading="Guardando…">${isNew ? 'Crear' : 'Guardar'}</button>`,
      onMount: (el, close) => {
        bindImageFields(el);
        const form = $('#cat-form', el);
        const save = () => withLoading($('#cat-save', el), async () => {
          try {
            const d = formData(form);
            if (isNew) await api.post('/api/admin/categories', d); else await api.put(`/api/admin/categories/${c.id}`, d);
            toast('Categoría guardada', 'success'); close(); onSaved();
          } catch (err) { toast(err.message, 'error'); }
        });
        $('#cat-save', el).addEventListener('click', save);
        form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      },
    });
  }

  /* ============================ Clientes ============================ */
  const custFilter = { q: '', role: '', page: 1 };
  async function viewCustomers(v, alive) {
    v.innerHTML = `<div class="toolbar">
      <div class="search-box">${icon('search')}<input class="input" id="u-q" placeholder="Buscar por nombre, correo o teléfono" value="${esc(custFilter.q)}"></div>
      <select class="select" id="u-role"><option value="">Todos</option><option value="customer">Clientes</option><option value="admin">Administradores</option></select>
      <div class="spacer"></div><button class="btn btn-primary" type="button" id="u-new">${icon('plus')} Nuevo usuario</button></div>
      <div class="card" id="u-table"></div>`;
    $('#u-role').value = custFilter.role;
    const load = async () => {
      const data = await api.get(`/api/admin/customers${qs({ ...custFilter, limit: 20 })}`);
      if (!alive()) return;
      const pg = pager(data, (p) => { custFilter.page = p; load(); });
      $('#u-table').innerHTML = data.items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Teléfono</th><th>Ciudad</th><th class="right">Pedidos</th><th class="right">Total gastado</th><th>Registro</th><th>Rol</th><th>Activo</th></tr></thead><tbody>
        ${data.items.map((u) => `<tr><td><div class="flex"><span class="avatar" style="width:36px;height:36px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex:none">${esc(u.name.charAt(0).toUpperCase())}</span><div><div class="cell-main">${esc(u.name)}</div><div class="cell-sub">${esc(u.email)}</div></div></div></td>
          <td>${esc(u.phone || '—')}</td><td>${esc(u.city || '—')}</td><td class="right">${u.orders_count}</td><td class="right"><b>${money(u.spent)}</b></td><td class="nowrap">${fmtDate(u.created_at)}</td>
          <td>${u.role === 'admin' ? '<span class="badge b-violet">Admin</span>' : '<span class="badge b-muted">Cliente</span>'}</td>
          <td>${u.id === state.user.id ? '<span class="muted small">Tú</span>' : `<label class="switch"><input type="checkbox" data-uactive="${u.id}" ${u.active ? 'checked' : ''}><i></i></label>`}</td></tr>`).join('')}
        </tbody></table></div>${pg.html}` : emptyBox('users', 'Sin resultados', 'No hay usuarios que coincidan.');
      pg.bind($('#u-table'));
      $$('[data-uactive]', $('#u-table')).forEach((c) => c.addEventListener('change', async () => {
        try { await api.patch(`/api/admin/customers/${c.dataset.uactive}`, { active: c.checked }); toast(c.checked ? 'Cuenta activada' : 'Cuenta desactivada', 'success'); }
        catch (err) { c.checked = !c.checked; toast(err.message, 'error'); }
      }));
    };
    const reload = () => { custFilter.page = 1; load(); };
    $('#u-q').addEventListener('input', debounce((e) => { custFilter.q = e.target.value.trim(); reload(); }, 350));
    $('#u-role').addEventListener('change', (e) => { custFilter.role = e.target.value; reload(); });
    $('#u-new').addEventListener('click', () => modal({
      title: 'Nuevo usuario',
      body: `<form id="user-form" class="form-grid" novalidate>
        <label class="field"><span>Nombre *</span><input class="input" name="name" required></label>
        <label class="field"><span>Correo *</span><input class="input" name="email" type="email" required></label>
        <label class="field"><span>Contraseña *</span><input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="field"><span>Rol</span><select class="select" name="role"><option value="customer">Cliente</option><option value="admin">Administrador</option></select></label>
        <label class="field full"><span>Teléfono</span><input class="input" name="phone"></label></form>`,
      footer: '<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="user-save" data-loading="Creando…">Crear usuario</button>',
      onMount: (el, close) => {
        $('#user-save', el).addEventListener('click', () => withLoading($('#user-save', el), async () => {
          try { await api.post('/api/admin/customers', formData($('#user-form', el))); toast('Usuario creado', 'success'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
        }));
      },
    }));
    await load();
  }

  /* ============================ Cupones ============================ */
  async function viewCoupons(v, alive) {
    const { items } = await api.get('/api/admin/coupons');
    if (!alive()) return;
    const today = new Date().toISOString().slice(0, 10);
    v.innerHTML = `<div class="toolbar"><p class="muted">Crea códigos de descuento por porcentaje o monto fijo.</p><div class="spacer"></div><button class="btn btn-primary" type="button" id="cp-new">${icon('plus')} Nuevo cupón</button></div>
      <div class="card">${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Descuento</th><th class="right">Compra mínima</th><th>Usos</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
      ${items.map((c) => { const expired = c.expires_at && c.expires_at < today; const exhausted = c.max_uses != null && c.used >= c.max_uses; return `<tr>
        <td><code style="font-weight:700;background:var(--line-2);padding:4px 8px;border-radius:6px">${esc(c.code)}</code></td>
        <td><b>${c.type === 'percent' ? `${c.value}%` : money(c.value)}</b></td>
        <td class="right">${c.min_total ? money(c.min_total) : '—'}</td>
        <td>${c.used}${c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
        <td>${c.expires_at ? esc(fmtDate(c.expires_at + ' 12:00:00')) : 'Sin vencimiento'}</td>
        <td>${!c.active ? '<span class="badge b-muted">Inactivo</span>' : expired ? '<span class="badge b-danger">Vencido</span>' : exhausted ? '<span class="badge b-warning">Agotado</span>' : '<span class="badge b-success">Activo</span>'}</td>
        <td><div class="actions"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-edit="${c.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${c.id}" data-name="${esc(c.code)}" title="Eliminar">${icon('trash')}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyBox('ticket', 'Sin cupones', 'Crea tu primer cupón de descuento.')}</div>`;
    const reload = () => router();
    $('#cp-new').addEventListener('click', () => couponForm(null, reload));
    $$('[data-edit]', v).forEach((b) => b.addEventListener('click', () => couponForm(items.find((c) => c.id === +b.dataset.edit), reload)));
    $$('[data-del]', v).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`¿Eliminar el cupón ${b.dataset.name}?`, { title: 'Eliminar cupón', okText: 'Eliminar', danger: true }))) return;
      try { await api.del(`/api/admin/coupons/${b.dataset.del}`); toast('Cupón eliminado', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function couponForm(c, onSaved) {
    const isNew = !c;
    c = c || { type: 'percent', active: 1, min_total: 0 };
    modal({
      title: isNew ? 'Nuevo cupón' : 'Editar cupón',
      body: `<form id="cp-form" class="form-grid" novalidate>
        <label class="field"><span>Código *</span><input class="input" name="code" required maxlength="30" value="${esc(c.code || '')}" style="text-transform:uppercase" placeholder="EJ: VERANO20"></label>
        <label class="field"><span>Tipo</span><select class="select" name="type"><option value="percent" ${c.type === 'percent' ? 'selected' : ''}>Porcentaje (%)</option><option value="fixed" ${c.type === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label>
        <label class="field"><span>Valor *</span><input class="input" name="value" type="number" min="0.01" step="0.01" required value="${c.value ?? ''}"></label>
        <label class="field"><span>Compra mínima</span><input class="input" name="min_total" type="number" min="0" step="0.01" value="${c.min_total ?? 0}"></label>
        <label class="field"><span>Máximo de usos <small>(vacío = ilimitado)</small></span><input class="input" name="max_uses" type="number" min="1" step="1" value="${c.max_uses ?? ''}"></label>
        <label class="field"><span>Vence el <small>(opcional)</small></span><input class="input" name="expires_at" type="date" value="${esc(c.expires_at || '')}"></label>
        <label class="switch full"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><i></i> Cupón activo</label>
      </form>`,
      footer: `<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="cp-save" data-loading="Guardando…">${isNew ? 'Crear cupón' : 'Guardar'}</button>`,
      onMount: (el, close) => {
        $('#cp-save', el).addEventListener('click', () => withLoading($('#cp-save', el), async () => {
          try {
            const d = formData($('#cp-form', el));
            if (isNew) await api.post('/api/admin/coupons', d); else await api.put(`/api/admin/coupons/${c.id}`, d);
            toast('Cupón guardado', 'success'); close(); onSaved();
          } catch (err) { toast(err.message, 'error'); }
        }));
      },
    });
  }

  /* ============================ Envíos ============================ */
  const SHIP_TYPES = { shalom: 'Shalom (agencia)', delivery: 'Delivery a domicilio', pickup: 'Recojo en tienda', custom: 'Otro courier' };
  async function viewShipping(v, alive) {
    const { items, regions } = await api.get('/api/admin/shipping');
    if (!alive()) return;
    state.regions = regions;
    v.innerHTML = `<div class="toolbar"><p class="muted">Define cómo envías: Shalom, delivery, recojo u otros. Controla el precio por departamento, dónde está disponible y desde qué monto es gratis.</p><div class="spacer"></div><button class="btn btn-primary" type="button" id="sh-new">${icon('plus')} Nuevo método</button></div>
      <div class="card">${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Método</th><th>Tipo</th><th class="right">Precio base</th><th>Precios por departamento</th><th>Disponible en</th><th>Gratis desde</th><th>Activo</th><th></th></tr></thead><tbody>
      ${items.map((m) => { const nr = Object.keys(m.rates).length; return `<tr>
        <td><div class="cell-main">${esc(m.name)}</div><div class="cell-sub">${esc(m.eta || '')}</div></td>
        <td>${esc(SHIP_TYPES[m.type] || m.type)}</td>
        <td class="right"><b>${m.base_price ? money(m.base_price) : 'Gratis'}</b></td>
        <td>${nr ? `${nr} departamento${nr === 1 ? '' : 's'} con precio propio` : '<span class="muted">Mismo precio en todo el país</span>'}</td>
        <td>${m.regions.length ? esc(m.regions.join(', ')) : 'Todo el Perú'}</td>
        <td>${m.free_from > 0 ? money(m.free_from) : '<span class="muted">Nunca</span>'}</td>
        <td><label class="switch"><input type="checkbox" data-shactive="${m.id}" ${m.active ? 'checked' : ''}><i></i></label></td>
        <td><div class="actions"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-edit="${m.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${m.id}" data-name="${esc(m.name)}" title="Eliminar">${icon('trash')}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyBox('truck', 'Sin métodos de envío', 'Crea al menos uno para que tus clientes puedan comprar.')}</div>`;
    const reload = () => router();
    $('#sh-new').addEventListener('click', () => shippingForm(null, reload));
    $$('[data-edit]', v).forEach((b) => b.addEventListener('click', () => shippingForm(items.find((m) => m.id === +b.dataset.edit), reload)));
    $$('[data-shactive]', v).forEach((c) => c.addEventListener('change', async () => {
      try { await api.patch(`/api/admin/shipping/${c.dataset.shactive}`, { active: c.checked }); toast(c.checked ? 'Método activado' : 'Método desactivado', 'success'); }
      catch (err) { c.checked = !c.checked; toast(err.message, 'error'); }
    }));
    $$('[data-del]', v).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`¿Eliminar "${b.dataset.name}"? Los pedidos anteriores no se ven afectados.`, { title: 'Eliminar método', okText: 'Eliminar', danger: true }))) return;
      try { await api.del(`/api/admin/shipping/${b.dataset.del}`); toast('Método eliminado', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function shippingForm(m, onSaved) {
    const isNew = !m;
    m = m || { type: 'shalom', base_price: 0, free_from: 0, rates: {}, regions: [], active: 1 };
    const R = state.regions;
    modal({
      title: isNew ? 'Nuevo método de envío' : 'Editar método de envío', size: 'lg',
      body: `<form id="ship-m-form" class="form-grid" novalidate>
        <label class="field"><span>Nombre visible *</span><input class="input" name="name" required maxlength="80" value="${esc(m.name || '')}" placeholder="Ej: Shalom · recojo en agencia"></label>
        <label class="field"><span>Tipo</span><select class="select" name="type">${Object.entries(SHIP_TYPES).map(([k, l]) => `<option value="${k}" ${m.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><small>Shalom pide agencia y DNI al cliente. Recojo en tienda no pide dirección.</small></label>
        <label class="field full"><span>Descripción para el cliente</span><input class="input" name="description" maxlength="300" value="${esc(m.description || '')}"></label>
        <label class="field"><span>Tiempo de entrega</span><input class="input" name="eta" maxlength="80" value="${esc(m.eta || '')}" placeholder="Ej: 2 a 5 días hábiles"></label>
        <label class="field"><span>Orden</span><input class="input" name="sort" type="number" min="0" value="${m.sort ?? 0}"></label>
        <label class="field"><span>Precio base *</span><input class="input" name="base_price" type="number" min="0" step="0.01" value="${m.base_price}"><small>Se usa en los departamentos sin precio propio.</small></label>
        <label class="field"><span>Envío gratis desde</span><input class="input" name="free_from" type="number" min="0" step="0.01" value="${m.free_from || 0}"><small>0 = nunca gratis</small></label>
        <label class="field full"><span>Enlace de rastreo <small>(opcional)</small></span><input class="input" name="tracking_url" maxlength="300" value="${esc(m.tracking_url || '')}" placeholder="https://… (usa {codigo} donde va el número de guía)"></label>
        <div class="field full"><span>Precio por departamento <small>(vacío = precio base) · marca dónde está disponible (ninguno marcado = todo el país)</small></span>
          <div class="flex mt-1" style="flex-wrap:wrap"><button type="button" class="btn btn-sm" data-allr="1">Marcar todos</button><button type="button" class="btn btn-sm" data-allr="0">Desmarcar todos</button><button type="button" class="btn btn-sm" data-fill>Copiar precio base a todos</button><button type="button" class="btn btn-sm btn-ghost" data-clearp>Borrar precios</button></div>
          <div class="rates-grid mt-1">${R.map((r) => `<div class="rate-row"><label class="check"><input type="checkbox" data-region="${esc(r)}" ${m.regions.includes(r) ? 'checked' : ''}> ${esc(r)}</label><input class="input" type="number" min="0" step="0.01" data-rate="${esc(r)}" value="${m.rates[r] ?? ''}" placeholder="${m.base_price}" aria-label="Precio ${esc(r)}"></div>`).join('')}</div>
        </div>
        <label class="switch full"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}><i></i> Método activo</label>
      </form>`,
      footer: `<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="ship-m-save" data-loading="Guardando…">${isNew ? 'Crear método' : 'Guardar'}</button>`,
      onMount: (el, close) => {
        const form = $('#ship-m-form', el);
        const base = $('[name=base_price]', el);
        base.addEventListener('input', () => $$('[data-rate]', el).forEach((i) => { i.placeholder = base.value || '0'; }));
        $$('[data-allr]', el).forEach((b) => b.addEventListener('click', () => $$('[data-region]', el).forEach((c) => { c.checked = b.dataset.allr === '1'; })));
        $('[data-fill]', el).addEventListener('click', () => $$('[data-rate]', el).forEach((i) => { i.value = base.value; }));
        $('[data-clearp]', el).addEventListener('click', () => $$('[data-rate]', el).forEach((i) => { i.value = ''; }));
        $('#ship-m-save', el).addEventListener('click', () => withLoading($('#ship-m-save', el), async () => {
          const d = formData(form);
          d.rates = {}; $$('[data-rate]', el).forEach((i) => { if (i.value !== '') d.rates[i.dataset.rate] = i.value; });
          d.regions = $$('[data-region]', el).filter((c) => c.checked).map((c) => c.dataset.region);
          if (d.regions.length === R.length) d.regions = [];
          try {
            if (isNew) await api.post('/api/admin/shipping', d); else await api.put(`/api/admin/shipping/${m.id}`, d);
            toast('Método de envío guardado', 'success'); close(); onSaved();
          } catch (err) { toast(err.message, 'error'); }
        }));
      },
    });
  }

  /* ============================ Libro de Reclamaciones ============================ */
  const lrFilter = { status: 'abiertos', q: '' };
  const deadlineBadge = (c) => {
    if (c.status === 'respondido') return '<span class="badge b-success">Respondido</span>';
    if (c.days_left < 0) return `<span class="badge b-danger">Vencido hace ${-c.days_left} día${c.days_left === -1 ? '' : 's'} háb.</span>`;
    if (c.days_left <= 3) return `<span class="badge b-warning">Vence en ${c.days_left} día${c.days_left === 1 ? '' : 's'} háb.</span>`;
    return `<span class="badge b-info">${c.days_left} días háb. restantes</span>`;
  };
  async function viewComplaintsAdmin(v, alive) {
    v.innerHTML = `<div class="toolbar">
      <div class="search-box">${icon('search')}<input class="input" id="lr-q" placeholder="Buscar por N°, nombre, documento, correo o pedido" value="${esc(lrFilter.q)}"></div>
      <select class="select" id="lr-st"><option value="abiertos">Por responder</option><option value="">Todas</option><option value="respondido">Respondidas</option></select>
      <div class="spacer"></div>
      <a class="btn" href="/#/libro-reclamaciones" target="_blank" rel="noopener">${icon('eye')} Ver formulario público</a>
      <a class="btn" href="/img/libro-reclamaciones.svg" download="libro-de-reclamaciones.svg">${icon('download')} Distintivo SVG</a>
      <button class="btn" type="button" id="lr-export" data-loading="Exportando…">${icon('download')} Exportar CSV</button>
    </div>
    <div class="alert alert-info" style="margin-bottom:16px">${icon('info')}<div>Responde cada reclamo o queja en máximo <b>15 días hábiles improrrogables</b>. La respuesta se envía al correo del consumidor y queda registrada en su hoja. Conserva las hojas al menos 2 años (puedes exportarlas a CSV).</div></div>
    <div class="card" id="lr-table"></div>`;
    $('#lr-st').value = lrFilter.status;
    const load = async () => {
      const { items } = await api.get(`/api/admin/complaints${qs(lrFilter)}`);
      if (!alive()) return;
      $('#lr-table').innerHTML = items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Hoja N°</th><th>Tipo</th><th>Consumidor</th><th>Bien</th><th>Plazo</th><th></th></tr></thead><tbody>
        ${items.map((c) => `<tr class="clickable" data-lr="${c.id}"><td><div class="cell-main">${esc(c.number)}</div><div class="cell-sub nowrap">${fmtDate(c.created_at, true)}</div></td>
          <td>${c.type === 'reclamo' ? '<span class="badge b-violet plain">Reclamo</span>' : '<span class="badge b-muted plain">Queja</span>'}</td>
          <td><div>${esc(c.consumer_name)}</div><div class="cell-sub">${esc(c.email)}</div></td>
          <td><div>${esc(c.good_description)}</div>${c.order_code ? `<div class="cell-sub">${esc(c.order_code)}</div>` : ''}</td>
          <td>${deadlineBadge(c)}<div class="cell-sub mt-1">Límite: ${esc(c.due_date.split('-').reverse().join('/'))}</div></td>
          <td class="right">${icon('chevronRight', 'icon-sm')}</td></tr>`).join('')}
        </tbody></table></div>` : emptyBox('book', lrFilter.status === 'abiertos' ? 'No hay reclamos por responder' : 'Sin hojas de reclamación', 'Cuando un cliente registre un reclamo o queja aparecerá aquí y te llegará un correo.');
      $$('[data-lr]', $('#lr-table')).forEach((tr) => tr.addEventListener('click', () => openComplaint(+tr.dataset.lr, load)));
    };
    $('#lr-q').addEventListener('input', debounce((e) => { lrFilter.q = e.target.value.trim(); load(); }, 350));
    $('#lr-st').addEventListener('change', (e) => { lrFilter.status = e.target.value; load(); });
    $('#lr-export').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      try {
        const res = await api.get('/api/admin/complaints-export', { raw: true });
        const blob = await res.blob(); const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `libro-reclamaciones-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (err) { toast(err.message, 'error'); }
    }));
    await load();
  }

  async function openComplaint(id, onChange) {
    const { complaint: c } = await api.get(`/api/admin/complaints/${id}`);
    const row = (k, val) => `<dt>${esc(k)}</dt><dd>${val}</dd>`;
    const sheetUrl = `/#/libro-reclamaciones/${encodeURIComponent(c.number)}?token=${encodeURIComponent(c.access_token)}`;
    const m = modal({
      title: `Hoja de Reclamación N° ${c.number}`, size: 'lg',
      body: `<div class="flex" style="margin:-6px 0 16px;flex-wrap:wrap">${c.type === 'reclamo' ? '<span class="badge b-violet">Reclamo</span>' : '<span class="badge b-muted">Queja</span>'}${deadlineBadge(c)}<span class="muted small">Registrada ${fmtDate(c.created_at, true)} · límite ${esc(c.due_date.split('-').reverse().join('/'))}</span></div>
      <div class="detail-grid">
        <div>
          <div class="detail-box"><h4>1. Consumidor</h4><dl class="kv">${row('Nombre', esc(c.consumer_name))}${row('Documento', `${esc(c.doc_type)} ${esc(c.doc_number)}`)}${row('Domicilio', esc(c.address))}${row('Teléfono', esc(c.phone || '—'))}${row('Correo', `<a href="mailto:${esc(c.email)}" style="color:var(--primary)">${esc(c.email)}</a>`)}${c.is_minor ? row('Apoderado', `${esc(c.guardian_name)} · ${esc(c.guardian_doc)}`) : ''}</dl></div>
          <div class="detail-box"><h4>2. Bien contratado</h4><dl class="kv">${row('Tipo', c.good_type === 'producto' ? 'Producto' : 'Servicio')}${c.order_code ? row('Pedido', esc(c.order_code)) : ''}${row('Monto', c.amount ? money(c.amount) : '—')}${row('Descripción', esc(c.good_description))}</dl></div>
          <div class="detail-box"><h4>3. Detalle y pedido</h4><p class="small" style="white-space:pre-line">${esc(c.detail)}</p><p class="small mt-1"><b>Pedido del consumidor:</b><br><span style="white-space:pre-line">${esc(c.request)}</span></p></div>
        </div>
        <div>
          <form class="detail-box" id="lr-resp"><h4>4. Respuesta del proveedor</h4>
            ${c.response ? `<p class="small muted">Respondido el ${fmtDate(c.responded_at, true)}</p><div class="small" style="white-space:pre-line;padding:10px;background:var(--line-2);border-radius:8px;margin:8px 0">${esc(c.response)}</div><p class="muted small">Puedes enviar una respuesta complementaria:</p>` : ''}
            <textarea class="textarea mt-1" name="response" rows="7" maxlength="5000" placeholder="Hola ${esc(c.consumer_name.split(' ')[0])}, …&#10;Describe las acciones adoptadas y la solución ofrecida."></textarea>
            <button class="btn btn-primary btn-block mt-1" type="submit" data-loading="Enviando…">${icon('mail')} Guardar y enviar respuesta por correo</button>
            <small class="muted">Se envía a ${esc(c.email)} y queda en la hoja del consumidor.</small>
          </form>
          ${c.status === 'pendiente' ? `<button class="btn btn-block mt-1" type="button" id="lr-inproc">${icon('clock')} Marcar “en proceso”</button>` : ''}
          <a class="btn btn-block mt-1" href="${esc(sheetUrl)}" target="_blank" rel="noopener">${icon('receipt')} Ver / imprimir hoja</a>
        </div>
      </div>`,
      footer: '<button class="btn btn-primary" type="button" data-close>Cerrar</button>',
    });
    const f = $('#lr-resp', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const response = f.response.value.trim();
      if (response.length < 10) { toast('Escribe una respuesta (mínimo 10 caracteres)', 'error'); return; }
      await withLoading($('button[type=submit]', f), async () => {
        try {
          const r = await api.patch(`/api/admin/complaints/${id}`, { response });
          toast(r.email && r.email.sent ? 'Respuesta enviada al correo del consumidor' : 'Respuesta guardada. ⚠️ El correo no se envió: revisa la configuración SMTP', r.email && r.email.sent ? 'success' : 'error', 6000);
          m.close(); refreshPending(); await onChange();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    const ip = $('#lr-inproc', m.el);
    if (ip) ip.addEventListener('click', async () => { try { await api.patch(`/api/admin/complaints/${id}`, { status: 'en_proceso' }); toast('Marcado en proceso', 'success'); m.close(); await onChange(); } catch (err) { toast(err.message, 'error'); } });
  }

  /* ============================ Campañas ============================ */
  const pad2 = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const utcToInput = (s) => { const d = UI.parseDate(s); return d && !isNaN(d) ? toLocalInput(d) : ''; };
  const nthWeekday = (y, m, wd, n) => { const first = new Date(y, m, 1); return new Date(y, m, 1 + ((wd - first.getDay() + 7) % 7) + (n - 1) * 7); };

  // Fechas comerciales importantes (Perú). Ajusta o agrega las tuyas aquí.
  function importantDates(year) {
    const D = (m, d) => new Date(year, m, d);
    return [
      { key: 'anio', name: 'Año Nuevo', date: D(0, 1), before: 6, after: 0, color: '#b8860b', title: 'Empieza el año estrenando', sub: 'Ofertas de Año Nuevo en toda la tienda.', pct: 10, scope: 'all' },
      { key: 'sanvalentin', name: 'San Valentín', date: D(1, 14), before: 7, after: 0, color: '#c2185b', title: 'Regalos de San Valentín', sub: 'Sorprende a esa persona especial con descuentos irresistibles.', pct: 10, scope: 'all' },
      { key: 'clases', name: 'Regreso a clases', date: D(2, 15), before: 28, after: 0, color: '#1d4ed8', title: 'Regreso a clases', sub: 'Laptops, accesorios y todo lo que necesitas para empezar con todo.', pct: 10, scope: 'all' },
      { key: 'mujer', name: 'Día de la Mujer', date: D(2, 8), before: 4, after: 0, color: '#7b1fa2', title: 'Celebramos el Día de la Mujer', sub: 'Descuentos especiales para regalar o regalarte.', pct: 10, scope: 'all' },
      { key: 'nino', name: 'Día del Niño', date: nthWeekday(year, 3, 0, 2), before: 7, after: 0, color: '#f59e0b', title: 'Día del Niño', sub: 'Regalos que los harán felices.', pct: 10, scope: 'all' },
      { key: 'madre', name: 'Día de la Madre', date: nthWeekday(year, 4, 0, 2), before: 10, after: 0, color: '#db2777', title: 'Para mamá, lo mejor', sub: 'Regalos con descuento para celebrar el Día de la Madre.', pct: 15, scope: 'all' },
      { key: 'padre', name: 'Día del Padre', date: nthWeekday(year, 5, 0, 3), before: 10, after: 0, color: '#0f766e', title: 'Feliz Día, papá', sub: 'Tecnología y gadgets con descuento para papá.', pct: 15, scope: 'all' },
      { key: 'patrias', name: 'Fiestas Patrias', date: D(6, 29), before: 10, after: 0, color: '#d91023', title: '¡Felices Fiestas Patrias!', sub: 'Celebra con descuentos en toda la tienda.', pct: 15, scope: 'all' },
      { key: 'halloween', name: 'Halloween y Canción Criolla', date: D(9, 31), before: 6, after: 0, color: '#ea580c', title: 'Ofertas de terror', sub: 'Precios que asustan por Halloween y Canción Criolla.', pct: 10, scope: 'all' },
      { key: 'blackfriday', name: 'Black Friday / Cyber Monday', date: nthWeekday(year, 10, 5, 4), before: 4, after: 3, color: '#111111', title: 'Black Friday', sub: 'Los mejores descuentos del año, solo por tiempo limitado.', pct: 20, scope: 'all' },
      { key: 'navidad', name: 'Navidad', date: D(11, 24), before: 23, after: 1, color: '#0f5132', title: 'Regalos de Navidad', sub: 'Encuentra el regalo perfecto con descuento.', pct: 10, scope: 'all' },
    ].map((t) => {
      const start = new Date(t.date); start.setDate(start.getDate() - t.before); start.setHours(0, 0, 0, 0);
      const end = new Date(t.date); end.setDate(end.getDate() + t.after); end.setHours(23, 59, 0, 0);
      return { ...t, start, end };
    });
  }
  function upcomingDates() {
    const now = new Date();
    const y = now.getFullYear();
    const list = importantDates(y).map((t) => (t.end < now ? importantDates(y + 1).find((n) => n.key === t.key) : t));
    return list.sort((a, b) => a.start - b.start);
  }
  const PROMO_STATUS = { activa: 'b-success', programada: 'b-info', finalizada: 'b-muted', inactiva: 'b-muted' };

  async function viewPromotions(v, alive) {
    await loadCategories();
    const { items } = await api.get('/api/admin/promotions');
    if (!alive()) return;
    const now = new Date();
    const used = new Set(items.map((i) => i.name.toLowerCase()));
    const dates = upcomingDates().slice(0, 8);
    const fmtD = (d) => d.toLocaleDateString(state.settings.locale || 'es-PE', { day: 'numeric', month: 'short' });
    v.innerHTML = `
      <div class="flex between" style="margin-bottom:12px;flex-wrap:wrap"><div><h3 style="font-size:16px">Próximas fechas importantes</h3><p class="muted small">Crea una campaña en un clic: banner, aviso con cuenta regresiva y descuento automático que se activa y desactiva solo.</p></div></div>
      <div class="dates-strip">${dates.map((t) => {
        const days = Math.ceil((t.start - now) / 86400000);
        const live = t.start <= now && t.end >= now;
        return `<div class="date-card" style="background:linear-gradient(135deg, ${t.color}, color-mix(in srgb, ${t.color} 65%, #000))">
          <small>${icon('calendar', 'icon-sm')} ${fmtD(t.start)} – ${fmtD(t.end)}</small><b>${esc(t.name)}</b>
          <span>${live ? '¡En curso ahora!' : days <= 0 ? 'Empieza hoy' : `Empieza en ${days} día${days === 1 ? '' : 's'}`}${used.has(t.name.toLowerCase()) ? ' · ya creada' : ''}</span>
          <button class="btn btn-sm" type="button" data-tpl="${t.key}">${icon('plus', 'icon-sm')} Crear campaña</button></div>`;
      }).join('')}</div>
      <div class="toolbar"><h3 style="font-size:16px">Tus campañas</h3><div class="spacer"></div><button class="btn btn-primary" type="button" id="pr-new">${icon('plus')} Nueva campaña</button></div>
      <div class="card">${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Campaña</th><th>Vigencia</th><th>Descuento</th><th>Se muestra en</th><th>Estado</th><th>Activa</th><th></th></tr></thead><tbody>
      ${items.map((p) => `<tr>
        <td><div class="flex"><div class="promo-thumb" style="background-color:${esc(p.bg_color)};color:${esc(p.text_color)};${p.image ? `background-image:url('${esc(p.image)}')` : ''}">${p.image ? '' : esc(p.name)}</div><div><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.title)}</div></div></div></td>
        <td class="nowrap small">${fmtDate(p.starts_at, true)}<br><span class="muted">hasta ${fmtDate(p.ends_at, true)}</span></td>
        <td>${p.discount_value > 0 ? `<b>${p.discount_value}%</b><div class="cell-sub">${p.scope === 'all' ? 'Toda la tienda' : esc(p.category_name || 'Categoría')}</div>` : '<span class="muted">Sin descuento</span>'}</td>
        <td class="small">${[p.show_banner ? 'Banner' : '', p.show_topbar ? 'Barra superior' : ''].filter(Boolean).join(' · ') || '—'}</td>
        <td><span class="badge ${PROMO_STATUS[p.status]}">${esc(p.status.charAt(0).toUpperCase() + p.status.slice(1))}</span></td>
        <td><label class="switch"><input type="checkbox" data-pactive="${p.id}" ${p.active ? 'checked' : ''}><i></i></label></td>
        <td><div class="actions"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-edit="${p.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-dup="${p.id}" title="Duplicar">${icon('copyItem')}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${p.id}" data-name="${esc(p.name)}" title="Eliminar">${icon('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('megaphone', 'Sin campañas', 'Crea una desde las fechas importantes o con “Nueva campaña”.')}</div>`;

    const reload = () => router();
    $('#pr-new').addEventListener('click', () => promoForm(null, reload));
    $$('[data-tpl]', v).forEach((b) => b.addEventListener('click', () => {
      const t = dates.find((d) => d.key === b.dataset.tpl);
      promoForm({
        name: t.name, title: t.title, subtitle: t.sub, cta_text: 'Ver ofertas', cta_link: '#/tienda?on_sale=1',
        bg_color: t.color, text_color: '#ffffff', starts_local: toLocalInput(t.start), ends_local: toLocalInput(t.end),
        discount_value: t.pct, scope: t.scope, show_banner: 1, show_topbar: 1, topbar_text: `${t.name.toUpperCase()} · ${t.pct}% de descuento en toda la tienda`, show_countdown: 1, active: 1,
      }, reload, true);
    }));
    $$('[data-edit]', v).forEach((b) => b.addEventListener('click', () => promoForm(items.find((i) => i.id === +b.dataset.edit), reload)));
    $$('[data-dup]', v).forEach((b) => b.addEventListener('click', () => { const src = items.find((i) => i.id === +b.dataset.dup); promoForm({ ...src, id: undefined, name: `${src.name} (copia)` }, reload, true); }));
    $$('[data-pactive]', v).forEach((c) => c.addEventListener('change', async () => {
      try { await api.patch(`/api/admin/promotions/${c.dataset.pactive}`, { active: c.checked }); toast(c.checked ? 'Campaña activada' : 'Campaña pausada', 'success'); reload(); }
      catch (err) { c.checked = !c.checked; toast(err.message, 'error'); }
    }));
    $$('[data-del]', v).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`¿Eliminar la campaña "${b.dataset.name}"? Los precios vuelven a la normalidad al instante.`, { title: 'Eliminar campaña', okText: 'Eliminar', danger: true }))) return;
      try { await api.del(`/api/admin/promotions/${b.dataset.del}`); toast('Campaña eliminada', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function promoForm(p, onSaved, isTemplate = false) {
    const isNew = !p || !p.id;
    const def = new Date(); def.setMinutes(0, 0, 0);
    const defEnd = new Date(def.getTime() + 7 * 86400000);
    p = { bg_color: '#15171c', text_color: '#ffffff', discount_value: 0, scope: 'all', show_banner: 1, show_topbar: 0, show_countdown: 1, active: 1, cta_text: 'Ver ofertas', cta_link: '#/tienda?on_sale=1', ...(p || {}) };
    const startVal = p.starts_local || (p.starts_at ? utcToInput(p.starts_at) : toLocalInput(def));
    const endVal = p.ends_local || (p.ends_at ? utcToInput(p.ends_at) : toLocalInput(defEnd));
    const links = [['#/tienda', 'Toda la tienda'], ['#/tienda?on_sale=1', 'Ofertas'], ...state.categories.map((c) => [`#/tienda?category=${c.slug}`, c.name])];
    void isTemplate;
    modal({
      title: isNew ? 'Nueva campaña' : 'Editar campaña', size: 'lg',
      body: `<form id="promo-form" class="promo-form" novalidate>
        <div class="form-grid">
          <label class="field"><span>Nombre interno *</span><input class="input" name="name" required maxlength="80" value="${esc(p.name || '')}" placeholder="Ej: Día de la Madre 2027"></label>
          <label class="field"><span>Orden</span><input class="input" name="sort" type="number" min="0" value="${p.sort ?? 0}"></label>
          <label class="field full"><span>Título del banner *</span><input class="input" name="title" required maxlength="120" value="${esc(p.title || '')}"></label>
          <label class="field full"><span>Subtítulo</span><input class="input" name="subtitle" maxlength="300" value="${esc(p.subtitle || '')}"></label>
          <label class="field"><span>Inicia *</span><input class="input" name="starts_at" type="datetime-local" required value="${esc(startVal)}"></label>
          <label class="field"><span>Termina *</span><input class="input" name="ends_at" type="datetime-local" required value="${esc(endVal)}"></label>
          <label class="field"><span>Descuento automático (%)</span><input class="input" name="discount_value" type="number" min="0" max="90" step="1" value="${p.discount_value ?? 0}"><small>0 = solo banner, sin descuento</small></label>
          <label class="field"><span>Aplica a</span><select class="select" name="scope"><option value="all" ${p.scope === 'all' ? 'selected' : ''}>Toda la tienda</option><option value="category" ${p.scope === 'category' ? 'selected' : ''}>Una categoría</option></select></label>
          <label class="field full" id="cat-row" ${p.scope === 'category' ? '' : 'hidden'}><span>Categoría</span><select class="select" name="category_id"><option value="">Selecciona…</option>${state.categories.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Texto del botón</span><input class="input" name="cta_text" maxlength="40" value="${esc(p.cta_text || '')}"></label>
          <label class="field"><span>Enlace del botón</span><input class="input" name="cta_link" maxlength="300" list="promo-links" value="${esc(p.cta_link || '')}"><datalist id="promo-links">${links.map(([u, l]) => `<option value="${esc(u)}">${esc(l)}</option>`).join('')}</datalist></label>
          ${imageField(p.image, { name: 'image', label: 'Imagen del banner (opcional)', aspect: '16/6', variant: 'wide', hint: 'Recomendado 1600×600. Sin imagen se usa el color de fondo.' })}
          <label class="field"><span>Color de fondo</span><div class="color-row"><input type="color" data-color="bg_color" value="${esc(p.bg_color)}" aria-label="Color de fondo"><input class="input" name="bg_color" value="${esc(p.bg_color)}" maxlength="7"></div></label>
          <label class="field"><span>Color del texto</span><div class="color-row"><input type="color" data-color="text_color" value="${esc(p.text_color)}" aria-label="Color del texto"><input class="input" name="text_color" value="${esc(p.text_color)}" maxlength="7"></div></label>
          <label class="switch full"><input type="checkbox" name="show_banner" ${p.show_banner ? 'checked' : ''}><i></i> Mostrar banner en la portada</label>
          <label class="switch full"><input type="checkbox" name="show_countdown" ${p.show_countdown ? 'checked' : ''}><i></i> Mostrar cuenta regresiva</label>
          <label class="switch full"><input type="checkbox" name="show_topbar" ${p.show_topbar ? 'checked' : ''}><i></i> Mostrar aviso en la barra superior</label>
          <label class="field full" id="tb-row" ${p.show_topbar ? '' : 'hidden'}><span>Texto del aviso</span><input class="input" name="topbar_text" maxlength="160" value="${esc(p.topbar_text || '')}" placeholder="Ej: CYBER WOW · 20% en toda la tienda"></label>
          <label class="switch full"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><i></i> Campaña habilitada</label>
        </div>
        <aside class="promo-preview"><span class="label">Vista previa</span><div class="mt-1" id="promo-prev"></div><p class="muted small mt-1">La campaña se activa y se desactiva sola según las fechas. Los precios con descuento se ven en toda la tienda y se respetan en el pedido.</p></aside>
      </form>`,
      footer: `<button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="promo-save" data-loading="Guardando…">${isNew ? 'Crear campaña' : 'Guardar cambios'}</button>`,
      onMount: (el, close) => {
        const form = $('#promo-form', el);
        bindImageFields(el);
        const preview = () => {
          const d = formData(form);
          const bg = /^#[0-9a-f]{6}$/i.test(d.bg_color) ? d.bg_color : '#15171c';
          const fg = /^#[0-9a-f]{6}$/i.test(d.text_color) ? d.text_color : '#ffffff';
          $('#promo-prev', el).innerHTML = `${d.show_banner ? `<div class="bn ${d.image ? '' : 'no-img'}" style="--bn-bg:${bg};background-color:${bg};color:${fg};${d.image ? `background-image:url('${esc(d.image)}')` : ''}">
            ${Number(d.discount_value) > 0 ? `<span class="bn-tag">-${esc(d.discount_value)}% ${d.scope === 'category' ? 'en categoría' : 'en todo'}</span>` : ''}
            <h4>${esc(d.title || 'Título de la campaña')}</h4>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}
            ${d.show_countdown ? '<div class="bn-count"><i>03d</i><i>12h</i><i>45m</i><i>10s</i></div>' : ''}
            ${d.cta_text ? `<span class="bn-cta">${esc(d.cta_text)}</span>` : ''}</div>` : '<div class="empty small" style="padding:20px">Banner desactivado</div>'}
            ${d.show_topbar ? `<div class="topbar-preview" style="background:${bg};color:${fg}">${esc(d.topbar_text || d.title || '')}${d.show_countdown ? ' · termina en 3d 12h' : ''}</div>` : ''}`;
          $('#cat-row', el).hidden = d.scope !== 'category';
          $('#tb-row', el).hidden = !d.show_topbar;
        };
        $$('[data-color]', el).forEach((c) => {
          const txt = $(`input[name=${c.dataset.color}]`, el);
          c.addEventListener('input', () => { txt.value = c.value; preview(); });
          txt.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) c.value = txt.value; preview(); });
        });
        form.addEventListener('input', preview);
        form.addEventListener('change', preview);
        preview();
        $('#promo-save', el).addEventListener('click', () => withLoading($('#promo-save', el), async () => {
          const d = formData(form);
          if (!d.name.trim() || !d.title.trim() || !d.starts_at || !d.ends_at) { toast('Completa nombre, título y fechas', 'error'); return; }
          const st = new Date(d.starts_at); const en = new Date(d.ends_at);
          if (isNaN(st) || isNaN(en) || en <= st) { toast('La fecha de fin debe ser posterior a la de inicio', 'error'); return; }
          d.starts_at = st.toISOString(); d.ends_at = en.toISOString();
          try {
            if (isNew) await api.post('/api/admin/promotions', d); else await api.put(`/api/admin/promotions/${p.id}`, d);
            toast(isNew ? 'Campaña creada' : 'Campaña actualizada', 'success'); close(); onSaved();
          } catch (err) { toast(err.message, 'error'); }
        }));
      },
    });
  }

  /* ============================ Ajustes ============================ */
  let settingsTab = 'general';
  async function viewSettings(v, alive) {
    const { settings: s } = await api.get('/api/admin/settings');
    if (!alive()) return;
    const f = (name, label, opts = {}) => `<label class="field ${opts.full ? 'full' : ''}"><span>${label}</span>${opts.textarea
      ? `<textarea class="textarea" name="${name}" rows="${opts.rows || 3}">${esc(s[name])}</textarea>`
      : `<input class="input" name="${name}" type="${opts.type || 'text'}" value="${esc(s[name])}" ${opts.attrs || ''}>`}${opts.help ? `<small>${opts.help}</small>` : ''}</label>`;
    const sw = (name, label) => `<label class="switch full"><input type="checkbox" name="${name}" ${s[name] === '1' ? 'checked' : ''}><i></i> ${label}</label>`;
    const sec = (title, desc, body) => `<section class="card settings-sec"><div><h3>${title}</h3><p>${desc}</p></div><div class="form-grid">${body}</div></section>`;
    const TABS = [
      ['general', 'General', icon('store', 'icon-sm')],
      ['marca', 'Logo y marca', icon('image', 'icon-sm')],
      ['portada', 'Portada y textos', icon('home', 'icon-sm')],
      ['precios', 'Precios e impuestos', icon('tag', 'icon-sm')],
      ['pagos', 'Pagos por WhatsApp', icon('whatsapp', 'icon-sm')],
      ['comprobantes', 'Boletas', icon('receipt', 'icon-sm')],
      ['correos', 'Correos', icon('mail', 'icon-sm')],
      ['paginas', 'Páginas legales', icon('info', 'icon-sm')],
    ];
    v.innerHTML = `<div class="tabs" role="tablist">${TABS.map(([id, l, ic]) => `<button type="button" role="tab" data-tab="${id}">${ic} ${l}</button>`).join('')}</div>
    <form id="settings-form" novalidate><div class="settings-grid">
      <div data-pane="general">
        ${sec('Datos de la tienda', 'Nombre comercial y forma de contacto. Se muestran en toda la tienda.', `
          ${f('store_name', 'Nombre de la tienda *')}
          ${f('store_tagline', 'Eslogan')}
          ${f('contact_email', 'Correo', { type: 'email' })}
          ${f('contact_phone', 'Teléfono visible')}
          ${f('address', 'Dirección de la tienda', { help: 'También se usa para “Recojo en tienda”.' })}
          ${f('business_hours', 'Horario de atención', { help: 'Se muestra en el pie de página.' })}
          ${f('instagram', 'Instagram (URL)')}
          ${f('facebook', 'Facebook (URL)')}
          ${f('tiktok', 'TikTok (URL)')}
          ${f('low_stock_threshold', 'Alerta de stock bajo (unidades)', { type: 'number', attrs: 'min="0" step="1"' })}`)}
      </div>
      <div data-pane="marca">
        ${sec('Logo', 'Se adapta solo al encabezado, pie de página, panel, comprobantes y pestaña del navegador, en PC y celular.', `
          ${imageField(s.store_logo, { name: 'store_logo', label: 'Logo principal (para fondo claro)', aspect: 'free', variant: 'logo', transparent: true, hint: 'Acepta SVG (vectorial, se ve nítido en todo tamaño) o PNG transparente. El PNG se puede recortar antes de subir.' })}
          ${imageField(s.store_logo_dark, { name: 'store_logo_dark', label: 'Logo para fondo oscuro (opcional)', aspect: 'free', variant: 'logo dark', transparent: true, hint: 'SVG o PNG en versión clara/blanca. Si no la subes, se muestra el logo normal sobre una placa blanca.' })}
          ${sw('logo_show_name', 'Mostrar el nombre de la tienda junto al logo')}`)}
        ${sec('Color de marca', 'Color de botones, enlaces y detalles.', `
          <label class="field"><span>Color principal</span><div class="color-row"><input type="color" id="color-pick" value="${esc(s.primary_color)}" aria-label="Elegir color"><input class="input" name="primary_color" value="${esc(s.primary_color)}" maxlength="7"></div></label>`)}
      </div>
      <div data-pane="portada">
        ${sec('Barra superior', 'Mensaje fijo arriba de la tienda. Si hay una campaña con aviso activo, se muestra la campaña.', `
          ${f('topbar_text', 'Mensaje', { full: true, help: 'Vacío = mensaje automático de envío gratis y medios de pago.' })}`)}
        ${sec('Portada principal', 'Textos del banner principal de inicio.', `
          ${f('hero_eyebrow', 'Etiqueta superior')}
          ${f('hero_cta_text', 'Texto del botón')}
          ${f('hero_title', 'Título', { full: true })}
          ${f('hero_subtitle', 'Subtítulo', { full: true, textarea: true, rows: 2 })}`)}
        ${sec('Beneficios', 'Las 4 tarjetas debajo de la portada.', [1, 2, 3, 4].map((n) => `${f(`perk${n}_title`, `Beneficio ${n} · título`)}${f(`perk${n}_text`, `Beneficio ${n} · texto`)}`).join(''))}
        ${sec('Banner promocional', 'Franja de color en la portada (ej. cupón de bienvenida).', `
          ${sw('promo_banner_show', 'Mostrar banner promocional')}
          ${f('promo_banner_title', 'Título', { full: true })}
          ${f('promo_banner_text', 'Texto', { full: true })}
          ${f('promo_banner_cta', 'Texto del botón')}
          ${f('promo_banner_link', 'Enlace del botón', { help: 'Ej: #/tienda?on_sale=1' })}`)}
        ${sec('Secciones de inicio', 'Elige qué bloques se muestran en la portada.', `
          ${sw('home_show_categories', 'Categorías')}${sw('home_show_featured', 'Productos destacados')}${sw('home_show_new', 'Recién llegados')}`)}
      </div>
      <div data-pane="precios">
        ${sec('Moneda', 'Cómo se muestran los precios.', `
          ${f('currency', 'Moneda (ISO)', { help: 'PEN, USD, MXN, COP…', attrs: 'maxlength="3" style="text-transform:uppercase"' })}
          ${f('locale', 'Formato regional', { help: 'es-PE, es-MX, en-US…' })}
          ${f('currency_name', 'Nombre de la moneda en letras', { help: 'Para el “SON: … SOLES” del comprobante' })}`)}
        ${sec('Impuesto', 'Cálculo del IGV/IVA en carrito, pedidos y comprobantes.', `
          ${f('tax_label', 'Nombre del impuesto', { help: 'IGV, IVA…' })}
          ${f('tax_rate', 'Tasa (%)', { type: 'number', attrs: 'min="0" step="0.01"' })}
          ${sw('tax_included', 'Los precios ya incluyen el impuesto')}`)}
        <div class="alert alert-info">${icon('info')}<div>Los costos de envío se configuran en <a href="#/envios" style="font-weight:600;text-decoration:underline">Envíos</a> y los descuentos de productos en cada producto, con <b>Descuento masivo</b> o con <a href="#/campanas" style="font-weight:600;text-decoration:underline">Campañas</a>.</div></div>
      </div>
      <div data-pane="comprobantes">
        ${sec('Datos del emisor', 'Aparecen en la cabecera de cada boleta.', `
          ${f('company_name', 'Razón social', { full: true })}
          ${f('company_ruc', 'RUC', { attrs: 'maxlength="11" inputmode="numeric"' })}`)}
        ${sec('Numeración', 'La boleta se emite cuando confirmas el pago del pedido y recibe el siguiente número automáticamente.', `
          ${f('boleta_series', 'Serie de boletas', { attrs: 'maxlength="4" style="text-transform:uppercase"' })}
          ${f('boleta_next', 'Próximo N° de boleta', { type: 'number', attrs: 'min="1" step="1"' })}`)}
        ${sec('Pie del comprobante', 'Texto legal o de agradecimiento al final.', `${f('receipt_footer', 'Texto', { full: true, textarea: true, rows: 3 })}`)}
        <div class="alert alert-warning">${icon('alert')}<div>Esta boleta es una representación impresa de la venta. Para emitir comprobantes electrónicos válidos ante SUNAT necesitas conectar un proveedor autorizado (OSE/PSE), igual que la pasarela de pagos.</div></div>
      </div>
      <div data-pane="pagos">
        ${sec('Cómo funciona', 'El cliente confirma su pedido y se abre WhatsApp con el resumen y el total. Te envía la captura, verificas el pago en tu app y en el pedido presionas “Confirmar pago recibido”: se emite la boleta y se la envías por WhatsApp con un clic.', `
          ${f('whatsapp', 'Número de WhatsApp que recibe los pedidos *', { help: 'Con código de país, solo números. Ej: 51960685684' })}
          ${sw('wa_auto_open', 'Abrir WhatsApp automáticamente al confirmar el pedido')}
          ${f('wa_message_extra', 'Frase final del mensaje', { full: true, help: 'Ej: Adjunto la captura de mi pago.' })}`)}
        ${sec('Métodos de pago', 'Activa los que aceptas. Se muestran en el checkout.', `
          ${sw('pay_yape', 'Yape / Plin')}
          ${f('yape_number', 'Número Yape / Plin')}
          ${sw('pay_transfer', 'Transferencia bancaria')}
          ${f('bank_info', 'Cuentas bancarias', { full: true, textarea: true, rows: 3 })}
          ${sw('pay_cod', 'Pago contra entrega')}`)}
      </div>
      <div data-pane="correos">
        <div id="smtp-status"></div>
        ${sec('¿A dónde llegan los avisos?', 'Puedes poner varios correos separados por comas.', `
          ${f('complaints_email', 'Correo para el Libro de Reclamaciones *', { full: true, type: 'text', help: 'Aquí te llega cada nuevo reclamo o queja con su fecha límite de respuesta.' })}
          ${f('notify_email', 'Correo para avisos de pedidos', { full: true, type: 'text', help: 'Vacío = se usa el correo de contacto.' })}
          ${sw('notify_orders', 'Avisarme por correo cada vez que entra un pedido')}
          ${sw('email_customers', 'Enviar correos al cliente: pedido recibido y boleta al confirmar el pago')}`)}
        ${sec('Probar el envío', 'Envía un correo de prueba para confirmar que todo funciona.', `
          <div class="flex full" style="flex-wrap:wrap"><input class="input grow" id="test-to" type="email" placeholder="tu@correo.com" style="min-width:220px"><button class="btn" type="button" id="test-mail" data-loading="Enviando…">${icon('mail')} Enviar prueba</button></div>`)}
        <section class="card"><div class="panel-head"><h3>Últimos correos</h3><button class="btn btn-sm" type="button" id="mail-refresh">${icon('refresh', 'icon-sm')} Actualizar</button></div><div class="panel-body" id="mail-log"></div></section>
      </div>
      <div data-pane="paginas">
        ${sec('Términos y condiciones', 'Se enlaza en el pie de página y en el checkout.', f('page_terms', 'Contenido', { full: true, textarea: true, rows: 9 }))}
        ${sec('Cambios y devoluciones', 'Política visible en el pie de página.', f('page_returns', 'Contenido', { full: true, textarea: true, rows: 7 }))}
        ${sec('Envíos', 'Información de envíos (Shalom, delivery, recojo).', f('page_shipping', 'Contenido', { full: true, textarea: true, rows: 7 }))}
        ${sec('Política de privacidad', 'Ley N° 29733 y su Reglamento (D.S. 016-2024-JUS). Se enlaza en el registro, el checkout y el pie de página.', f('page_privacy', 'Contenido', { full: true, textarea: true, rows: 14, help: 'Puedes usar {empresa}, {ruc}, {ruc_texto}, {direccion}, {correo} y {tienda}: se reemplazan con tus datos de Ajustes.' }))}
        <div class="alert alert-info">${icon('info')}<div>Los textos son una base. Revísalos con tu asesor legal y, si corresponde, inscribe tu banco de datos personales ante la Autoridad Nacional de Protección de Datos Personales.</div></div>
      </div>
    </div>
    <div class="save-bar"><a class="btn" href="/" target="_blank" rel="noopener">${icon('eye')} Ver tienda</a><button class="btn btn-primary btn-lg" type="submit" data-loading="Guardando…">Guardar ajustes</button></div></form>`;
    const showTab = (id) => {
      settingsTab = id;
      $$('[data-tab]', v).forEach((b) => { b.classList.toggle('active', b.dataset.tab === id); b.setAttribute('aria-selected', b.dataset.tab === id); });
      $$('[data-pane]', v).forEach((p) => { p.hidden = p.dataset.pane !== id; });
    };
    $$('[data-tab]', v).forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab(settingsTab);
    const loadMail = async () => {
      try {
        const r = await api.get('/api/admin/email/status');
        $('#smtp-status').innerHTML = r.configured
          ? `<div class="alert alert-success" style="margin-bottom:0">${icon('check')}<div><b>Correo configurado.</b> Los avisos se están enviando por SMTP.</div></div>`
          : `<div class="alert alert-warning" style="margin-bottom:0">${icon('alert')}<div><b>Falta configurar el correo (SMTP).</b> Agrega en el archivo <code>.env</code>: <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> y <code>MAIL_FROM</code>, y reinicia el servidor. Con Gmail usa una “contraseña de aplicación”. Mientras tanto, los correos se registran abajo como “no configurado”.</div></div>`;
        const st = { enviado: 'b-success', error: 'b-danger', no_configurado: 'b-warning' };
        $('#mail-log').innerHTML = r.log.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Estado</th></tr></thead><tbody>${r.log.map((l) => `<tr><td class="nowrap small">${fmtDate(l.created_at, true)}</td><td class="small">${esc(l.to_addr)}</td><td class="small">${esc(l.subject)}</td><td><span class="badge ${st[l.status] || ''}" title="${esc(l.error || '')}">${esc(l.status.replace('_', ' '))}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Aún no se enviaron correos.</p>';
      } catch (err) { $('#mail-log').innerHTML = `<p class="muted small">${esc(err.message)}</p>`; }
    };
    loadMail();
    $('#mail-refresh').addEventListener('click', loadMail);
    $('#test-mail').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      const to = $('#test-to').value.trim();
      if (!to) { toast('Escribe un correo de prueba', 'error'); return; }
      try { await api.post('/api/admin/email/test', { to }); toast(`Correo de prueba enviado a ${to}`, 'success'); } catch (err) { toast(err.message, 'error', 6000); }
      loadMail();
    }));
    bindImageFields(v);
    const pick = $('#color-pick'); const txt = $('input[name=primary_color]');
    pick.addEventListener('input', () => { txt.value = pick.value; document.documentElement.style.setProperty('--primary', pick.value); });
    txt.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(txt.value)) { pick.value = txt.value; document.documentElement.style.setProperty('--primary', txt.value); } });
    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      d.currency = (d.currency || '').toUpperCase();
      await withLoading($('button[type=submit]', e.target), async () => {
        try {
          const r = await api.put('/api/admin/settings', d);
          state.settings = r.settings;
          applySettings();
          toast('Ajustes guardados', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  function applySettings() {
    applyFavicon();
    const sl = $('#side-logo'); if (sl) sl.innerHTML = sideLogo();
    document.documentElement.style.setProperty('--primary', state.settings.primary_color || '#e8572a');
    UI.setMoneyFormat(state.settings.locale, state.settings.currency);
  }

  /* ============================ Arranque ============================ */
  async function boot() {
    try {
      const cfg = await api.get('/api/settings');
      state.statuses = cfg.statuses; state.pstatuses = cfg.payment_statuses; state.methods = cfg.payment_methods; state.regions = cfg.regions || [];
      state.settings = cfg.settings;
      applySettings();
      if (!localStorage.getItem(TOKEN)) { renderLogin(); return; }
      const me = await api.get('/api/auth/me').catch(() => null);
      if (!me || me.user.role !== 'admin') { localStorage.removeItem(TOKEN); renderLogin(); return; }
      state.user = me.user;
      const full = await api.get('/api/admin/settings');
      state.settings = full.settings;
      applySettings();
      renderShell();
      if (!location.hash) history.replaceState(null, '', '#/dashboard');
      await router();
      refreshPending();
    } catch (err) {
      root.innerHTML = `<div style="padding:60px">${emptyBox('alert', 'No se pudo cargar el panel', err.message)}</div>`;
    }
  }

  // En celular las tablas se muestran como tarjetas: cada celda toma el nombre de su columna.
  const labelTables = () => $$('.adm-content table.table').forEach((t) => {
    const heads = $$('thead th', t).map((th) => th.textContent.trim());
    $$('tbody tr', t).forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || ''); }));
  });
  new MutationObserver(labelTables).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', router);
  window.addEventListener('auth:expired', () => { state.user = null; toast('Tu sesión expiró. Vuelve a ingresar.', 'error'); renderLogin(); });
  boot();
})();
