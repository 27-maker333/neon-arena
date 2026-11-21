const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { HttpError, v } = require('../utils');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, marketing_consent: u.marketing_consent || 0,
    phone: u.phone || '', address: u.address || '', city: u.city || '', region: u.region || '',
  };
}

function checkPassword(pw) {
  const p = v.str(pw, 'La contraseña', { required: true, min: 8, max: 72 });
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    throw new HttpError(400, 'La contraseña debe incluir letras y números');
  }
  return p;
}

router.post('/register', limiter, (req, res) => {
  const name = v.str(req.body.name, 'El nombre', { required: true, min: 2, max: 80 });
  const email = v.email(req.body.email);
  const password = checkPassword(req.body.password);
  const phone = v.str(req.body.phone, 'El teléfono', { max: 30 });
  if (!v.bool(req.body.privacy)) throw new HttpError(400, 'Debes aceptar la política de privacidad para crear tu cuenta');
  const marketing = v.bool(req.body.marketing) ? 1 : 0;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, phone, role, marketing_consent, privacy_accepted_at) VALUES (?, ?, ?, ?, 'customer', ?, datetime('now'))")
    .run(name, email, hash, phone, marketing);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', limiter, (req, res) => {
  const email = v.email(req.body.email);
  const password = v.str(req.body.password, 'La contraseña', { required: true, max: 200 });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  if (!user.active) throw new HttpError(403, 'Tu cuenta está desactivada. Contáctanos.');
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put('/me', requireAuth, (req, res) => {
  const name = v.str(req.body.name, 'El nombre', { required: true, min: 2, max: 80 });
  const phone = v.str(req.body.phone, 'El teléfono', { max: 30 });
  const address = v.str(req.body.address, 'La dirección', { max: 200 });
  const city = v.str(req.body.city, 'La ciudad', { max: 80 });
  const region = v.str(req.body.region, 'La región', { max: 80 });
  db.prepare('UPDATE users SET name = ?, phone = ?, address = ?, city = ?, region = ? WHERE id = ?')
    .run(name, phone, address, city, region, req.user.id);
  if ('marketing' in req.body) db.prepare('UPDATE users SET marketing_consent = ? WHERE id = ?').run(v.bool(req.body.marketing) ? 1 : 0, req.user.id);

  if (req.body.new_password) {
    const full = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(String(req.body.current_password || ''), full.password_hash)) {
      throw new HttpError(400, 'La contraseña actual no es correcta');
    }
    const np = checkPassword(req.body.new_password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(np, 10), req.user.id);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

/* ---- Derechos ARCO: acceso (descargar datos) y cancelación (eliminar cuenta) ---- */
router.get('/me/export', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, name, email, phone, address, city, region, marketing_consent, privacy_accepted_at, created_at FROM users WHERE id = ?').get(req.user.id);
  const orders = db.prepare(`SELECT code, created_at, customer_name, email, phone, document, address, city, region, total, status, payment_status, receipt_number
    FROM orders WHERE user_id = ? ORDER BY id`).all(req.user.id);
  for (const o of orders) o.items = db.prepare('SELECT oi.name, oi.qty, oi.price, oi.total FROM order_items oi JOIN orders x ON x.id = oi.order_id WHERE x.code = ?').all(o.code);
  const recl = db.prepare('SELECT number, created_at, type, detail, request, status, response FROM complaints WHERE email = ?').all(u.email);
  res.setHeader('Content-Disposition', `attachment; filename="mis-datos-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ generado: new Date().toISOString(), cuenta: u, pedidos: orders, reclamaciones: recl });
});

router.delete('/me', requireAuth, (req, res) => {
  const full = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (full.role === 'admin') throw new HttpError(400, 'Las cuentas de administrador no se eliminan desde aquí');
  if (!bcrypt.compareSync(String(req.body.password || ''), full.password_hash)) throw new HttpError(400, 'La contraseña no es correcta');
  // Se anonimiza la cuenta. Los pedidos se conservan por obligación tributaria, desvinculados de la cuenta.
  db.transaction(() => {
    db.prepare(`UPDATE users SET name = 'Usuario eliminado', email = ?, phone = NULL, address = NULL, city = NULL, region = NULL,
      password_hash = ?, active = 0, marketing_consent = 0 WHERE id = ?`).run(`eliminado-${full.id}-${Date.now()}@anon.local`, bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), 4), full.id);
    db.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').run(full.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
