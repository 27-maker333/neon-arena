const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const settings = require('../settings');
const orders = require('../services/orders');
const shipping = require('../services/shipping');
const complaintsSvc = require('../services/complaints');
const notify = require('../services/notify');
const mailer = require('../services/mailer');

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const { requireAdmin } = require('../middleware/auth');
const { HttpError, v, uniqueSlug, paginate, money } = require('../utils');

const router = express.Router();
router.use(requireAdmin);

/* ================= Subida de imágenes ================= */
fs.mkdirSync(config.uploadsDir, { recursive: true });
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, 'Formato no permitido. Usa JPG, PNG, WEBP, GIF o SVG.'));
  },
});

router.post('/upload', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, `La imagen supera ${config.maxUploadMb} MB`));
      return next(err instanceof HttpError ? err : new HttpError(400, err.message));
    }
    if (!req.file) return next(new HttpError(400, 'No se recibió ninguna imagen'));
    if (req.file.mimetype === 'image/svg+xml') {
      const text = fs.readFileSync(req.file.path, 'utf8');
      const bad = !/<svg[\s>]/i.test(text)
        || /<script|<foreignObject|<iframe|<embed|<object|javascript:|\son[a-z]+\s*=|<!ENTITY|xlink:href\s*=\s*["']\s*(?!#|data:image)/i.test(text);
      if (bad) {
        fs.unlinkSync(req.file.path);
        return next(new HttpError(400, 'El SVG contiene código no permitido (scripts o enlaces externos). Exporta un SVG simple.'));
      }
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

function cleanImage(val) {
  const s = v.str(val, 'La imagen', { max: 500 });
  if (!s) return null;
  if (!/^(\/uploads\/|\/img\/|https?:\/\/)/.test(s)) throw new HttpError(400, 'Ruta de imagen no válida');
  return s;
}

function cleanGallery(val) {
  let arr = val;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  if (arr.length > 12) throw new HttpError(400, 'Máximo 12 imágenes adicionales por producto');
  return arr.map(cleanImage).filter(Boolean);
}

function withGallery(p) {
  if (!p) return p;
  try { p.gallery = JSON.parse(p.gallery || '[]'); } catch { p.gallery = []; }
  return p;
}

/* ================= Dashboard ================= */
router.get('/stats', (_req, res) => {
  const valid = "status <> 'cancelado'";
  const totals = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders WHERE ${valid}`).get();
  const paid = db.prepare(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE ${valid} AND payment_status = 'pagado'`).get().v;
  const month = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders
    WHERE ${valid} AND created_at >= date('now','start of month')`).get();
  const prevMonth = db.prepare(`SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE ${valid}
    AND created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`).get();
  const customers = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'customer'").get().n;
  const products = db.prepare('SELECT COUNT(*) n FROM products WHERE active = 1').get().n;
  const threshold = settings.num('low_stock_threshold');
  const lowStock = db.prepare('SELECT id, name, stock, image FROM products WHERE active = 1 AND stock <= ? ORDER BY stock ASC LIMIT 8').all(threshold);
  const pending = db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('pendiente','confirmado','preparando')").get().n;
  const complaintsOpen = db.prepare("SELECT COUNT(*) n FROM complaints WHERE status <> 'respondido'").get().n;
  const toVerify = db.prepare("SELECT COUNT(*) n FROM orders WHERE payment_status = 'pendiente' AND status <> 'cancelado'").get().n;
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all();

  const daily = db.prepare(`SELECT date(created_at) d, COUNT(*) orders, COALESCE(SUM(total),0) revenue
    FROM orders WHERE ${valid} AND created_at >= date('now','-29 days') GROUP BY d`).all();
  const map = new Map(daily.map((r) => [r.d, r]));
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const r = map.get(d);
    series.push({ date: d, orders: r ? r.orders : 0, revenue: r ? money(r.revenue) : 0 });
  }

  const top = db.prepare(`SELECT oi.name, SUM(oi.qty) qty, SUM(oi.total) revenue FROM order_items oi
    JOIN orders o ON o.id = oi.order_id WHERE o.status <> 'cancelado' GROUP BY oi.name ORDER BY qty DESC LIMIT 5`).all();
  const recent = db.prepare(`SELECT id, code, customer_name, total, status, payment_status, created_at FROM orders ORDER BY id DESC LIMIT 6`).all();

  res.json({
    revenue: money(totals.revenue), orders: totals.orders, paid: money(paid),
    avg_ticket: totals.orders ? money(totals.revenue / totals.orders) : 0,
    month_revenue: money(month.revenue), month_orders: month.orders, prev_month_revenue: money(prevMonth.revenue),
    customers, products, pending, to_verify: toVerify, complaints_open: complaintsOpen, low_stock: lowStock, low_stock_threshold: threshold,
    by_status: byStatus, series, top, recent,
  });
});

/* ================= Productos ================= */
function readProduct(body, id = null) {
  const name = v.str(body.name, 'El nombre', { required: true, min: 2, max: 140 });
  const price = v.num(body.price, 'El precio', { required: true, min: 0, max: 10000000 });
  const compare = v.num(body.compare_price, 'El precio anterior', { min: 0, max: 10000000 });
  if (compare !== null && compare > 0 && compare <= price) {
    throw new HttpError(400, 'El precio anterior debe ser mayor que el precio de venta');
  }
  const categoryId = v.int(body.category_id, 'La categoría', { min: 1 });
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
    throw new HttpError(400, 'La categoría no existe');
  }
  const sku = v.str(body.sku, 'El SKU', { max: 60 });
  if (sku && db.prepare('SELECT 1 FROM products WHERE sku = ? AND id IS NOT ?').get(sku, id)) {
    throw new HttpError(409, 'Ya existe un producto con ese SKU');
  }
  return {
    name,
    slug: uniqueSlug(db, 'products', v.str(body.slug, 'El slug', { max: 100 }) || name, id),
    sku,
    category_id: categoryId,
    short_description: v.str(body.short_description, 'La descripción corta', { max: 300 }),
    description: v.str(body.description, 'La descripción', { max: 10000 }),
    price: money(price),
    compare_price: compare ? money(compare) : null,
    stock: v.int(body.stock, 'El stock', { required: true, min: 0, max: 1000000 }),
    image: cleanImage(body.image),
    gallery: JSON.stringify(cleanGallery(body.gallery)),
    featured: v.bool(body.featured) ? 1 : 0,
    active: body.active === undefined ? 1 : v.bool(body.active) ? 1 : 0,
  };
}

router.get('/products', (req, res) => {
  const { page, limit, offset } = paginate(req.query, { defaultLimit: 20 });
  const where = ['1=1'];
  const params = [];
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push('(p.name LIKE ? OR p.sku LIKE ?)');
    params.push(q, q);
  }
  if (req.query.category) { where.push('p.category_id = ?'); params.push(parseInt(req.query.category, 10) || 0); }
  if (req.query.status === 'active') where.push('p.active = 1');
  if (req.query.status === 'inactive') where.push('p.active = 0');
  if (req.query.status === 'low') { where.push('p.stock <= ?'); params.push(settings.num('low_stock_threshold')); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM products p WHERE ${w}`).get(...params).n;
  const items = db.prepare(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/products/:id', (req, res) => {
  const p = withGallery(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json({ product: p });
});

router.post('/products', (req, res) => {
  const d = readProduct(req.body);
  const info = db.prepare(`INSERT INTO products (name, slug, sku, category_id, short_description, description, price,
    compare_price, stock, image, gallery, featured, active) VALUES (@name, @slug, @sku, @category_id, @short_description,
    @description, @price, @compare_price, @stock, @image, @gallery, @featured, @active)`).run(d);
  res.status(201).json({ product: withGallery(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) });
});

router.put('/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Producto no encontrado');
  const d = readProduct(req.body, id);
  db.prepare(`UPDATE products SET name=@name, slug=@slug, sku=@sku, category_id=@category_id,
    short_description=@short_description, description=@description, price=@price, compare_price=@compare_price,
    stock=@stock, image=@image, gallery=@gallery, featured=@featured, active=@active, updated_at=datetime('now') WHERE id=@id`).run({ ...d, id });
  res.json({ product: withGallery(db.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
});

router.patch('/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  const fields = {};
  if ('active' in req.body) fields.active = v.bool(req.body.active) ? 1 : 0;
  if ('featured' in req.body) fields.featured = v.bool(req.body.featured) ? 1 : 0;
  if ('stock' in req.body) fields.stock = v.int(req.body.stock, 'El stock', { required: true, min: 0, max: 1000000 });
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'Nada que actualizar');
  db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...fields, id });
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

router.post('/products/bulk-discount', (req, res) => {
  const pct = v.num(req.body.percent, 'El porcentaje', { required: true, min: 0, max: 95 });
  const catId = req.body.category_id ? v.int(req.body.category_id, 'La categoría', { min: 1 }) : null;
  const rows = db.prepare(`SELECT id, price, compare_price FROM products ${catId ? 'WHERE category_id = ?' : ''}`).all(...(catId ? [catId] : []));
  const upd = db.prepare("UPDATE products SET price = ?, compare_price = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction(() => {
    for (const r of rows) {
      const regular = r.compare_price && r.compare_price > r.price ? r.compare_price : r.price;
      if (pct === 0) upd.run(money(regular), null, r.id);
      else upd.run(money(regular * (1 - pct / 100)), money(regular), r.id);
    }
  })();
  res.json({ updated: rows.length });
});

