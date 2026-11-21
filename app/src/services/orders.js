const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const promos = require('./promos');
const shipping = require('./shipping');
const { HttpError, money, token } = require('../utils');

const STATUSES = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado'];
const PAYMENT_STATUSES = ['pendiente', 'pagado', 'fallido', 'reembolsado'];

const STATUS_LABELS = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  preparando: 'En preparación',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};
const PAYMENT_LABELS = {
  pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  fallido: 'Pago fallido',
  reembolsado: 'Reembolsado',
};

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'El carrito está vacío');
  if (items.length > 100) throw new HttpError(400, 'Demasiados productos en el carrito');
  const map = new Map();
  for (const it of items) {
    const id = parseInt(it && it.id, 10);
    const qty = parseInt(it && it.qty, 10);
    if (!id || !qty || qty < 1) continue;
    map.set(id, Math.min(999, (map.get(id) || 0) + qty));
  }
  if (map.size === 0) throw new HttpError(400, 'El carrito está vacío');
  return [...map.entries()].map(([id, qty]) => ({ id, qty }));
}

function findCoupon(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(String(code).trim());
}

function validateCoupon(coupon, subtotal) {
  if (!coupon || !coupon.active) return 'El cupón no existe o no está activo';
  if (coupon.expires_at && new Date(coupon.expires_at + 'T23:59:59') < new Date()) return 'El cupón ha vencido';
  if (coupon.max_uses != null && coupon.used >= coupon.max_uses) return 'El cupón alcanzó su límite de usos';
  if (subtotal < coupon.min_total) return `El cupón requiere una compra mínima de ${coupon.min_total.toFixed(2)}`;
  return null;
}

/**
 * Calcula los totales en el servidor (fuente de verdad: precios y stock de la BD).
 * strict = true lanza error si hay problemas de stock (para crear pedidos).
 */
function quote(rawItems, couponCode, { strict = false, shippingMethodId = null, region = '' } = {}) {
  const items = normalizeItems(rawItems);
  const stmt = db.prepare(
    'SELECT id, category_id, name, slug, sku, price, compare_price, stock, image, active FROM products WHERE id = ?'
  );
  const activePromos = promos.active();
  const lines = [];
  const warnings = [];
  for (const it of items) {
    const p = promos.apply(stmt.get(it.id), activePromos);
    if (!p || !p.active) {
      if (strict) throw new HttpError(409, 'Un producto de tu carrito ya no está disponible');
      warnings.push({ id: it.id, message: 'Producto no disponible' });
      continue;
    }
    let qty = it.qty;
    if (p.stock <= 0) {
      if (strict) throw new HttpError(409, `"${p.name}" está agotado`);
      warnings.push({ id: p.id, message: `"${p.name}" está agotado` });
      continue;
    }
    if (qty > p.stock) {
      if (strict) throw new HttpError(409, `Solo quedan ${p.stock} unidades de "${p.name}"`);
      warnings.push({ id: p.id, message: `Solo quedan ${p.stock} unidades de "${p.name}"` });
      qty = p.stock;
    }
    lines.push({
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, image: p.image,
      price: p.price, compare_price: p.compare_price, stock: p.stock,
      qty, total: money(p.price * qty), promo: p.promo ? { name: p.promo.name, pct: p.promo.pct } : null,
    });
  }

  const subtotal = money(lines.reduce((s, l) => s + l.total, 0));

  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (couponCode) {
    const c = findCoupon(couponCode);
    couponError = validateCoupon(c, subtotal);
    if (couponError) {
      if (strict) throw new HttpError(400, couponError);
    } else {
      discount = c.type === 'percent' ? (subtotal * c.value) / 100 : c.value;
      discount = money(Math.min(discount, subtotal));
      coupon = { code: c.code, type: c.type, value: c.value };
    }
  }

  const base = money(subtotal - discount);
  let shippingCost = 0;
  let freeFrom = 0;
  let method = null;
  let shippingEstimate = false;
  const methods = shipping.list();
  if (methods.length) {
    let m = shippingMethodId ? methods.find((x) => x.id === Number(shippingMethodId)) : null;
    if (!m) {
      if (strict) throw new HttpError(400, 'Selecciona un método de envío válido');
      m = methods[0];
      shippingEstimate = true;
    }
    const pr = shipping.price(m, region, base);
    if (!pr.available) {
      if (strict) throw new HttpError(400, `"${m.name}" no está disponible para ${region}`);
      shippingEstimate = true;
    }
    shippingCost = pr.cost;
    freeFrom = m.free_from;
    method = { id: m.id, name: m.name, type: m.type, free: pr.free, available: pr.available };
  } else {
    freeFrom = settings.num('free_shipping_from');
    shippingCost = freeFrom > 0 && base >= freeFrom ? 0 : settings.num('shipping_cost');
  }
  const shipping_ = lines.length === 0 ? 0 : money(shippingCost);

  const rate = settings.num('tax_rate');
  const included = settings.getAll().tax_included === '1';
  let tax = 0;
  let total = 0;
  if (included) {
    tax = rate > 0 ? money(base - base / (1 + rate / 100)) : 0;
    total = money(base + shipping_);
  } else {
    tax = money((base * rate) / 100);
    total = money(base + tax + shipping_);
  }

  return {
    lines, warnings, subtotal, discount, shipping: shipping_, tax, total,
    tax_included: included, tax_rate: rate, coupon, coupon_error: couponError,
    free_shipping_from: freeFrom, shipping_method: method, shipping_estimate: shippingEstimate,
  };
}

