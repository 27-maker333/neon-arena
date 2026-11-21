const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { slugify, money, token } = require('./utils');
const shippingSvc = require('./services/shipping');

const IMG_DIR = path.join(config.publicDir, 'img', 'demo');

// Íconos lineales simples (24x24) para generar imágenes de demostración sin depender de internet.
const ICONS = {
  audio: '<path d="M3 15v-3a9 9 0 0 1 18 0v3"/><rect x="2.5" y="14" width="4" height="7" rx="1.5"/><rect x="17.5" y="14" width="4" height="7" rx="1.5"/>',
  phone: '<rect x="6.5" y="2" width="11" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>',
  laptop: '<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M9 6.5 9.8 2h4.4l.8 4.5M9 17.5l.8 4.5h4.4l.8-4.5M12 9.5V12l1.5 1.5"/>',
  home: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6V16h8v-1.9a6.5 6.5 0 0 0-4-11.6z"/>',
  gaming: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5.5H6.7a4 4 0 0 0-3.9 3.3L2 15a3 3 0 0 0 5.3 2.3L9 15h6l1.7 2.3A3 3 0 0 0 22 15l-.8-6.2a4 4 0 0 0-3.9-3.3z"/>',
  bag: '<path d="M5.5 8h13l1 13.5h-15z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  camera: '<path d="M3 7.5h4l2-3h6l2 3h4V20H3z"/><circle cx="12" cy="13.5" r="3.8"/>',
};

const CATEGORIES = [
  { name: 'Audio', icon: 'audio', hue: 14, desc: 'Audífonos, parlantes y sonido envolvente.' },
  { name: 'Smartphones', icon: 'phone', hue: 220, desc: 'Celulares de última generación.' },
  { name: 'Laptops', icon: 'laptop', hue: 250, desc: 'Portátiles para trabajo, estudio y creación.' },
  { name: 'Relojes inteligentes', icon: 'watch', hue: 160, desc: 'Smartwatches y bandas de actividad.' },
  { name: 'Hogar inteligente', icon: 'home', hue: 42, desc: 'Domótica fácil para tu casa.' },
  { name: 'Gaming', icon: 'gaming', hue: 285, desc: 'Periféricos y accesorios para jugar en serio.' },
  { name: 'Accesorios', icon: 'bag', hue: 195, desc: 'Cargadores, mochilas y más.' },
  { name: 'Cámaras', icon: 'camera', hue: 340, desc: 'Captura y seguridad en alta resolución.' },
];