router.delete('/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (!r.changes) throw new HttpError(404, 'Producto no encontrado');
  res.json({ ok: true });
});

/* ================= Categorías ================= */
router.get('/categories', (_req, res) => {
  const items = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c ORDER BY c.sort, c.name`).all();
  res.json({ items });
});

function readCategory(body, id = null) {
  const name = v.str(body.name, 'El nombre', { required: true, min: 2, max: 80 });
  return {
    name,
    slug: uniqueSlug(db, 'categories', v.str(body.slug, 'El slug', { max: 100 }) || name, id),
    description: v.str(body.description, 'La descripción', { max: 300 }),
    image: cleanImage(body.image),
    sort: v.int(body.sort, 'El orden', { min: 0, max: 9999 }) ?? 0,
    active: body.active === undefined ? 1 : v.bool(body.active) ? 1 : 0,
  };
}

router.post('/categories', (req, res) => {
  const d = readCategory(req.body);
  const info = db.prepare('INSERT INTO categories (name, slug, description, image, sort, active) VALUES (@name, @slug, @description, @image, @sort, @active)').run(d);
  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id)) throw new HttpError(404, 'Categoría no encontrada');
  const d = readCategory(req.body, id);
  db.prepare('UPDATE categories SET name=@name, slug=@slug, description=@description, image=@image, sort=@sort, active=@active WHERE id=@id').run({ ...d, id });
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
});

router.delete('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const n = db.prepare('SELECT COUNT(*) n FROM products WHERE category_id = ?').get(id).n;
  if (n > 0) throw new HttpError(409, `No se puede eliminar: tiene ${n} producto(s). Muévelos a otra categoría primero.`);
  const r = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (!r.changes) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ ok: true });
});

/* ================= Pedidos ================= */
function orderFilters(query) {
  const where = ['1=1'];
  const params = [];
  if (query.status && orders.STATUSES.includes(query.status)) { where.push('status = ?'); params.push(query.status); }
  if (query.payment && orders.PAYMENT_STATUSES.includes(query.payment)) { where.push('payment_status = ?'); params.push(query.payment); }
  if (query.q) {
    const q = `%${String(query.q).trim()}%`;
    where.push('(code LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    params.push(q, q, q, q);
  }
  if (query.from) { where.push('date(created_at) >= date(?)'); params.push(String(query.from)); }
  if (query.to) { where.push('date(created_at) <= date(?)'); params.push(String(query.to)); }
  return { w: where.join(' AND '), params };
}

router.get('/orders', (req, res) => {
  const { page, limit, offset } = paginate(req.query, { defaultLimit: 20 });
  const { w, params } = orderFilters(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM orders WHERE ${w}`).get(...params).n;
  const items = db.prepare(`SELECT id, code, customer_name, email, phone, total, status, payment_status, payment_method, created_at,
    (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = orders.id) AS items_count
    FROM orders WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

function csvCell(val) {
  const s = val == null ? '' : String(val);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/orders/export', (req, res) => {
  const { w, params } = orderFilters(req.query);
  const rows = db.prepare(`SELECT * FROM orders WHERE ${w} ORDER BY id DESC`).all(...params);
  const cols = ['code', 'created_at', 'customer_name', 'email', 'phone', 'document', 'address', 'city', 'region',
    'subtotal', 'discount', 'shipping', 'tax', 'total', 'coupon_code', 'status', 'payment_status', 'payment_method', 'payment_ref'];
  const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\n'));
});

router.get('/orders/:id', (req, res) => {
  const order = orders.getOrderFull('id', parseInt(req.params.id, 10));
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  res.json({ order });
});

router.patch('/orders/:id/shipping', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  const tracking = v.str(req.body.tracking_code, 'El número de guía', { max: 80 });
  const agency = v.str(req.body.shipping_agency, 'La agencia', { max: 160 });
  const cost = req.body.shipping !== undefined && req.body.shipping !== '' ? v.num(req.body.shipping, 'El costo de envío', { min: 0, max: 100000 }) : null;
  db.prepare("UPDATE orders SET tracking_code = ?, shipping_agency = ?, updated_at = datetime('now') WHERE id = ?").run(tracking, agency, id);
  if (cost !== null && cost !== o.shipping) {
    const total = money(o.total - o.shipping + cost);
    db.prepare('UPDATE orders SET shipping = ?, total = ? WHERE id = ?').run(money(cost), total, id);
    orders.addEvent(id, 'envio', `Costo de envío ajustado a ${cost.toFixed(2)}`);
  }
  if (tracking && tracking !== o.tracking_code) orders.addEvent(id, 'envio', `Guía de envío: ${tracking}${agency ? ' · ' + agency : ''}`);
  res.json({ ok: true });
});

router.patch('/orders/:id/status', (req, res) => {
  const status = v.oneOf(req.body.status, 'El estado', orders.STATUSES);
  const note = v.str(req.body.note, 'La nota', { max: 300 });
  const { access_token: _t, ...order } = orders.changeStatus(parseInt(req.params.id, 10), status, note);
  res.json({ order });
});

router.patch('/orders/:id/payment', (req, res) => {
  const ps = v.oneOf(req.body.payment_status, 'El estado de pago', orders.PAYMENT_STATUSES);
  const ref = v.str(req.body.payment_ref, 'La referencia', { max: 120 });
  const updated = orders.setPayment(parseInt(req.params.id, 10), ps, ref);
  if (ps === 'pagado') notify.orderPaid(updated, baseUrl(req));
  const { access_token: _t, ...order } = updated;
  res.json({ order });
});

router.post('/orders/:id/note', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT 1 FROM orders WHERE id = ?').get(id)) throw new HttpError(404, 'Pedido no encontrado');
  const note = v.str(req.body.note, 'La nota', { required: true, max: 500 });
  orders.addEvent(id, 'nota', note);
  res.status(201).json({ ok: true });
});

/* ================= Clientes / usuarios ================= */
router.get('/customers', (req, res) => {
  const { page, limit, offset } = paginate(req.query, { defaultLimit: 20 });
  const where = ['1=1'];
  const params = [];
  if (req.query.role === 'admin' || req.query.role === 'customer') { where.push('u.role = ?'); params.push(req.query.role); }
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    params.push(q, q, q);
  }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${w}`).get(...params).n;
  const items = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.city, u.role, u.active, u.created_at,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status <> 'cancelado') AS orders_count,
    (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.status <> 'cancelado') AS spent
    FROM users u WHERE ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/customers', (req, res) => {
  const name = v.str(req.body.name, 'El nombre', { required: true, min: 2, max: 80 });
  const email = v.email(req.body.email);
  const password = v.str(req.body.password, 'La contraseña', { required: true, min: 8, max: 72 });
  const role = v.oneOf(req.body.role || 'customer', 'El rol', ['admin', 'customer']);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Ya existe un usuario con ese correo');
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), role, v.str(req.body.phone, 'El teléfono', { max: 30 }));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/customers/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  if (id === req.user.id) throw new HttpError(400, 'No puedes modificar tu propia cuenta desde aquí');
  if ('active' in req.body) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(v.bool(req.body.active) ? 1 : 0, id);
  if ('role' in req.body) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(v.oneOf(req.body.role, 'El rol', ['admin', 'customer']), id);
  res.json({ ok: true });
});

