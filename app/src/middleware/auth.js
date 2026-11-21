const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../utils');

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });
}

function readUser(req) {
  const header = req.headers.authorization || '';
  const [scheme, tok] = header.split(' ');
  if (scheme !== 'Bearer' || !tok) return null;
  try {
    const payload = jwt.verify(tok, config.jwtSecret);
    const user = db
      .prepare('SELECT id, name, email, role, phone, address, city, region, active FROM users WHERE id = ?')
      .get(payload.sub);
    if (!user || !user.active) return null;
    return user;
  } catch {
    return null;
  }
}

// Adjunta req.user si hay token válido (no obliga).
function optionalAuth(req, _res, next) {
  req.user = readUser(req);
  next();
}

function requireAuth(req, _res, next) {
  req.user = readUser(req);
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesión'));
  next();
}

function requireAdmin(req, _res, next) {
  req.user = readUser(req);
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesión'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Acceso solo para administradores'));
  next();
}

module.exports = { sign, optionalAuth, requireAuth, requireAdmin };
