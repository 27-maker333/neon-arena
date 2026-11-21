const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const settings = require('../settings');
const payment = require('../services/payment');
const orders = require('../services/orders');
const promos = require('../services/promos');
const shipping = require('../services/shipping');
const complaints = require('../services/complaints');
const notify = require('../services/notify');

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { HttpError, v, paginate } = require('../utils');

const router = express.Router();

/* ---------------- Ajustes públicos ---------------- */
router.get('/settings', (_req, res) => {
  res.json({
    settings: settings.getPublic(),
    payment_methods: payment.getMethods(),
    shipping_methods: shipping.list().map((m) => shipping.publicView(m, '', 0)),
    shipping_free_from: shipping.minFreeFrom(),
    regions: shipping.REGIONS,
    statuses: orders.STATUS_LABELS,
    payment_statuses: orders.PAYMENT_LABELS,
  });
});

/* ---------------- Categorías ---------------- */
router.get('/categories', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, c.description, c.image,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
    FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.name
  `).all();
  res.json({ items: rows });
});

/* ---------------- Productos ---------------- */
const PRODUCT_FIELDS = `p.id, p.name, p.slug, p.sku, p.short_description, p.price, p.compare_price, p.stock,
  p.image, p.featured, p.sold, p.created_at, p.category_id, c.name AS category_name, c.slug AS category_slug`;

/* ---------------- Campañas activas ---------------- */
router.get('/promotions', (_req, res) => {
  res.json({ items: promos.active().map(promos.publicView), now: new Date().toISOString() });
});

router.get('/products', (req, res) => {
  const { page, limit, offset } = paginate(req.query, { defaultLimit: 12, maxLimit: 48 });
  const activePromos = promos.active();
  const where = ['p.active = 1', '(c.id IS NULL OR c.active = 1)'];
  const params = [];
  if (req.query.q) {
    const q = `%${String(req.query.q).trim().slice(0, 80)}%`;
    where.push('(p.name LIKE ? OR p.short_description LIKE ? OR p.sku LIKE ? OR c.name LIKE ?)');
    params.push(q, q, q, q);
  }
  if (req.query.category) {
    where.push('c.slug = ?');
    params.push(String(req.query.category));
  }
  if (req.query.featured === '1') where.push('p.featured = 1');
  if (req.query.in_stock === '1') where.push('p.stock > 0');
  if (req.query.on_sale === '1') { const os = promos.onSaleSql(activePromos); where.push(os.sql); params.push(...os.params); }
  const min = Number(req.query.min);
  const max = Number(req.query.max);
  if (req.query.min && Number.isFinite(min)) { where.push('p.price >= ?'); params.push(min); }
  if (req.query.max && Number.isFinite(max)) { where.push('p.price <= ?'); params.push(max); }
  if (req.query.exclude) { where.push('p.id <> ?'); params.push(parseInt(req.query.exclude, 10) || 0); }

  const sorts = {
    new: 'p.created_at DESC, p.id DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    name: 'p.name COLLATE NOCASE ASC',
    popular: 'p.sold DESC, p.id DESC',
  };
  const order = sorts[req.query.sort] || sorts.new;
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`).get(...params).n;
  const items = db.prepare(`
    SELECT ${PRODUCT_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${whereSql} ORDER BY p.stock = 0, ${order} LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const range = db.prepare(`SELECT MIN(price) min, MAX(price) max FROM products WHERE active = 1`).get();
  res.json({ items: promos.applyAll(items, activePromos), total, page, pages: Math.max(1, Math.ceil(total / limit)), price_range: range });
});

router.get('/products/:slug', (req, res) => {
  const p = db.prepare(`
    SELECT ${PRODUCT_FIELDS}, p.description, p.gallery FROM products p
    LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1
  `).get(req.params.slug);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  const related = db.prepare(`
    SELECT ${PRODUCT_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 AND p.id <> ? AND p.category_id IS ? ORDER BY p.stock = 0, p.sold DESC LIMIT 4
  `).all(p.id, p.category_id);
  try { p.gallery = JSON.parse(p.gallery || '[]'); } catch { p.gallery = []; }
  const activePromos = promos.active();
  promos.apply(p, activePromos);
  res.json({ product: p, related: promos.applyAll(related, activePromos) });
});

/* ---------------- Envíos ---------------- */
router.get('/shipping-methods', (req, res) => {
  const region = String(req.query.region || '').slice(0, 80);
  const amount = Number(req.query.amount) || 0;
  res.json({ items: shipping.list().map((m) => shipping.publicView(m, region, amount)) });
});

/* ---------------- Carrito / cotización ---------------- */
router.post('/cart/quote', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.json({ lines: [], warnings: [], subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, coupon: null, coupon_error: null, free_shipping_from: shipping.minFreeFrom(), tax_included: settings.getAll().tax_included === '1', tax_rate: settings.num('tax_rate'), shipping_method: null, shipping_estimate: true });
  }
  res.json(orders.quote(items, req.body.coupon || null, {
    shippingMethodId: parseInt(req.body.shipping_method_id, 10) || null,
    region: String(req.body.region || '').slice(0, 80),
  }));
});

/* ---------------- Pedidos ---------------- */
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos seguidos. Inténtalo en unos minutos.' },
});

router.post('/orders', orderLimiter, optionalAuth, async (req, res) => {
  const b = req.body || {};
  const methods = shipping.list();
  const method = methods.find((m) => m.id === parseInt(b.shipping_method_id, 10)) || null;
  if (methods.length && !method) throw new HttpError(400, 'Selecciona un método de envío');
  const type = method ? method.type : 'custom';
  const isPickup = type === 'pickup';
  const data = {
    customer_name: v.str(b.customer_name, 'El nombre', { required: true, min: 3, max: 100 }),
    email: v.email(b.email),
    phone: v.str(b.phone, 'El teléfono', { required: true, min: 6, max: 30 }),
    document: v.str(b.document, 'El DNI', { max: 20 }),
    address: v.str(b.address, 'La dirección', { required: !isPickup && type !== 'shalom', min: 5, max: 200 }),
    city: v.str(b.city, 'La ciudad', { required: !isPickup, max: 80 }),
    region: v.str(b.region, 'El departamento', { required: !isPickup, max: 80 }),
    reference: v.str(b.reference, 'La referencia', { max: 200 }),
    notes: v.str(b.notes, 'Las notas', { max: 500 }),
    payment_method: v.str(b.payment_method, 'El método de pago', { required: true, max: 40 }),
    shipping_method_id: method ? method.id : null,
    shipping_agency: v.str(b.shipping_agency, 'La agencia Shalom', { required: type === 'shalom', min: 3, max: 160 }),
    receipt_type: 'boleta',
    customer_company: null,
  };
  if (data.document && !/^[A-Za-z0-9]{8,12}$/.test(data.document)) throw new HttpError(400, 'El DNI / CE no es válido');
  if (type === 'shalom' && !/^[A-Za-z0-9]{8,12}$/.test(data.document || '')) {
    throw new HttpError(400, 'Shalom requiere el DNI (o CE) de quien recoge el pedido');
  }
  if (type === 'shalom' && !data.address) data.address = `Agencia Shalom: ${data.shipping_agency}`;
  if (isPickup) {
    data.address = data.address || 'Recojo en tienda';
    data.city = data.city || 'Recojo en tienda';
  }
  if (!payment.isValidMethod(data.payment_method)) throw new HttpError(400, 'Selecciona un método de pago válido');

  const order = orders.createOrder(data, b.items, b.coupon || null, req.user ? req.user.id : null);

  // Guarda la dirección en el perfil del cliente si aún no tiene una.
  if (req.user) {
    db.prepare(`UPDATE users SET phone = COALESCE(NULLIF(phone,''), ?), address = COALESCE(NULLIF(address,''), ?),
      city = COALESCE(NULLIF(city,''), ?), region = COALESCE(NULLIF(region,''), ?) WHERE id = ?`)
      .run(data.phone, data.address, data.city, data.region, req.user.id);
  }

  notify.orderCreated(order, baseUrl(req));

  let pay = { redirectUrl: null, clientData: null, instructions: '' };
  try {
    pay = await payment.createPayment(order);
  } catch (err) {
    console.error('[pagos] Error al iniciar pago:', err);
    orders.addEvent(order.id, 'pago', 'No se pudo iniciar el pago en línea');
  }
  res.status(201).json({
    order: { code: order.code, token: order.access_token, total: order.total },
    payment: pay,
  });
});

router.get('/orders/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.id, o.code, o.access_token AS token, o.total, o.status, o.payment_status, o.payment_method, o.created_at,
      (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS items_count
    FROM orders o WHERE o.user_id = ? OR (o.user_id IS NULL AND o.email = ?) ORDER BY o.id DESC
  `).all(req.user.id, req.user.email);
  res.json({ items: rows });
});