/* ================= Cupones ================= */
function readCoupon(body, id = null) {
  const code = v.str(body.code, 'El código', { required: true, min: 3, max: 30 }).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]+$/.test(code)) throw new HttpError(400, 'El código solo admite letras, números, guion y guion bajo');
  if (db.prepare('SELECT 1 FROM coupons WHERE code = ? COLLATE NOCASE AND id IS NOT ?').get(code, id)) {
    throw new HttpError(409, 'Ya existe un cupón con ese código');
  }
  const type = v.oneOf(body.type, 'El tipo', ['percent', 'fixed']);
  const value = v.num(body.value, 'El valor', { required: true, min: 0.01, max: type === 'percent' ? 100 : 10000000 });
  const expires = v.str(body.expires_at, 'La fecha de vencimiento', { max: 10 });
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new HttpError(400, 'Fecha de vencimiento no válida');
  return {
    code, type, value,
    min_total: v.num(body.min_total, 'El monto mínimo', { min: 0 }) ?? 0,
    max_uses: v.int(body.max_uses, 'El máximo de usos', { min: 1 }),
    expires_at: expires,
    active: body.active === undefined ? 1 : v.bool(body.active) ? 1 : 0,
  };
}

router.get('/coupons', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() });
});
router.post('/coupons', (req, res) => {
  const d = readCoupon(req.body);
  const info = db.prepare('INSERT INTO coupons (code, type, value, min_total, max_uses, expires_at, active) VALUES (@code, @type, @value, @min_total, @max_uses, @expires_at, @active)').run(d);
  res.status(201).json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(info.lastInsertRowid) });
});
router.put('/coupons/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT 1 FROM coupons WHERE id = ?').get(id)) throw new HttpError(404, 'Cupón no encontrado');
  const d = readCoupon(req.body, id);
  db.prepare('UPDATE coupons SET code=@code, type=@type, value=@value, min_total=@min_total, max_uses=@max_uses, expires_at=@expires_at, active=@active WHERE id=@id').run({ ...d, id });
  res.json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) });
});
router.delete('/coupons/:id', (req, res) => {
  const r = db.prepare('DELETE FROM coupons WHERE id = ?').run(parseInt(req.params.id, 10));
  if (!r.changes) throw new HttpError(404, 'Cupón no encontrado');
  res.json({ ok: true });
});

