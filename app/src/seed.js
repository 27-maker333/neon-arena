/* LubizJeans: inicio sin catálogos, clientes, pedidos ni cupones ficticios. */
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
function seed() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")
      .run(config.admin.name, config.admin.email, bcrypt.hashSync(config.admin.password, 12));
    console.log('LubizJeans: administrador creado.');
  }
}
module.exports = { seed };
if(require.main === module) seed();
