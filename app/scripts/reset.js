// Borra la base de datos y las imágenes demo, y vuelve a crear todo desde cero.
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

for (const suffix of ['', '-wal', '-shm']) {
  const f = config.dbFile + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
fs.rmSync(path.join(config.publicDir, 'img', 'demo'), { recursive: true, force: true });
console.log('🗑️  Base de datos eliminada.');
require('../src/seed').seed({ force: true });
console.log('✅ Listo. Ejecuta "npm start".');