const P = (name, price, compare, stock, extra = {}) => ({ name, price, compare, stock, ...extra });
const PRODUCTS = {
  Audio: [
    P('Audífonos inalámbricos Pulse ANC', 349, 429, 24, { featured: 1, short: 'Cancelación activa de ruido, 40 h de batería y carga rápida USB-C.' }),
    P('Parlante portátil Boom 20W', 189, null, 40, { short: 'Sonido 360°, resistente al agua IPX7 y 16 h de reproducción.' }),
    P('Earbuds Air Lite', 129, 159, 3, { short: 'Ligeros, con estuche de carga y modo transparencia.' }),
  ],
  Smartphones: [
    P('Smartphone Nova X 256GB', 1899, 2199, 15, { featured: 1, short: 'Pantalla AMOLED 6.7" 120 Hz, triple cámara 108 MP y 5G.' }),
    P('Smartphone Nova Lite 128GB', 899, null, 32, { short: 'Batería de 5000 mAh, pantalla 6.5" y cámara dual 50 MP.' }),
    P('Smartphone Nova Pro Max 512GB', 3299, null, 6, { short: 'El tope de gama: zoom óptico 5x, titanio y carga de 100 W.' }),
  ],
  Laptops: [
    P('Laptop UltraBook 14" i7 16GB', 3999, 4499, 9, { featured: 1, short: 'Ultraligera de 1.2 kg, SSD 1 TB y pantalla 2.8K.' }),
    P('Laptop Studio 16" Ryzen 9', 5499, null, 4, { short: 'Para creadores: 32 GB RAM, GPU dedicada y pantalla 165 Hz.' }),
    P('Chromebook Go 11"', 1199, null, 18, { short: 'Ideal para estudiantes: arranque en segundos y 12 h de batería.' }),
  ],
  'Relojes inteligentes': [
    P('Smartwatch Fit S2', 299, 349, 27, { featured: 1, short: 'Monitoreo de ritmo cardíaco, SpO2, sueño y 100 deportes.' }),
    P('Reloj deportivo GPS Trail', 699, null, 11, { short: 'GPS multibanda, mapas offline y 14 días de batería.' }),
    P('Banda de actividad Move', 119, null, 0, { short: 'Pasos, calorías y notificaciones en una banda ligera.' }),
  ],
  'Hogar inteligente': [
    P('Foco inteligente RGB WiFi', 49, 69, 120, { short: '16 millones de colores, control por app y voz.' }),
    P('Parlante inteligente Home Mini', 199, null, 22, { featured: 1, short: 'Asistente de voz, control del hogar y sonido nítido.' }),
    P('Enchufe inteligente con medidor', 59, null, 64, { short: 'Programa horarios y mide el consumo eléctrico.' }),
  ],
  Gaming: [
    P('Control inalámbrico Pro', 249, null, 19, { short: 'Gatillos hápticos, 30 h de batería y conexión dual.' }),
    P('Teclado mecánico RGB TKL', 329, 389, 14, { featured: 1, short: 'Switches intercambiables en caliente y aluminio anodizado.' }),
    P('Mouse gamer 26K DPI', 179, null, 2, { short: 'Sensor óptico de 26 000 DPI y solo 63 g de peso.' }),
  ],
  Accesorios: [
    P('Mochila urbana antirrobo 15.6"', 159, null, 35, { short: 'Cierres ocultos, puerto USB y tela impermeable.' }),
    P('Cargador GaN 65W 3 puertos', 139, 169, 50, { featured: 1, short: 'Carga laptop, celular y tablet a la vez. Compacto.' }),
    P('Power bank 20 000 mAh', 119, null, 44, { short: 'Carga rápida PD 22.5 W y pantalla de nivel de batería.' }),
  ],
  Cámaras: [
    P('Cámara de acción 4K60', 899, 999, 8, { featured: 1, short: 'Estabilización avanzada, sumergible a 10 m y Wi-Fi.' }),
    P('Cámara de seguridad WiFi 2K', 169, null, 30, { short: 'Visión nocturna a color, detección de personas y audio bidireccional.' }),
    P('Webcam Full HD 1080p', 149, null, 25, { short: 'Enfoque automático, micrófono dual y corrección de luz.' }),
  ],
};

function hsl(h, s, l) { return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`; }

function makeSvg(iconKey, hue, variant = 0) {
  const h2 = hue + 28 + variant * 9;
  const cx1 = 160 + ((variant * 137) % 480);
  const cy1 = 140 + ((variant * 89) % 200);
  const cx2 = 620 - ((variant * 71) % 300);
  const cy2 = 640 - ((variant * 53) % 180);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 70, 94)}"/>
      <stop offset="1" stop-color="${hsl(h2, 65, 84)}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.5" cy="0.45" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="${hsl(hue, 60, 30)}" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="${cx1}" cy="${cy1}" r="190" fill="${hsl(h2, 80, 90)}" opacity="0.7"/>
  <circle cx="${cx2}" cy="${cy2}" r="230" fill="${hsl(hue, 75, 88)}" opacity="0.6"/>
  <circle cx="400" cy="380" r="300" fill="url(#r)"/>
  <ellipse cx="400" cy="640" rx="200" ry="26" fill="${hsl(hue, 50, 40)}" opacity="0.12"/>
  <g filter="url(#s)" transform="translate(400 380) scale(17) translate(-12 -12)" fill="none" stroke="${hsl(hue, 55, 28)}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${ICONS[iconKey]}</g>
</svg>`;
}

function describe(name, short, catName) {
  return `${short}\n\n${name} forma parte de nuestra selección de ${catName.toLowerCase()}. Producto nuevo, sellado y con garantía oficial de 12 meses.\n\nQué incluye:\n• ${name}\n• Cable / accesorios de fábrica\n• Manual y tarjeta de garantía\n\nEnvío a todo el país. Cambios y devoluciones dentro de los 7 días posteriores a la entrega.`;
}

