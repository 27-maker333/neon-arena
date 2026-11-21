/**
 * Campañas / promociones por fechas.
 * Una campaña activa (active = 1 y la fecha actual entre starts_at y ends_at) puede:
 *  - mostrar un banner en la portada y/o un aviso en la barra superior con cuenta regresiva
 *  - aplicar un % de descuento automático a toda la tienda o a una categoría
 * Si varias campañas aplican al mismo producto, se usa el mayor descuento.
 * Las fechas se guardan en UTC con formato "YYYY-MM-DD HH:MM:SS".
 */
const db = require('../db');
const { money } = require('../utils');

function active() {
  return db.prepare(`SELECT p.*, c.slug AS category_slug, c.name AS category_name FROM promotions p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 AND p.starts_at <= datetime('now') AND p.ends_at > datetime('now')
    ORDER BY p.sort, p.id`).all();
}

function discountFor(product, promos) {
  let best = null;
  for (const pr of promos) {
    if (!(pr.discount_value > 0)) continue;
    if (pr.scope === 'category' && pr.category_id !== product.category_id) continue;
    if (!best || pr.discount_value > best.discount_value) best = pr;
  }
  return best;
}

function apply(p, promos) {
  if (!p) return p;
  const pr = discountFor(p, promos);
  if (!pr) return p;
  const base = p.price;
  const original = p.compare_price && p.compare_price > base ? p.compare_price : base;
  p.price = money(base * (1 - pr.discount_value / 100));
  p.compare_price = original;
  p.promo = { id: pr.id, name: pr.name, pct: pr.discount_value, ends_at: pr.ends_at, bg_color: pr.bg_color, text_color: pr.text_color };
  return p;
}

function applyAll(list, promos = active()) {
  return list.map((p) => apply(p, promos));
}

/** Condición SQL para "productos en oferta" incluyendo los afectados por campañas. */
function onSaleSql(promos = active()) {
  const withDiscount = promos.filter((p) => p.discount_value > 0);
  if (withDiscount.some((p) => p.scope === 'all')) return { sql: '1=1', params: [] };
  const ids = [...new Set(withDiscount.filter((p) => p.scope === 'category' && p.category_id).map((p) => p.category_id))];
  if (!ids.length) return { sql: 'p.compare_price > p.price', params: [] };
  return { sql: `(p.compare_price > p.price OR p.category_id IN (${ids.map(() => '?').join(',')}))`, params: ids };
}

function publicView(p) {
  return {
    id: p.id, name: p.name, title: p.title, subtitle: p.subtitle, image: p.image,
    cta_text: p.cta_text, cta_link: p.cta_link, bg_color: p.bg_color, text_color: p.text_color,
    starts_at: p.starts_at, ends_at: p.ends_at, discount_value: p.discount_value, scope: p.scope,
    category_slug: p.category_slug || null, category_name: p.category_name || null,
    show_banner: p.show_banner, show_topbar: p.show_topbar, topbar_text: p.topbar_text, show_countdown: p.show_countdown,
  };
}

module.exports = { active, apply, applyAll, onSaleSql, publicView };
