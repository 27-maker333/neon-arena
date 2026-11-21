/** Correos automáticos de la tienda (pedidos, boletas y Libro de Reclamaciones). */
const db = require('../db');
const settings = require('../settings');
const mailer = require('./mailer');

const { esc, layout } = mailer;
const money = (n) => {
  const s = settings.getAll();
  try { return new Intl.NumberFormat(s.locale || 'es-PE', { style: 'currency', currency: s.currency || 'PEN' }).format(Number(n) || 0); }
  catch { return `S/ ${Number(n || 0).toFixed(2)}`; }
};
const storeInbox = (kind) => {
  const s = settings.getAll();
  if (kind === 'complaint') return s.complaints_email || s.notify_email || s.contact_email;
  return s.notify_email || s.contact_email;
};
const btn = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#15171c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
const row = (k, v) => `<tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${v}</td></tr>`;

function itemsTable(order) {
  const items = db.prepare('SELECT name, qty, total FROM order_items WHERE order_id = ?').all(order.id);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0">
    ${items.map((it) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${it.qty} × ${esc(it.name)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eee">${money(it.total)}</td></tr>`).join('')}
    ${order.discount ? `<tr><td style="padding:6px 0;color:#666">Descuento</td><td align="right">−${money(order.discount)}</td></tr>` : ''}
    <tr><td style="padding:6px 0;color:#666">Envío${order.shipping_method ? ` · ${esc(order.shipping_method)}` : ''}</td><td align="right">${order.shipping ? money(order.shipping) : 'Gratis'}</td></tr>
    <tr><td style="padding:10px 0;font-weight:bold;font-size:16px;border-top:2px solid #15171c">Total</td><td align="right" style="padding:10px 0;font-weight:bold;font-size:16px;border-top:2px solid #15171c">${money(order.total)}</td></tr>
  </table>`;
}

function orderCreated(order, baseUrl) {
  const s = settings.getAll();
  const link = `${baseUrl}/#/pedido/${order.code}?token=${order.access_token}`;
  if (s.notify_orders === '1' && storeInbox('order')) {
    mailer.sendLater({
      to: storeInbox('order'), kind: 'pedido_tienda', replyTo: order.email,
      subject: `🛒 Nuevo pedido ${order.code} · ${money(order.total)}`,
      html: layout(`Nuevo pedido ${order.code}`, `<table>${row('Cliente', esc(order.customer_name))}${row('DNI', esc(order.document || '—'))}${row('Teléfono', esc(order.phone))}${row('Correo', esc(order.email))}${row('Entrega', esc(order.shipping_method || '') + (order.shipping_agency ? ` · ${esc(order.shipping_agency)}` : '') + `<br>${esc(order.address)}, ${esc(order.city)} ${esc(order.region || '')}`)}${row('Pago', esc(order.payment_method))}</table>${itemsTable(order)}<p>El cliente te enviará la captura del pago por WhatsApp. Verifícalo y confírmalo en el panel para emitir la boleta.</p>${btn(`${baseUrl}/admin#/pedidos`, 'Abrir en el panel')}`, { baseUrl }),
    });
  }
  if (s.email_customers === '1') {
    mailer.sendLater({
      to: order.email, kind: 'pedido_cliente',
      subject: `Recibimos tu pedido ${order.code} · ${s.store_name}`,
      html: layout(`¡Gracias, ${order.customer_name.split(' ')[0]}! Recibimos tu pedido`, `<p>Tu pedido <b>${esc(order.code)}</b> está reservado.</p>${itemsTable(order)}
        <p><b>Siguiente paso:</b> realiza el pago y envíanos la captura por WhatsApp${s.whatsapp ? ` al <b>+${esc(s.whatsapp)}</b>` : ''}. Cuando lo verifiquemos te enviaremos tu boleta de venta.</p>${btn(link, 'Ver mi pedido')}`, { baseUrl }),
    });
  }
}

function orderPaid(order, baseUrl) {
  const s = settings.getAll();
  if (s.email_customers !== '1' || !order.receipt_number) return;
  const link = `${baseUrl}/#/comprobante/${order.code}?token=${order.access_token}`;
  mailer.sendLater({
    to: order.email, kind: 'boleta',
    subject: `Pago confirmado · Boleta ${order.receipt_number} · ${s.store_name}`,
    html: layout('Confirmamos tu pago ✅', `<p>Hola ${esc(order.customer_name.split(' ')[0])}, verificamos el pago de tu pedido <b>${esc(order.code)}</b> por <b>${money(order.total)}</b>.</p>
      <p>Tu boleta de venta <b>${esc(order.receipt_number)}</b> ya está disponible. Puedes verla, imprimirla o guardarla en PDF:</p>${btn(link, 'Ver mi boleta')}<p>Te avisaremos cuando despachemos tu pedido.</p>`, { baseUrl }),
  });
}

function complaintHtml(c, p) {
  const t = c.type === 'reclamo' ? 'Reclamo' : 'Queja';
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #ddd;border-radius:10px;padding:12px">
    ${row('Hoja de reclamación', `<b>N° ${esc(c.number)}</b>`)}
    ${row('Fecha', esc(new Date(c.created_at.replace(' ', 'T') + 'Z').toLocaleString('es-PE', { timeZone: 'America/Lima' })))}
    ${row('Proveedor', `${esc(p.company_name)}${p.company_ruc ? ` · RUC ${esc(p.company_ruc)}` : ''}<br>${esc(p.address || '')}`)}
    ${row('Consumidor', `${esc(c.consumer_name)} · ${esc(c.doc_type)} ${esc(c.doc_number)}`)}
    ${row('Domicilio', esc(c.address))}
    ${row('Contacto', `${esc(c.phone || '—')} · ${esc(c.email)}`)}
    ${c.is_minor ? row('Padre/madre o apoderado', `${esc(c.guardian_name)} · ${esc(c.guardian_doc)}`) : ''}
    ${row('Bien contratado', `${c.good_type === 'producto' ? 'Producto' : 'Servicio'}${c.order_code ? ` · Pedido ${esc(c.order_code)}` : ''}${c.amount ? ` · Monto reclamado ${money(c.amount)}` : ''}<br>${esc(c.good_description)}`)}
    ${row('Tipo', `<b>${t}</b>`)}
    ${row('Detalle', esc(c.detail).replace(/\n/g, '<br>'))}
    ${row('Pedido del consumidor', esc(c.request).replace(/\n/g, '<br>'))}
    ${row('Fecha límite de respuesta', esc(c.due_date.split('-').reverse().join('/')))}
  </table>`;
}

function complaintCreated(c, baseUrl) {
  const p = JSON.parse(c.provider_snapshot || '{}');
  const link = `${baseUrl}/#/libro-reclamaciones/${c.number}?token=${c.access_token}`;
  const legal = '<p style="font-size:12.5px;color:#666">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles improrrogables.</p>';
  mailer.sendLater({
    to: c.email, kind: 'reclamo_copia',
    subject: `Copia de tu Hoja de Reclamación N° ${c.number} · ${p.store_name || ''}`,
    html: layout(`Hoja de Reclamación N° ${c.number}`, `<p>Hola ${esc(c.consumer_name.split(' ')[0])}, registramos tu ${c.type}. Esta es la copia de tu hoja de reclamación:</p>${complaintHtml(c, p)}${btn(link, 'Ver / imprimir mi hoja')}${legal}`, { baseUrl }),
  });
  const inbox = storeInbox('complaint');
  if (inbox) {
    mailer.sendLater({
      to: inbox, kind: 'reclamo_tienda', replyTo: c.email,
      subject: `⚠️ Nuevo ${c.type} N° ${c.number} · responder antes del ${c.due_date.split('-').reverse().join('/')}`,
      html: layout(`Nuevo ${c.type} en el Libro de Reclamaciones`, `${complaintHtml(c, p)}<p><b>Tienes 15 días hábiles improrrogables para responder.</b> Responde desde el panel: la respuesta se envía al correo del consumidor y queda registrada.</p>${btn(`${baseUrl}/admin#/reclamaciones`, 'Responder en el panel')}`, { baseUrl }),
    });
  }
}

function complaintResponded(c, baseUrl) {
  const p = JSON.parse(c.provider_snapshot || '{}');
  const link = `${baseUrl}/#/libro-reclamaciones/${c.number}?token=${c.access_token}`;
  return mailer.send({
    to: c.email, kind: 'reclamo_respuesta',
    subject: `Respuesta a tu Hoja de Reclamación N° ${c.number} · ${p.store_name || ''}`,
    html: layout(`Respuesta a tu ${c.type} N° ${c.number}`, `<p>Hola ${esc(c.consumer_name.split(' ')[0])}:</p><div style="padding:14px 16px;background:#f6f6f8;border-radius:10px;white-space:pre-line">${esc(c.response)}</div>
      <p style="margin-top:16px">Detalle de tu hoja:</p>${complaintHtml(c, p)}${btn(link, 'Ver mi hoja de reclamación')}`, { baseUrl }),
  });
}

module.exports = { orderCreated, orderPaid, complaintCreated, complaintResponded };