function seed({ force = false } = {}) {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  if (!hasAdmin) {
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(config.admin.name, config.admin.email, bcrypt.hashSync(config.admin.password, 10));
    console.log(`👤 Admin creado: ${config.admin.email}`);
  }

  shippingSvc.seedDefaults();

  const hasProducts = db.prepare('SELECT 1 FROM products LIMIT 1').get();
  if ((hasProducts && !force) || !config.seedDemo) return;

  fs.mkdirSync(IMG_DIR, { recursive: true });

  const tx = db.transaction(() => {
    const insCat = db.prepare('INSERT INTO categories (name, slug, description, image, sort) VALUES (?, ?, ?, ?, ?)');
    const insProd = db.prepare(`INSERT INTO products (category_id, name, slug, sku, short_description, description, price,
      compare_price, stock, image, gallery, featured, sold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const productRows = [];
    let n = 0;
    CATEGORIES.forEach((c, ci) => {
      const slug = slugify(c.name);
      const catImg = `/img/demo/cat-${slug}.svg`;
      fs.writeFileSync(path.join(IMG_DIR, `cat-${slug}.svg`), makeSvg(c.icon, c.hue, 0));
      const catId = insCat.run(c.name, slug, c.desc, catImg, ci).lastInsertRowid;
      PRODUCTS[c.name].forEach((p, pi) => {
        n++;
        const pslug = slugify(p.name);
        const file = `prod-${pslug}.svg`;
        fs.writeFileSync(path.join(IMG_DIR, file), makeSvg(c.icon, c.hue + pi * 12, pi + 1));
        const created = new Date(Date.now() - (60 - n * 2) * 86400000).toISOString().replace('T', ' ').slice(0, 19);
        const gallery = [2, 3].map((g) => {
          const gf = `prod-${pslug}-${g}.svg`;
          fs.writeFileSync(path.join(IMG_DIR, gf), makeSvg(c.icon, c.hue + pi * 12 + g * 35, pi + g * 3));
          return `/img/demo/${gf}`;
        });
        const id = insProd.run(catId, p.name, pslug, `SKU-${String(1000 + n)}`, p.short, describe(p.name, p.short, c.name),
          p.price, p.compare, p.stock, `/img/demo/${file}`, JSON.stringify(gallery), p.featured || 0, 0, created).lastInsertRowid;
        productRows.push({ id, name: p.name, sku: `SKU-${String(1000 + n)}`, price: p.price, image: `/img/demo/${file}` });
      });
    });

    // Cupones de ejemplo
    const insCoupon = db.prepare('INSERT OR IGNORE INTO coupons (code, type, value, min_total, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
    insCoupon.run('BIENVENIDO10', 'percent', 10, 0, null, null);
    insCoupon.run('AHORRA50', 'fixed', 50, 400, 100, null);

    // Campañas de ejemplo (una activa ahora y otra programada)
    const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const audioId = db.prepare("SELECT id FROM categories WHERE slug = 'audio'").get().id;
    const insPromo = db.prepare(`INSERT INTO promotions (name, title, subtitle, cta_text, cta_link, bg_color, text_color, starts_at, ends_at,
      discount_value, scope, category_id, show_banner, show_topbar, topbar_text, show_countdown, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insPromo.run('Black Week', 'Black Week: 15% extra en Audio', 'Audífonos, parlantes y earbuds con descuento automático. Sin cupones, el precio ya está rebajado.',
      'Ver ofertas', '#/tienda?category=audio', '#111111', '#ffffff', iso(-1), iso(9), 15, 'category', audioId, 1, 1,
      'BLACK WEEK · 15% extra en Audio', 1, 0);
    insPromo.run('Navidad', 'Regalos de Navidad con 10% de descuento', 'Toda la tienda con descuento para que sorprendas a los tuyos.',
      'Comprar regalos', '#/tienda', '#0f5132', '#ffffff', iso(12), iso(37), 10, 'all', null, 1, 1, 'NAVIDAD · 10% en toda la tienda', 1, 1);

    // Clientes de ejemplo
    const insUser = db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, phone, address, city, region, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', ?)");
    const people = [
      ['Cliente Demo', 'cliente@tienda.com', '987654321', 'Av. Arequipa 1234', 'Lima', 'Lima'],
      ['María Fernández', 'maria.fernandez@example.com', '912345678', 'Jr. Junín 456', 'Arequipa', 'Arequipa'],
      ['José Ramírez', 'jose.ramirez@example.com', '923456789', 'Calle Los Pinos 789', 'Trujillo', 'La Libertad'],
      ['Lucía Torres', 'lucia.torres@example.com', '934567890', 'Av. Grau 321', 'Piura', 'Piura'],
      ['Carlos Mendoza', 'carlos.mendoza@example.com', '945678901', 'Av. La Cultura 654', 'Cusco', 'Cusco'],
      ['Ana Quispe', 'ana.quispe@example.com', '956789012', 'Calle Real 147', 'Huancayo', 'Junín'],
    ];
    const pwd = bcrypt.hashSync('Cliente123!', 10);
    const users = people.map((p, i) => {
      const created = new Date(Date.now() - (45 - i * 5) * 86400000).toISOString().replace('T', ' ').slice(0, 19);
      insUser.run(p[0], p[1], pwd, p[2], p[3], p[4], p[5], created);
      return { ...db.prepare('SELECT id FROM users WHERE email = ?').get(p[1]), name: p[0], email: p[1], phone: p[2], address: p[3], city: p[4], region: p[5] };
    });

    // Pedidos de ejemplo distribuidos en los últimos 30 días
    const insOrder = db.prepare(`INSERT INTO orders (code, access_token, user_id, customer_name, email, phone, address, city, region,
      subtotal, discount, shipping, tax, total, status, payment_status, payment_method, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, sku, image, price, qty, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insEvt = db.prepare('INSERT INTO order_events (order_id, type, message, created_at) VALUES (?, ?, ?, ?)');
    const addSold = db.prepare('UPDATE products SET sold = sold + ? WHERE id = ?');
    const methods = ['transferencia', 'yape', 'contraentrega'];
    let seedRnd = 7;
    const rnd = () => { seedRnd = (seedRnd * 16807) % 2147483647; return seedRnd / 2147483647; };
    let receiptSeq = 0;
    for (let i = 0; i < 38; i++) {
      const daysAgo = Math.floor(rnd() * 30);
      const dt = new Date(Date.now() - daysAgo * 86400000 - Math.floor(rnd() * 36000000));
      const created = dt.toISOString().replace('T', ' ').slice(0, 19);
      const u = users[Math.floor(rnd() * users.length)];
      const count = 1 + Math.floor(rnd() * 3);
      const picks = [];
      for (let k = 0; k < count; k++) {
        const p = productRows[Math.floor(rnd() * productRows.length)];
        if (!picks.find((x) => x.id === p.id)) picks.push({ ...p, qty: 1 + Math.floor(rnd() * 2) });
      }
      const subtotal = money(picks.reduce((s, p) => s + p.price * p.qty, 0));
      const shipping = subtotal >= 199 ? 0 : 15;
      const tax = money(subtotal - subtotal / 1.18);
      const total = money(subtotal + shipping);
      let status; let pay;
      if (daysAgo > 7) { status = rnd() < 0.1 ? 'cancelado' : 'entregado'; pay = status === 'cancelado' ? 'pendiente' : 'pagado'; }
      else if (daysAgo > 3) { status = rnd() < 0.5 ? 'enviado' : 'preparando'; pay = 'pagado'; }
      else { status = rnd() < 0.5 ? 'pendiente' : 'confirmado'; pay = status === 'pendiente' ? 'pendiente' : 'pagado'; }
      const code = `PED-${created.slice(2, 4)}${created.slice(5, 7)}${created.slice(8, 10)}-D${String(i + 1).padStart(3, '0')}`;
      const oid = insOrder.run(code, token(20), u.id, u.name, u.email, u.phone, u.address, u.city, u.region,
        subtotal, shipping, tax, total, status, pay, methods[i % 3], created, created).lastInsertRowid;
      db.prepare("UPDATE orders SET receipt_type = 'boleta', receipt_number = ?, shipping_method = ?, shipping_type = ?, shipping_agency = ?, document = ?, tracking_code = ? WHERE id = ?")
        .run(pay === 'pagado' ? `B001-${String(++receiptSeq).padStart(8, '0')}` : null, u.region === 'Lima' ? 'Delivery a domicilio' : 'Shalom · recojo en agencia', u.region === 'Lima' ? 'delivery' : 'shalom',
          u.region === 'Lima' ? null : `Agencia Shalom ${u.city} Centro`, String(40000000 + i * 1371), ['enviado', 'entregado'].includes(status) && u.region !== 'Lima' ? `${70000 + i * 13}` : null, oid);
      for (const p of picks) {
        insItem.run(oid, p.id, p.name, p.sku, p.image, p.price, p.qty, money(p.price * p.qty));
        if (status !== 'cancelado') addSold.run(p.qty, p.id);
      }
      insEvt.run(oid, 'creado', 'Pedido recibido', created);
      if (pay === 'pagado') insEvt.run(oid, 'pago', 'Pagado', created);
      if (status !== 'pendiente') insEvt.run(oid, 'estado', `Estado: ${status.charAt(0).toUpperCase() + status.slice(1)}`, created);
    }
  });
  tx();
  const last = db.prepare("SELECT COUNT(*) n FROM orders WHERE receipt_number IS NOT NULL").get().n;
  require('./settings').saveMany({ boleta_next: String(last + 1) });
  console.log('🌱 Datos de demostración cargados (8 categorías, 24 productos, campañas, pedidos y clientes).');
}

module.exports = { seed };

if (require.main === module) {
  seed({ force: process.argv.includes('--force') });
  console.log('Listo.');
}