/* ================= Libro de Reclamaciones ================= */
function complaintOut(c) {
  if (!c) return c;
  return { ...c, provider: JSON.parse(c.provider_snapshot || '{}'), days_left: c.status === 'respondido' ? null : complaintsSvc.businessDaysLeft(c.due_date) };
}
router.get('/complaints', (req, res) => {
  const where = ['1=1']; const params = [];
  if (['pendiente', 'en_proceso', 'respondido'].includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.status === 'abiertos') where.push("status <> 'respondido'");
  if (req.query.q) { const q = `%${String(req.query.q).trim()}%`; where.push('(number LIKE ? OR consumer_name LIKE ? OR email LIKE ? OR doc_number LIKE ? OR order_code LIKE ?)'); params.push(q, q, q, q, q); }
  const items = db.prepare(`SELECT * FROM complaints WHERE ${where.join(' AND ')} ORDER BY (status = 'respondido'), due_date, id DESC LIMIT 500`).all(...params).map(complaintOut);
  res.json({ items });
});
router.get('/complaints/:id', (req, res) => {
  const c = complaintOut(db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id));
  if (!c) throw new HttpError(404, 'Hoja no encontrada');
  res.json({ complaint: c });
});
router.patch('/complaints/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
  if (!c) throw new HttpError(404, 'Hoja no encontrada');
  if (req.body.response !== undefined) {
    const response = v.str(req.body.response, 'La respuesta', { required: true, min: 10, max: 5000 });
    db.prepare("UPDATE complaints SET response = ?, status = 'respondido', responded_at = datetime('now') WHERE id = ?").run(response, id);
    const fresh = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    const mail = await notify.complaintResponded(fresh, baseUrl(req));
    return res.json({ complaint: complaintOut(fresh), email: mail });
  }
  const status = v.oneOf(req.body.status, 'El estado', ['pendiente', 'en_proceso']);
  db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(status, id);
  res.json({ complaint: complaintOut(db.prepare('SELECT * FROM complaints WHERE id = ?').get(id)) });
});
router.get('/complaints-export', (_req, res) => {
  const rows = db.prepare('SELECT * FROM complaints ORDER BY id').all();
  const cols = ['number', 'created_at', 'type', 'consumer_name', 'doc_type', 'doc_number', 'address', 'phone', 'email', 'is_minor', 'guardian_name', 'guardian_doc',
    'good_type', 'order_code', 'amount', 'good_description', 'detail', 'request', 'due_date', 'status', 'response', 'responded_at'];
  const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="libro-reclamaciones-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + lines.join('\n'));
});