function newCode() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const exists = db.prepare('SELECT 1 FROM orders WHERE code = ?');
  for (;;) {
    let rnd = '';
    const bytes = crypto.randomBytes(5);
    for (const b of bytes) rnd += chars[b % chars.length];
    const code = `PED-${ymd}-${rnd}`;
    if (!exists.get(code)) return code;
  }
}

function addEvent(orderId, type, message) {
  db.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').run(orderId, type, message);
}

const createOrderTx = db.transaction((data, q, userId) => {
  const code = newCode();
  const info = db.prepare(`
    INSERT INTO orders (code, access_token, user_id, customer_name, email, phone, document, address, city, region,
      reference, notes, subtotal, discount, shipping, tax, total, coupon_code, payment_method,
      shipping_method_id, shipping_method, shipping_type, shipping_agency, receipt_type, receipt_number, customer_company)
    VALUES (@code, @access_token, @user_id, @customer_name, @email, @phone, @document, @address, @city, @region,
      @reference, @notes, @subtotal, @discount, @shipping, @tax, @total, @coupon_code, @payment_method,
      @shipping_method_id, @shipping_method, @shipping_type, @shipping_agency, @receipt_type, @receipt_number, @customer_company)
  `).run({
    shipping_method_id: q.shipping_method ? q.shipping_method.id : null,
    shipping_method: q.shipping_method ? q.shipping_method.name : null,
    shipping_type: q.shipping_method ? q.shipping_method.type : null,
    receipt_number: null,
    code,
    access_token: token(20),
    user_id: userId,
    ...data,
    subtotal: q.subtotal,
    discount: q.discount,
    shipping: q.shipping,
    tax: q.tax,
    total: q.total,
    coupon_code: q.coupon ? q.coupon.code : null,
  });
  const orderId = info.lastInsertRowid;

  const insItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, name, sku, image, price, qty, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const decStock = db.prepare(
    "UPDATE products SET stock = stock - ?, sold = sold + ?, updated_at = datetime('now') WHERE id = ? AND stock >= ?"
  );
  for (const l of q.lines) {
    const r = decStock.run(l.qty, l.qty, l.id, l.qty);
    if (r.changes === 0) throw new HttpError(409, `Stock insuficiente para "${l.name}"`);
    insItem.run(orderId, l.id, l.name, l.sku, l.image, l.price, l.qty, l.total);
  }
  if (q.coupon) db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').run(q.coupon.code);
  addEvent(orderId, 'creado', 'Pedido recibido');
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
});

function createOrder(data, rawItems, couponCode, userId) {
  const q = quote(rawItems, couponCode, { strict: true, shippingMethodId: data.shipping_method_id, region: data.region });
  if (q.lines.length === 0) throw new HttpError(400, 'El carrito está vacío');
  return createOrderTx(data, q, userId || null);
}

function getOrderFull(where, param) {
  const order = db.prepare(`SELECT * FROM orders WHERE ${where} = ?`).get(param);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  order.events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(order.id);
  return order;
}

const changeStatusTx = db.transaction((orderId, status, note) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  if (order.status === status) return order;
  if (order.status === 'cancelado') throw new HttpError(409, 'Un pedido cancelado no puede cambiar de estado');
  if (status === 'cancelado') {
    const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(orderId);
    const restock = db.prepare(
      "UPDATE products SET stock = stock + ?, sold = MAX(0, sold - ?), updated_at = datetime('now') WHERE id = ?"
    );
    for (const it of items) if (it.product_id) restock.run(it.qty, it.qty, it.product_id);
    if (order.coupon_code) db.prepare('UPDATE coupons SET used = MAX(0, used - 1) WHERE code = ?').run(order.coupon_code);
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
  addEvent(orderId, 'estado', `Estado: ${STATUS_LABELS[status]}${note ? ' — ' + note : ''}`);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
});

/** Asigna el siguiente número de boleta (B001-00000001) si el pedido aún no tiene. */
function issueReceipt(order) {
  if (order.receipt_number) return order.receipt_number;
  const all = settings.getAll();
  const series = all.boleta_series || 'B001';
  const next = Math.max(1, parseInt(all.boleta_next, 10) || 1);
  settings.saveMany({ boleta_next: String(next + 1) });
  const num = `${series}-${String(next).padStart(8, '0')}`;
  db.prepare("UPDATE orders SET receipt_type = 'boleta', receipt_number = ? WHERE id = ?").run(num, order.id);
  addEvent(order.id, 'boleta', `Boleta emitida ${num}`);
  return num;
}

const setPaymentTx = db.transaction((orderId, paymentStatus, ref) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  db.prepare("UPDATE orders SET payment_status = ?, payment_ref = COALESCE(?, payment_ref), updated_at = datetime('now') WHERE id = ?")
    .run(paymentStatus, ref || null, orderId);
  addEvent(orderId, 'pago', `${PAYMENT_LABELS[paymentStatus]}${ref ? ' (ref. ' + ref + ')' : ''}`);
  if (paymentStatus === 'pagado') issueReceipt(order);
  if (paymentStatus === 'pagado' && order.status === 'pendiente') {
    db.prepare("UPDATE orders SET status = 'confirmado', updated_at = datetime('now') WHERE id = ?").run(orderId);
    addEvent(orderId, 'estado', 'Estado: Confirmado — pago verificado');
  }
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
});

module.exports = {
  STATUSES, PAYMENT_STATUSES, STATUS_LABELS, PAYMENT_LABELS,
  quote, createOrder, getOrderFull, changeStatus: changeStatusTx, setPayment: setPaymentTx, addEvent,
};
