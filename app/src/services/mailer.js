/**
 * Envío de correos por SMTP (Gmail, Outlook, Zoho, el correo de tu hosting, etc.).
 * Configura en .env:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
 *   SMTP_USER=tucorreo@gmail.com  SMTP_PASS=contraseña-de-aplicación
 *   MAIL_FROM="Mi Tienda <tucorreo@gmail.com>"
 * Si no está configurado, los correos se registran en el panel como "no enviado"
 * para que sepas qué se habría enviado.
 */
const nodemailer = require('nodemailer');
const db = require('../db');
const settings = require('../settings');

db.exec(`CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

let transporter = null;
function config() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  return {
    host, port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    tls: process.env.SMTP_INSECURE_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}
function isConfigured() { return !!config(); }
function getTransport() {
  if (!transporter && isConfigured()) transporter = nodemailer.createTransport(config());
  return transporter;
}
function fromAddress() {
  const s = settings.getAll();
  return process.env.MAIL_FROM || (process.env.SMTP_USER ? `"${s.store_name}" <${process.env.SMTP_USER}>` : `"${s.store_name}" <no-reply@localhost>`);
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plantilla HTML simple y compatible con clientes de correo. */
function layout(title, bodyHtml, { baseUrl = '' } = {}) {
  const s = settings.getAll();
  const color = /^#[0-9a-f]{6}$/i.test(s.primary_color) ? s.primary_color : '#e8572a';
  const logo = s.store_logo && baseUrl && !/\.svg/i.test(s.store_logo)
    ? `<img src="${esc(baseUrl + s.store_logo)}" alt="${esc(s.store_name)}" style="max-height:44px;max-width:180px">`
    : `<span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:10px;background:${color};color:#fff;font-weight:800;text-align:center;font-size:18px">${esc((s.store_name || 'T').charAt(0))}</span> <b style="font-size:18px;color:#15171c;vertical-align:middle">${esc(s.store_name)}</b>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#15171c">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7e8ec">
    <tr><td style="padding:20px 28px;border-bottom:3px solid ${color}">${logo}</td></tr>
    <tr><td style="padding:28px">
      <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
      <div style="font-size:14.5px;line-height:1.6;color:#2a2e37">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fafafb;border-top:1px solid #eee;font-size:12px;color:#777">
      ${esc(s.company_name || s.store_name)}${s.company_ruc ? ` · RUC ${esc(s.company_ruc)}` : ''}<br>${esc(s.address || '')}<br>${esc([s.contact_email, s.contact_phone].filter(Boolean).join(' · '))}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function send({ to, subject, html, text, replyTo, kind = 'general' }) {
  const list = String(to || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!list.length) return { sent: false, error: 'Sin destinatario' };
  const log = db.prepare('INSERT INTO email_log (to_addr, subject, kind, status, error) VALUES (?, ?, ?, ?, ?)');
  const t = getTransport();
  if (!t) {
    log.run(list.join(', '), subject, kind, 'no_configurado', 'SMTP no configurado en .env');
    console.log(`[correo] (SMTP no configurado) "${subject}" → ${list.join(', ')}`);
    return { sent: false, error: 'SMTP no configurado' };
  }
  try {
    await t.sendMail({ from: fromAddress(), to: list.join(', '), subject, html, text, replyTo });
    log.run(list.join(', '), subject, kind, 'enviado', null);
    return { sent: true };
  } catch (err) {
    log.run(list.join(', '), subject, kind, 'error', String(err.message || err).slice(0, 300));
    console.error('[correo] Error:', err.message);
    return { sent: false, error: err.message };
  }
}

/** Envía sin bloquear la respuesta HTTP. */
function sendLater(opts) {
  setImmediate(() => { send(opts).catch(() => {}); });
}

function recentLog(limit = 25) {
  return db.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = { isConfigured, send, sendLater, layout, esc, recentLog };