router.post('/orders/track', (req, res) => {
  const code = v.str(req.body.code, 'El código', { required: true, max: 40 }).toUpperCase();
  const email = v.email(req.body.email);
  const o = db.prepare('SELECT code, access_token FROM orders WHERE code = ? AND email = ?').get(code, email);
  if (!o) throw new HttpError(404, 'No encontramos un pedido con esos datos');
  res.json({ code: o.code, token: o.access_token });
});

router.get('/orders/:code', optionalAuth, async (req, res) => {
  const order = orders.getOrderFull('code', String(req.params.code).toUpperCase());
  const okToken = order && req.query.token && req.query.token === order.access_token;
  const okOwner = order && req.user && (order.user_id === req.user.id || req.user.role === 'admin');
  if (!order || (!okToken && !okOwner)) throw new HttpError(404, 'Pedido no encontrado');
  let instructions = '';
  if (order.payment_status === 'pendiente' && order.status !== 'cancelado') {
    try { instructions = (await payment.createPayment(order)).instructions || ''; } catch { instructions = ''; }
  }
  delete order.access_token;
  const sm = order.shipping_method_id ? shipping.get(order.shipping_method_id) : null;
  order.tracking_url = sm && sm.tracking_url && order.tracking_code ? sm.tracking_url.replace(/\{codigo\}/g, encodeURIComponent(order.tracking_code)) : null;
  order.events = order.events.map((e) => ({ type: e.type, message: e.message, created_at: e.created_at }));
  res.json({ order, instructions });
});

