/**
 * Métodos de envío (Shalom, delivery, recojo en tienda, personalizados).
 * Cada método tiene un precio base, precios por departamento (rates),
 * departamentos donde está disponible (regions; vacío = todo el país)
 * y un monto a partir del cual el envío es gratis (free_from; 0 = nunca).
 */
const db = require('../db');
const { money } = require('../utils');

const TYPES = ['shalom', 'delivery', 'pickup', 'custom'];
const REGIONS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function parse(m) {
  if (!m) return m;
  let rates = {}; let regions = [];
  try { rates = JSON.parse(m.rates || '{}'); } catch { rates = {}; }
  try { regions = JSON.parse(m.regions || '[]'); } catch { regions = []; }
  return { ...m, rates, regions };
}

function list({ all = false } = {}) {
  return db.prepare(`SELECT * FROM shipping_methods ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`).all().map(parse);
}

function get(id) {
  return parse(db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(id));
}

/** Calcula el costo de un método para una región y un monto (subtotal - descuento). */
function price(m, region, amount) {
  const r = norm(region);
  const available = !r || !m.regions.length || m.regions.some((x) => norm(x) === r);
  let cost = m.base_price;
  if (r) {
    const key = Object.keys(m.rates).find((k) => norm(k) === r);
    if (key !== undefined && Number.isFinite(Number(m.rates[key]))) cost = Number(m.rates[key]);
  }
  const free = m.free_from > 0 && amount >= m.free_from;
  return { available, cost: free ? 0 : money(cost), free, regular: money(cost) };
}

function publicView(m, region, amount) {
  const p = price(m, region, amount);
  return {
    id: m.id, name: m.name, type: m.type, description: m.description, eta: m.eta,
    free_from: m.free_from, regions: m.regions, available: p.available, cost: p.cost, free: p.free,
    min_cost: money(Math.min(m.base_price, ...Object.values(m.rates).map(Number).filter(Number.isFinite))),
  };
}

function minFreeFrom() {
  const vals = list().map((m) => m.free_from).filter((v) => v > 0);
  return vals.length ? Math.min(...vals) : 0;
}

function seedDefaults() {
  if (db.prepare('SELECT 1 FROM shipping_methods LIMIT 1').get()) return;
  const ins = db.prepare(`INSERT INTO shipping_methods (name, type, description, eta, base_price, free_from, rates, regions, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const shalomRates = { Lima: 10, Callao: 10, Ica: 12, Áncash: 13, 'La Libertad': 13, Lambayeque: 14, Piura: 14, Arequipa: 14, Junín: 13,
    Cusco: 16, Puno: 17, Tacna: 16, Moquegua: 16, Cajamarca: 15, Ayacucho: 15, Huánuco: 15, Pasco: 15, Huancavelica: 15, Apurímac: 16,
    Tumbes: 16, 'San Martín': 18, Amazonas: 18, Ucayali: 20, 'Madre de Dios': 22, Loreto: 25 };
  ins.run('Shalom · recojo en agencia', 'shalom', 'Envío a todo el Perú. Recoges en la agencia Shalom de tu ciudad presentando tu DNI.', '2 a 5 días hábiles', 15, 299, JSON.stringify(shalomRates), '[]', 0);
  ins.run('Delivery a domicilio', 'delivery', 'Te lo llevamos a tu puerta en Lima Metropolitana y Callao.', '24 a 48 horas hábiles', 12, 199, '{}', JSON.stringify(['Lima', 'Callao']), 1);
  ins.run('Recojo en tienda', 'pickup', 'Recoge gratis en nuestra tienda. Te avisamos cuando esté listo.', 'Listo en 24 horas', 0, 0, '{}', '[]', 2);
}

module.exports = { TYPES, REGIONS, list, get, price, publicView, minFreeFrom, seedDefaults, parse };
