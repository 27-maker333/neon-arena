const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./src/config');
const { seed } = require('./src/seed');
const { HttpError } = require('./src/utils');

seed();

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
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'novashop-api' }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
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
