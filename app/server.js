const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./src/config');
const { seed } = require('./src/seed');
const { HttpError } = require('./src/utils');

seed();
// Primer inicio LubizJeans: guardar valores de marca y categorías reales (sin inventario ni pedidos falsos).
const db = require('./src/db');
const settings = require('./src/settings');
if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('lubiz_initialized')) {
  const previousShop = db.prepare('SELECT value FROM settings WHERE key = ?').get('store_name');
  // Nunca sobrescribir personalizaciones de una tienda real existente.
  if (!previousShop || ['NovaShop','LubizJeans'].includes(previousShop.value)) {
    settings.saveMany({ store_name: 'LubizJeans', store_logo: '/img/lubiz-mark.svg', store_logo_dark: '/img/lubiz-mark.svg', store_tagline: 'Denim sin reglas', primary_color: '#2f566e', whatsapp: '', contact_phone: '', contact_email: '', address: '', bank_info: '', yape_number: '', promo_banner_show: '0', pay_yape: '0', pay_transfer: '0', pay_cod: '0' });
    for(const [idx,name] of ['Jeans Mujer','Jeans Hombre','Jeans Unisex'].entries()){
      db.prepare('INSERT OR IGNORE INTO categories (name, slug, description, sort) VALUES (?,?,?,?)')
        .run(name, ['jeans-mujer','jeans-hombre','jeans-unisex'][idx], 'Jeans auténticos · categoría lista para productos reales', idx);
    }
  }
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('lubiz_initialized','1');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'"],
      // Agrega aquí los dominios de tu pasarela cuando la conectes (scripts, iframes, connect-src).
      'frame-src': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({
  limit: '1mb',
  // Conserva el cuerpo crudo para verificar firmas de webhooks de pago.
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));

/* ---------------- API ---------------- */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'lubizjeans-api' }));
// Las funciones de autenticación, administración y escritura ya usan
// exclusivamente Supabase Auth/PostgreSQL/Storage. Bloquear el legado SQLite.
app.use('/api/auth', (_req,res)=>res.status(410).json({error:'Acceso migrado a Supabase Auth. Usa /admin en lubizjeans.vercel.app'}));
app.use('/api/admin', (_req,res)=>res.status(410).json({error:'Administración migrada a Supabase'}));
app.use('/api/cart', (_req,res)=>res.status(410).json({error:'Carrito antiguo deshabilitado'}));
app.use('/api/orders', (_req,res)=>res.status(410).json({error:'Pedidos antiguos deshabilitados'}));
app.use('/api', (req,res,next)=>req.method==='GET'?next():res.status(410).json({error:'Usa la nueva tienda LubizJeans'}));
app.use('/api', require('./src/routes/shop'));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

/* ---------------- Archivos estáticos ---------------- */
app.use('/uploads', express.static(config.uploadsDir, {
  maxAge: '30d',
  fallthrough: false,
  setHeaders: (res) => {
    // Las imágenes subidas (incluidos SVG) nunca pueden ejecutar código
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
app.use(express.static(config.publicDir, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/admin', (_req, res) => res.sendFile(path.join(config.publicDir, 'admin', 'index.html')));
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(path.join(config.publicDir, 'index.html'));
  res.status(404).end();
});

/* ---------------- Manejo de errores ---------------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON inválido');
  if (err.type === 'entity.too.large') err = new HttpError(413, 'La solicitud es demasiado grande');
  if (err.status === 404 && req.path.startsWith('/uploads')) return res.status(404).end();
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message, details: err.details });
});

app.listen(config.port, () => {
  console.log(`\n🛒 Tienda lista en      http://localhost:${config.port}`);
  console.log(`🔐 Panel admin en       http://localhost:${config.port}/admin\n`);
});

module.exports = app;