/* ================= Correo ================= */
router.get('/email/status', (_req, res) => {
  res.json({ configured: mailer.isConfigured(), log: mailer.recentLog(25) });
});
router.post('/email/test', async (req, res) => {
  const to = v.email(req.body.to, 'El correo de prueba');
  const r = await mailer.send({ to, kind: 'prueba', subject: `Correo de prueba · ${settings.getAll().store_name}`, html: mailer.layout('¡Funciona! ✅', '<p>Este es un correo de prueba desde el panel de tu tienda. Los avisos de pedidos, boletas y del Libro de Reclamaciones llegarán así.</p>', { baseUrl: baseUrl(req) }) });
  if (!r.sent) throw new HttpError(400, r.error === 'SMTP no configurado' ? 'Falta configurar el SMTP en el archivo .env (ver README)' : `No se pudo enviar: ${r.error}`);
  res.json({ ok: true });
});

/* ================= Métodos de envío ================= */
function readShipping(b) {
  const rates = {};
  const rawRates = typeof b.rates === 'object' && b.rates ? b.rates : {};
  for (const [k, val] of Object.entries(rawRates)) {
    if (!shipping.REGIONS.includes(k) || val === '' || val === null || val === undefined) continue;
    rates[k] = money(v.num(val, `El precio para ${k}`, { min: 0, max: 100000 }));
  }
  const regions = (Array.isArray(b.regions) ? b.regions : []).filter((r) => shipping.REGIONS.includes(r));
  const url = v.str(b.tracking_url, 'El enlace de rastreo', { max: 300 });
  if (url && !/^https?:\/\//.test(url)) throw new HttpError(400, 'El enlace de rastreo debe empezar con https://');
  return {
    name: v.str(b.name, 'El nombre', { required: true, min: 2, max: 80 }),
    type: v.oneOf(b.type || 'custom', 'El tipo', shipping.TYPES),
    description: v.str(b.description, 'La descripción', { max: 300 }),
    eta: v.str(b.eta, 'El tiempo de entrega', { max: 80 }),
    base_price: money(v.num(b.base_price, 'El precio base', { required: true, min: 0, max: 100000 })),
    free_from: money(v.num(b.free_from, 'El monto para envío gratis', { min: 0, max: 10000000 }) || 0),
    rates: JSON.stringify(rates),
    regions: JSON.stringify(regions),
    tracking_url: url,
    active: b.active === undefined ? 1 : v.bool(b.active) ? 1 : 0,
    sort: v.int(b.sort, 'El orden', { min: 0, max: 9999 }) ?? 0,
  };
}
router.get('/shipping', (_req, res) => res.json({ items: shipping.list({ all: true }), regions: shipping.REGIONS }));
router.post('/shipping', (req, res) => {
  const d = readShipping(req.body || {});
  const info = db.prepare(`INSERT INTO shipping_methods (name, type, description, eta, base_price, free_from, rates, regions, tracking_url, active, sort)
    VALUES (@name, @type, @description, @eta, @base_price, @free_from, @rates, @regions, @tracking_url, @active, @sort)`).run(d);
  res.status(201).json({ method: shipping.get(info.lastInsertRowid) });
});
router.put('/shipping/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!shipping.get(id)) throw new HttpError(404, 'Método no encontrado');
  const d = readShipping(req.body || {});
  db.prepare(`UPDATE shipping_methods SET name=@name, type=@type, description=@description, eta=@eta, base_price=@base_price, free_from=@free_from,
    rates=@rates, regions=@regions, tracking_url=@tracking_url, active=@active, sort=@sort WHERE id=@id`).run({ ...d, id });
  res.json({ method: shipping.get(id) });
});
router.patch('/shipping/:id', (req, res) => {
  const r = db.prepare('UPDATE shipping_methods SET active = ? WHERE id = ?').run(v.bool(req.body.active) ? 1 : 0, parseInt(req.params.id, 10));
  if (!r.changes) throw new HttpError(404, 'Método no encontrado');
  res.json({ ok: true });
});
router.delete('/shipping/:id', (req, res) => {
  const r = db.prepare('DELETE FROM shipping_methods WHERE id = ?').run(parseInt(req.params.id, 10));
  if (!r.changes) throw new HttpError(404, 'Método no encontrado');
  res.json({ ok: true });
});

