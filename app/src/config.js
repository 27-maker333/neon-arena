require('dotenv').config({ quiet: true });
const path = require('path');

const ROOT = path.join(__dirname, '..');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'tienda.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, 'public', 'uploads'),
  publicDir: path.join(ROOT, 'public'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 4,
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: (process.env.ADMIN_EMAIL || 'admin@tienda.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
  },
  seedDemo: process.env.SEED_DEMO === 'true',
};

if (config.env === 'production') {
  if (config.jwtSecret === 'cambia-este-secreto-en-produccion' || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET seguro es obligatorio en producción (mínimo 32 caracteres)');
  }
  if (config.admin.password === 'Admin123!' || config.admin.password.length < 12) {
    throw new Error('ADMIN_PASSWORD seguro es obligatorio en producción (mínimo 12 caracteres)');
  }
}

module.exports = config;
