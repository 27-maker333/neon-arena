/**
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del Consumidor,
 * Ley 29571, y su Reglamento del Libro de Reclamaciones). Plazo de respuesta:
 * 15 días hábiles improrrogables (Ley 31435). Se cuentan desde el día siguiente al registro,
 * excluyendo sábados, domingos y feriados nacionales.
 */
const db = require('../db');
const { token } = require('../utils');

db.exec(`CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reclamo','queja')),
  consumer_name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  is_minor INTEGER NOT NULL DEFAULT 0,
  guardian_name TEXT,
  guardian_doc TEXT,
  good_type TEXT NOT NULL CHECK (good_type IN ('producto','servicio')),
  order_code TEXT,
  amount REAL,
  good_description TEXT NOT NULL,
  detail TEXT NOT NULL,
  request TEXT NOT NULL,
  response_channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_proceso','respondido')),
  response TEXT,
  responded_at TEXT,
  due_date TEXT NOT NULL,
  provider_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function easter(y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const iso = (d) => d.toISOString().slice(0, 10);

/** Feriados nacionales del Perú (fijos + Jueves y Viernes Santo). Agrega aquí feriados no laborables decretados. */
function holidays(y) {
  const fixed = ['01-01', '05-01', '06-07', '06-29', '07-23', '07-28', '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'];
  const set = new Set(fixed.map((md) => `${y}-${md}`));
  const e = easter(y);
  set.add(iso(new Date(e.getTime() - 3 * 86400000)));
  set.add(iso(new Date(e.getTime() - 2 * 86400000)));
  return set;
}
function isBusinessDay(d) {
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !holidays(d.getUTCFullYear()).has(iso(d));
}
/** Fecha límite (YYYY-MM-DD) sumando N días hábiles a partir del día siguiente. Usa la fecha de Lima (UTC-5). */
function addBusinessDays(from, n) {
  const lima = new Date(from.getTime() - 5 * 3600000);
  const d = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));
  let count = 0;
  while (count < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) count++;
  }
  return iso(d);
}
function businessDaysLeft(due) {
  const now = new Date(Date.now() - 5 * 3600000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(`${due}T00:00:00Z`);
  if (d > end) {
    let late = 0; const x = new Date(end);
    while (x < d) { x.setUTCDate(x.getUTCDate() + 1); if (isBusinessDay(x)) late++; }
    return -late;
  }
  let left = 0; const x = new Date(d);
  while (x < end) { x.setUTCDate(x.getUTCDate() + 1); if (isBusinessDay(x)) left++; }
  return left;
}

function nextNumber() {
  const year = new Date(Date.now() - 5 * 3600000).getUTCFullYear();
  const row = db.prepare("SELECT COUNT(*) n FROM complaints WHERE number LIKE ?").get(`%-${year}`);
  return `${String(row.n + 1).padStart(6, '0')}-${year}`;
}

const create = db.transaction((data, providerSnapshot) => {
  const number = nextNumber();
  const due = addBusinessDays(new Date(), 15);
  const info = db.prepare(`INSERT INTO complaints (number, access_token, type, consumer_name, doc_type, doc_number, address, phone, email,
    is_minor, guardian_name, guardian_doc, good_type, order_code, amount, good_description, detail, request, response_channel, due_date, provider_snapshot)
    VALUES (@number, @access_token, @type, @consumer_name, @doc_type, @doc_number, @address, @phone, @email,
    @is_minor, @guardian_name, @guardian_doc, @good_type, @order_code, @amount, @good_description, @detail, @request, @response_channel, @due_date, @provider_snapshot)`)
    .run({ ...data, number, access_token: token(20), due_date: due, provider_snapshot: JSON.stringify(providerSnapshot) });
  return db.prepare('SELECT * FROM complaints WHERE id = ?').get(info.lastInsertRowid);
});

module.exports = { create, addBusinessDays, businessDaysLeft, isBusinessDay };
