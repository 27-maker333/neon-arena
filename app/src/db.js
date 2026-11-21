const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  phone TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT UNIQUE,
  short_description TEXT,
  description TEXT,
  price REAL NOT NULL CHECK (price >= 0),
  compare_price REAL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value REAL NOT NULL CHECK (value > 0),
  min_total REAL NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  document TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT,
  reference TEXT,
  notes TEXT,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','confirmado','preparando','enviado','entregado','cancelado')),
  payment_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (payment_status IN ('pendiente','pagado','fallido','reembolsado')),
  payment_method TEXT NOT NULL,
  payment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  image TEXT,
  price REAL NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---- Migraciones seguras para bases de datos existentes ----
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('products', 'gallery', "TEXT NOT NULL DEFAULT '[]'");
addColumn('orders', 'shipping_method_id', 'INTEGER');
addColumn('orders', 'shipping_method', 'TEXT');
addColumn('orders', 'shipping_type', 'TEXT');
addColumn('orders', 'shipping_agency', 'TEXT');
addColumn('orders', 'tracking_code', 'TEXT');
addColumn('orders', 'receipt_type', "TEXT NOT NULL DEFAULT 'boleta'");
addColumn('orders', 'receipt_number', 'TEXT');
addColumn('orders', 'customer_company', 'TEXT');
addColumn('users', 'marketing_consent', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'privacy_accepted_at', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS shipping_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom' CHECK (type IN ('shalom','delivery','pickup','custom')),
  description TEXT,
  eta TEXT,
  base_price REAL NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  free_from REAL NOT NULL DEFAULT 0,
  rates TEXT NOT NULL DEFAULT '{}',
  regions TEXT NOT NULL DEFAULT '[]',
  tracking_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  image TEXT,
  cta_text TEXT,
  cta_link TEXT,
  bg_color TEXT NOT NULL DEFAULT '#15171c',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  discount_value REAL NOT NULL DEFAULT 0 CHECK (discount_value >= 0 AND discount_value <= 90),
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','category')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  show_banner INTEGER NOT NULL DEFAULT 1,
  show_topbar INTEGER NOT NULL DEFAULT 0,
  topbar_text TEXT,
  show_countdown INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(starts_at, ends_at);
`);

module.exports = db;
