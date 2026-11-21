const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function uniqueSlug(db, table, base, excludeId = null) {
  let slug = slugify(base);
  let candidate = slug;
  let i = 2;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND (? IS NULL OR id <> ?)`);
  while (stmt.get(candidate, excludeId, excludeId)) {
    candidate = `${slug}-${i++}`;
  }
  return candidate;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const v = {
  str(val, name, { required = false, min = 0, max = 255 } = {}) {
    if (val === undefined || val === null || String(val).trim() === '') {
      if (required) throw new HttpError(400, `${name} es ${/^La /.test(name) ? 'obligatoria' : 'obligatorio'}`);
      return null;
    }
    const s = String(val).trim();
    if (s.length < min) throw new HttpError(400, `${name} debe tener al menos ${min} caracteres`);
    if (s.length > max) throw new HttpError(400, `${name} no puede superar ${max} caracteres`);
    return s;
  },
  email(val, name = 'El correo', { required = true } = {}) {
    const s = v.str(val, name, { required, max: 160 });
    if (s === null) return null;
    if (!EMAIL_RE.test(s)) throw new HttpError(400, `${name} no es válido`);
    return s.toLowerCase();
  },
  num(val, name, { required = false, min = -Infinity, max = Infinity } = {}) {
    if (val === undefined || val === null || val === '') {
      if (required) throw new HttpError(400, `${name} es ${/^La /.test(name) ? 'obligatoria' : 'obligatorio'}`);
      return null;
    }
    const n = Number(val);
    if (!Number.isFinite(n)) throw new HttpError(400, `${name} debe ser un número`);
    if (n < min) throw new HttpError(400, `${name} debe ser mayor o igual a ${min}`);
    if (n > max) throw new HttpError(400, `${name} debe ser menor o igual a ${max}`);
    return n;
  },
  int(val, name, opts = {}) {
    const n = v.num(val, name, opts);
    if (n === null) return null;
    if (!Number.isInteger(n)) throw new HttpError(400, `${name} debe ser un número entero`);
    return n;
  },
  bool(val) {
    return val === true || val === 1 || val === '1' || val === 'true' || val === 'on';
  },
  oneOf(val, name, list, { required = true } = {}) {
    if ((val === undefined || val === null || val === '') && !required) return null;
    if (!list.includes(val)) throw new HttpError(400, `${name} no es válido`);
    return val;
  },
};

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function paginate(query, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { HttpError, slugify, uniqueSlug, v, money, token, paginate };