/* ================= Campañas / promociones ================= */
function toUtc(val, name) {
  const s = v.str(val, name, { required: true, max: 40 });
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${name} no es una fecha válida`);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
const HEX = /^#[0-9a-fA-F]{6}$/;
function readPromo(b) {
  const starts = toUtc(b.starts_at, 'La fecha de inicio');
  const ends = toUtc(b.ends_at, 'La fecha de fin');
  if (ends <= starts) throw new HttpError(400, 'La fecha de fin debe ser posterior a la de inicio');
  const scope = v.oneOf(b.scope || 'all', 'El alcance', ['all', 'category']);
  const categoryId = scope === 'category' ? v.int(b.category_id, 'La categoría', { required: true, min: 1 }) : null;
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) throw new HttpError(400, 'La categoría no existe');
  const link = v.str(b.cta_link, 'El enlace del botón', { max: 300 });
  if (link && !/^(#\/|\/|https?:\/\/)/.test(link)) throw new HttpError(400, 'El enlace debe empezar con #/, / o https://');
  const bg = v.str(b.bg_color, 'El color de fondo', { max: 7 }) || '#15171c';
  const fg = v.str(b.text_color, 'El color del texto', { max: 7 }) || '#ffffff';
  if (!HEX.test(bg) || !HEX.test(fg)) throw new HttpError(400, 'Los colores deben tener formato #RRGGBB');
  return {
    name: v.str(b.name, 'El nombre interno', { required: true, min: 2, max: 80 }),
    title: v.str(b.title, 'El título', { required: true, min: 2, max: 120 }),
    subtitle: v.str(b.subtitle, 'El subtítulo', { max: 300 }),
    image: cleanImage(b.image),
    cta_text: v.str(b.cta_text, 'El texto del botón', { max: 40 }),
    cta_link: link,
    bg_color: bg, text_color: fg,
    starts_at: starts, ends_at: ends,
    discount_value: v.num(b.discount_value, 'El descuento', { min: 0, max: 90 }) ?? 0,
    scope, category_id: categoryId,
    show_banner: v.bool(b.show_banner) ? 1 : 0,
    show_topbar: v.bool(b.show_topbar) ? 1 : 0,
    topbar_text: v.str(b.topbar_text, 'El aviso de la barra superior', { max: 160 }),
    show_countdown: v.bool(b.show_countdown) ? 1 : 0,
    active: b.active === undefined ? 1 : v.bool(b.active) ? 1 : 0,
    sort: v.int(b.sort, 'El orden', { min: 0, max: 9999 }) ?? 0,
  };
}
const PROMO_STATUS_SQL = `CASE WHEN p.active = 0 THEN 'inactiva'
  WHEN p.starts_at > datetime('now') THEN 'programada'
  WHEN p.ends_at <= datetime('now') THEN 'finalizada' ELSE 'activa' END AS status`;

router.get('/promotions', (_req, res) => {
  const items = db.prepare(`SELECT p.*, c.name AS category_name, ${PROMO_STATUS_SQL} FROM promotions p
    LEFT JOIN categories c ON c.id = p.category_id ORDER BY (status = 'activa') DESC, (status = 'programada') DESC, p.starts_at DESC`).all();
  res.json({ items, now: new Date().toISOString() });
});
router.get('/promotions/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!p) throw new HttpError(404, 'Campaña no encontrada');
  res.json({ promotion: p });
});
router.post('/promotions', (req, res) => {
  const d = readPromo(req.body || {});
  const info = db.prepare(`INSERT INTO promotions (name, title, subtitle, image, cta_text, cta_link, bg_color, text_color, starts_at, ends_at,
    discount_value, scope, category_id, show_banner, show_topbar, topbar_text, show_countdown, active, sort)
    VALUES (@name, @title, @subtitle, @image, @cta_text, @cta_link, @bg_color, @text_color, @starts_at, @ends_at,
    @discount_value, @scope, @category_id, @show_banner, @show_topbar, @topbar_text, @show_countdown, @active, @sort)`).run(d);
  res.status(201).json({ promotion: db.prepare('SELECT * FROM promotions WHERE id = ?').get(info.lastInsertRowid) });
});
router.put('/promotions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT 1 FROM promotions WHERE id = ?').get(id)) throw new HttpError(404, 'Campaña no encontrada');
  const d = readPromo(req.body || {});
  db.prepare(`UPDATE promotions SET name=@name, title=@title, subtitle=@subtitle, image=@image, cta_text=@cta_text, cta_link=@cta_link,
    bg_color=@bg_color, text_color=@text_color, starts_at=@starts_at, ends_at=@ends_at, discount_value=@discount_value, scope=@scope,
    category_id=@category_id, show_banner=@show_banner, show_topbar=@show_topbar, topbar_text=@topbar_text, show_countdown=@show_countdown,
    active=@active, sort=@sort WHERE id=@id`).run({ ...d, id });
  res.json({ promotion: db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) });
});
router.patch('/promotions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = db.prepare('UPDATE promotions SET active = ? WHERE id = ?').run(v.bool(req.body.active) ? 1 : 0, id);
  if (!r.changes) throw new HttpError(404, 'Campaña no encontrada');
  res.json({ ok: true });
});
router.delete('/promotions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM promotions WHERE id = ?').run(parseInt(req.params.id, 10));
  if (!r.changes) throw new HttpError(404, 'Campaña no encontrada');
  res.json({ ok: true });
});

/* ================= Ajustes ================= */
router.get('/settings', (_req, res) => res.json({ settings: settings.getAll() }));

router.put('/settings', (req, res) => {
  const b = req.body || {};
  const out = {};
  for (const k of Object.keys(settings.DEFAULTS)) if (k in b) out[k] = b[k] == null ? '' : String(b[k]).trim();
  if ('store_name' in out && !out.store_name) throw new HttpError(400, 'El nombre de la tienda es obligatorio');
  if ('primary_color' in out && !/^#[0-9a-fA-F]{6}$/.test(out.primary_color)) throw new HttpError(400, 'El color debe tener formato #RRGGBB');
  for (const k of ['shipping_cost', 'free_shipping_from', 'tax_rate', 'low_stock_threshold']) {
    if (k in out) out[k] = String(v.num(out[k] === '' ? 0 : out[k], `El campo ${k}`, { min: 0, max: 10000000 }));
  }
  if ('tax_included' in out) out.tax_included = v.bool(b.tax_included) ? '1' : '0';
  for (const k of ['logo_show_name', 'promo_banner_show', 'home_show_categories', 'home_show_featured', 'home_show_new', 'pay_yape', 'pay_transfer', 'pay_cod', 'wa_auto_open']) {
    if (k in out) out[k] = v.bool(b[k]) ? '1' : '0';
  }
  for (const k of ['boleta_series']) {
    if (k in out) { out[k] = out[k].toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(out[k])) throw new HttpError(400, 'La serie debe tener 4 caracteres (ej. B001)'); }
  }
  for (const k of ['boleta_next']) {
    if (k in out) out[k] = String(v.int(out[k], 'El número correlativo', { required: true, min: 1, max: 99999999 }));
  }
  const merged = { ...settings.getAll(), ...out };
  if (merged.pay_yape !== '1' && merged.pay_transfer !== '1' && merged.pay_cod !== '1') throw new HttpError(400, 'Activa al menos un método de pago');
  if ('whatsapp' in out && out.whatsapp) { out.whatsapp = out.whatsapp.replace(/\D/g, ''); if (out.whatsapp.length < 9) throw new HttpError(400, 'El número de WhatsApp no es válido (incluye el código de país, ej. 51960685684)'); }
  for (const k of ['complaints_email', 'notify_email']) {
    if (k in out && out[k]) out[k].split(/[,;]/).map((x) => x.trim()).filter(Boolean).forEach((e) => v.email(e, 'El correo'));
  }
  for (const k of ['notify_orders', 'email_customers']) if (k in out) out[k] = v.bool(b[k]) ? '1' : '0';
  if ('company_ruc' in out && out.company_ruc && !/^\d{11}$/.test(out.company_ruc)) throw new HttpError(400, 'El RUC de la empresa debe tener 11 dígitos');
  if ('promo_banner_link' in out && out.promo_banner_link && !/^(#\/|\/|https?:\/\/)/.test(out.promo_banner_link)) throw new HttpError(400, 'El enlace del banner debe empezar con #/, / o https://');
  for (const k of ['store_logo', 'store_logo_dark']) if (k in out) out[k] = cleanImage(out[k]) || '';
  if ('contact_email' in out && out.contact_email) v.email(out.contact_email, 'El correo de contacto');
  if ('currency' in out && !/^[A-Z]{3}$/.test(out.currency)) throw new HttpError(400, 'La moneda debe ser un código ISO de 3 letras (ej. PEN, USD)');
  if ('locale' in out) {
    try { new Intl.NumberFormat(out.locale); } catch { throw new HttpError(400, 'Formato regional no válido (ej. es-PE)'); }
  }
  settings.saveMany(out);
  res.json({ settings: settings.getAll() });
});

/* ================= Eliminar imagen subida no usada (opcional) ================= */
router.delete('/upload', (req, res) => {
  const url = v.str(req.body.url, 'La URL', { required: true, max: 300 });
  if (!url.startsWith('/uploads/')) throw new HttpError(400, 'Solo se pueden eliminar imágenes subidas');
  const file = path.join(config.uploadsDir, path.basename(url));
  const used = db.prepare("SELECT 1 FROM products WHERE image = ? OR gallery LIKE ? UNION SELECT 1 FROM categories WHERE image = ? UNION SELECT 1 FROM promotions WHERE image = ? UNION SELECT 1 FROM settings WHERE value = ?").get(url, `%${url}%`, url, url, url);
  if (used) throw new HttpError(409, 'La imagen está en uso');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

module.exports = router;
