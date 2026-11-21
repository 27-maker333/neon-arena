const db = require('./db');

// Valores por defecto. Se pueden cambiar desde el panel de administración (Ajustes).
const DEFAULTS = {
  store_name: 'LubizJeans',
  store_logo: '/img/lubiz-mark.svg',
  store_logo_dark: '/img/lubiz-mark.svg',
  logo_show_name: '1',
  store_tagline: 'Denim sin reglas · Lima, Perú',
  hero_title: 'Denim sin reglas',
  hero_subtitle: 'Diseños que hablan por sí solos. Estilo denim sin etiquetas.',
  primary_color: '#2f566e',
  currency: 'PEN',
  locale: 'es-PE',
  shipping_cost: '0',
  free_shipping_from: '0',
  tax_rate: '18',
  tax_included: '1',
  tax_label: 'IGV',
  contact_email: '',
  contact_phone: '',
  whatsapp: '',
  address: '',
  business_hours: '',
  bank_info: '',
  yape_number: '',
  low_stock_threshold: '5',
  instagram: '',
  facebook: '',
  tiktok: '',
  // Portada y textos
  topbar_text: 'LUBIZJEANS · DENIM SIN REGLAS',
  hero_eyebrow: 'Nueva era denim',
  hero_cta_text: 'Explorar colección',
  perk1_title: 'Despachos coordinados', perk1_text: 'Consultar cobertura',
  perk2_title: 'Atención personalizada', perk2_text: 'Consulta por WhatsApp',
  perk3_title: 'Encuentra tu fit', perk3_text: 'Tallas por confirmar',
  perk4_title: 'Atención humana', perk4_text: 'Te atendemos por WhatsApp',
  promo_banner_show: '0',
  promo_banner_title: '',
  promo_banner_text: '',
  promo_banner_cta: 'Empezar a comprar',
  promo_banner_link: '#/tienda',
  home_show_categories: '1',
  home_show_featured: '1',
  home_show_new: '1',
  // Comprobantes
  company_name: 'LubizJeans',
  company_ruc: '',
  currency_name: 'SOLES',
  boleta_series: 'B001',
  boleta_next: '1',
  receipt_footer: 'Representación impresa del comprobante de venta. Gracias por tu compra.',
  // Pagos por WhatsApp
  pay_yape: '0',
  pay_transfer: '0',
  pay_cod: '0',
  wa_auto_open: '0',
  wa_message_extra: '',
  // Correos y Libro de Reclamaciones
  complaints_email: '',
  notify_email: '',
  notify_orders: '1',
  email_customers: '1',
  // Páginas
  page_terms: 'Información comercial pendiente de completar: razón social o nombre del proveedor, RUC, domicilio, formas de pago, envío, cambios y devoluciones. No publicar pedidos sin completar estos datos.',
  page_returns: 'POLÍTICA DE CAMBIOS Y DEVOLUCIONES\n\n1. Plazo: puedes solicitar el cambio o la devolución dentro de los 7 días calendario posteriores a la entrega.\n\n2. Condiciones: el producto debe estar sin uso, en su empaque original, con accesorios, manuales y la boleta. No aplica a productos personalizados ni a los que, por higiene, no pueden devolverse una vez abiertos (audífonos in-ear, por ejemplo), salvo falla de fábrica.\n\n3. Productos con falla o distintos a lo comprado: si el producto llegó dañado, con falla de fábrica o no corresponde a tu pedido, lo cambiamos o te devolvemos el dinero y asumimos el costo del envío. Repórtalo dentro de las 48 horas de recibido con fotos o video.\n\n4. Garantía: los productos tienen la garantía del fabricante indicada en su ficha. Te ayudamos a gestionarla.\n\n5. Cómo solicitarlo: escríbenos por WhatsApp o al correo {correo} con tu código de pedido, el motivo y fotos del producto.\n\n6. Reembolso: se realiza por el mismo medio de pago dentro de los 10 días hábiles siguientes a la recepción y revisión del producto. En devoluciones por arrepentimiento, el costo de envío de retorno corre por cuenta del cliente.\n\n7. Libro de Reclamaciones: si no estás conforme, puedes registrar tu reclamo en nuestro Libro de Reclamaciones virtual. Te responderemos en un plazo máximo de 15 días hábiles.',
  page_shipping: 'Enviamos a todo el Perú.\n\n• Shalom: recojo en la agencia de tu ciudad con tu DNI. Te enviamos el número de guía y la clave por WhatsApp.\n• Delivery en Lima y Callao: 24 a 48 horas hábiles.\n• Recojo en tienda: listo en 24 horas.\n\nLos plazos se cuentan desde la confirmación del pago.',
};