/* ---------------- Libro de Reclamaciones ---------------- */
const complaintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados registros seguidos. Inténtalo más tarde o escríbenos por WhatsApp.' },
});

router.post('/complaints', complaintLimiter, (req, res) => {
  const b = req.body || {};
  const isMinor = v.bool(b.is_minor);
  const data = {
    type: v.oneOf(b.type, 'El tipo (reclamo o queja)', ['reclamo', 'queja']),
    consumer_name: v.str(b.consumer_name, 'El nombre completo', { required: true, min: 3, max: 120 }),
    doc_type: v.oneOf(b.doc_type || 'DNI', 'El tipo de documento', ['DNI', 'CE', 'Pasaporte', 'RUC']),
    doc_number: v.str(b.doc_number, 'El número de documento', { required: true, min: 6, max: 15 }),
    address: v.str(b.address, 'El domicilio', { required: true, min: 5, max: 200 }),
    phone: v.str(b.phone, 'El teléfono', { max: 30 }),
    email: v.email(b.email, 'El correo electrónico'),
    is_minor: isMinor ? 1 : 0,
    guardian_name: isMinor ? v.str(b.guardian_name, 'El nombre del padre, madre o apoderado', { required: true, min: 3, max: 120 }) : null,
    guardian_doc: isMinor ? v.str(b.guardian_doc, 'El documento del padre, madre o apoderado', { required: true, min: 6, max: 15 }) : null,
    good_type: v.oneOf(b.good_type || 'producto', 'El bien contratado', ['producto', 'servicio']),
    order_code: v.str(b.order_code, 'El código de pedido', { max: 40 }),
    amount: v.num(b.amount, 'El monto reclamado', { min: 0, max: 100000000 }),
    good_description: v.str(b.good_description, 'La descripción del producto o servicio', { required: true, min: 3, max: 500 }),
    detail: v.str(b.detail, 'El detalle', { required: true, min: 10, max: 3000 }),
    request: v.str(b.request, 'El pedido del consumidor', { required: true, min: 5, max: 2000 }),
    response_channel: 'email',
  };
  const s = settings.getAll();
  const provider = { store_name: s.store_name, company_name: s.company_name || s.store_name, company_ruc: s.company_ruc, address: s.address };
  const c = complaints.create(data, provider);
  notify.complaintCreated(c, baseUrl(req));
  res.status(201).json({ number: c.number, token: c.access_token, due_date: c.due_date });
});

router.get('/complaints/:number', (req, res) => {
  const c = db.prepare('SELECT * FROM complaints WHERE number = ?').get(String(req.params.number));
  if (!c || req.query.token !== c.access_token) throw new HttpError(404, 'Hoja de reclamación no encontrada');
  const { access_token: _t, ...out } = c;
  out.provider = JSON.parse(c.provider_snapshot || '{}');
  delete out.provider_snapshot;
  res.json({ complaint: out });
});

/* ---------------- Webhook de pasarela ---------------- */
router.post('/payments/webhook/:provider', async (req, res) => {
  const result = await payment.handleWebhook(req.params.provider, req);
  if (!result) return res.status(200).json({ received: true, processed: false });
  const order = db.prepare('SELECT id FROM orders WHERE code = ?').get(result.orderCode);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const status = result.status === 'pagado' ? 'pagado' : 'fallido';
  orders.setPayment(order.id, status, result.reference || null);
  res.json({ received: true, processed: true });
});

module.exports = router;