DEFAULTS.page_privacy = [
  'POLÍTICA DE PRIVACIDAD Y PROTECCIÓN DE DATOS PERSONALES',
  'En cumplimiento de la Ley N° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por el Decreto Supremo N° 016-2024-JUS.',
  '1. Responsable del tratamiento\n{empresa}{ruc_texto}, con domicilio en {direccion}. Correo de contacto: {correo}.',
  '2. Datos que recopilamos\nNombre, DNI o CE, correo electrónico, teléfono, dirección o agencia de envío, departamento y datos de tus pedidos. No almacenamos datos de tarjetas: los pagos se realizan por Yape/Plin o transferencia fuera de esta web.',
  '3. Finalidades\na) Procesar y entregar tus pedidos, y emitir tu boleta de venta.\nb) Comunicarnos contigo sobre tu pedido por WhatsApp, teléfono o correo.\nc) Atender consultas, reclamos y quejas del Libro de Reclamaciones.\nd) Cumplir obligaciones legales, tributarias y contables.\ne) Solo si lo autorizas expresamente: enviarte ofertas y novedades. Puedes retirar esta autorización en cualquier momento.',
  '4. Destinatarios\nCompartimos los datos estrictamente necesarios con el operador logístico (por ejemplo, Shalom) para entregar tu pedido, y con autoridades cuando la ley lo exija. No vendemos tus datos.',
  '5. Plazo de conservación\nConservamos tus datos mientras tengas una cuenta o pedidos en curso y, después, durante los plazos que exige la normativa tributaria y de protección al consumidor. Las hojas de reclamación se conservan como mínimo 2 años.',
  '6. Tus derechos (ARCO)\nPuedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a {correo} con el asunto “Derechos ARCO” y una copia de tu documento de identidad. Si tienes cuenta, también puedes descargar tus datos o eliminar tu cuenta desde “Mi cuenta → Privacidad”. Responderemos en los plazos que establece la ley. Si consideras que no fuiste atendido, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.',
  '7. Seguridad\nAplicamos medidas técnicas y organizativas para proteger tus datos: conexión cifrada (HTTPS), contraseñas cifradas y acceso restringido al panel de administración.',
  '8. Cookies y almacenamiento local\nUsamos solo el almacenamiento local de tu navegador para recordar tu carrito y tu sesión. No usamos cookies de publicidad ni de rastreo de terceros.',
  '9. Cambios\nPodemos actualizar esta política. Publicaremos la versión vigente en esta página.',
].join('\n\n');

const LONG_KEYS = ['page_terms', 'page_returns', 'page_shipping', 'page_privacy'];

// Claves visibles para el público (la tienda). El resto solo lo ve el admin.
const PUBLIC_KEYS = Object.keys(DEFAULTS).filter((k) => !['low_stock_threshold', 'boleta_next', 'complaints_email', 'notify_email', 'notify_orders', 'email_customers'].includes(k));

function getAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value ?? '';
  return out;
}

function getPublic() {
  const all = getAll();
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = all[k];
  return out;
}

function num(key) {
  const n = Number(getAll()[key]);
  return Number.isFinite(n) ? n : Number(DEFAULTS[key]) || 0;
}

function saveMany(obj) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, val] of entries) stmt.run(k, val == null ? '' : String(val).slice(0, LONG_KEYS.includes(k) ? 20000 : 2000));
  });
  tx(Object.entries(obj).filter(([k]) => k in DEFAULTS));
}

module.exports = { DEFAULTS, LONG_KEYS, getAll, getPublic, num, saveMany };
