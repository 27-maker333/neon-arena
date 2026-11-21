/**
 * ===================================================================
 *  MÓDULO DE PAGOS — PUNTO DE INTEGRACIÓN DE TU PASARELA
 * ===================================================================
 *
 *  Este archivo es el ÚNICO lugar que necesitas tocar para conectar
 *  una pasarela (Culqi, Izipay, Niubiz, Mercado Pago, Stripe, PayPal...).
 *
 *  Flujo actual (sin pasarela):
 *    1. El cliente confirma el pedido en el checkout.
 *    2. El backend crea el pedido con payment_status = 'pendiente'
 *       y llama a createPayment(order).
 *    3. createPayment devuelve instrucciones (transferencia, Yape,
 *       contraentrega) que se muestran al cliente.
 *    4. El admin marca el pago como "pagado" desde el panel.
 *
 *  Para conectar una pasarela:
 *    - Agrega un método en PAYMENT_METHODS con { online: true }.
 *    - En createPayment, crea el cargo/sesión con el SDK del proveedor
 *      y devuelve { redirectUrl } (checkout alojado) o { clientData }
 *      (para un formulario embebido en el frontend).
 *    - En handleWebhook, verifica la firma del proveedor y devuelve
 *      { orderCode, status: 'pagado' | 'fallido', reference }.
 *      El endpoint POST /api/payments/webhook/:provider ya está creado
 *      y actualiza el pedido automáticamente con lo que devuelvas.
 *
 *  Guarda tus llaves en el archivo .env (nunca en el código):
 *    PAYMENT_PUBLIC_KEY=...
 *    PAYMENT_SECRET_KEY=...
 *    PAYMENT_WEBHOOK_SECRET=...
 * ===================================================================
 */

const settings = require('../settings');

// Cada método manual se activa/desactiva desde Ajustes → Pagos (clave "setting").
// El cliente confirma el pedido, se abre WhatsApp con el resumen y envía la captura.
const PAYMENT_METHODS = [
  {
    id: 'yape',
    label: 'Yape / Plin',
    description: 'Yapea o plinea el total y envía la captura por WhatsApp.',
    online: false,
    setting: 'pay_yape',
  },
  {
    id: 'transferencia',
    label: 'Transferencia bancaria',
    description: 'Transfiere el total y envía la constancia por WhatsApp.',
    online: false,
    setting: 'pay_transfer',
  },
  {
    id: 'contraentrega',
    label: 'Pago contra entrega',
    description: 'Pagas al recibir. Coordinamos la entrega por WhatsApp.',
    online: false,
    setting: 'pay_cod',
  },
  {
    // Ejemplo de método online: actívalo (enabled: true) cuando conectes tu pasarela.
    id: 'tarjeta',
    label: 'Tarjeta de crédito / débito',
    description: 'Visa, Mastercard, Amex. (Pasarela por conectar)',
    online: true,
    enabled: false,
  },
];

function isEnabled(m) {
  if (m.setting) return settings.getAll()[m.setting] === '1';
  return !!m.enabled;
}

function getMethods() {
  return PAYMENT_METHODS.filter(isEnabled).map(({ id, label, description, online }) => ({
    id, label, description, online,
  }));
}

function isValidMethod(id) {
  return PAYMENT_METHODS.some((m) => m.id === id && isEnabled(m));
}

/**
 * Se llama justo después de crear el pedido.
 * @param {object} order  Pedido recién creado (code, total, email, customer_name, payment_method...)
 * @returns {Promise<{ redirectUrl: string|null, clientData: object|null, instructions: string }>}
 */
async function createPayment(order) {
  const s = settings.getAll();
  switch (order.payment_method) {
    case 'transferencia':
      return {
        redirectUrl: null,
        clientData: null,
        instructions: `Transfiere el total del pedido ${order.code}.\n${s.bank_info}\nLuego envíanos la constancia por WhatsApp. Tu boleta se emite al verificar el pago.`,
      };
    case 'yape':
      return {
        redirectUrl: null,
        clientData: null,
        instructions: `Yapea o plinea el total al número ${s.yape_number} indicando el código ${order.code}.\nLuego envíanos la captura por WhatsApp. Tu boleta se emite al verificar el pago.`,
      };
    case 'contraentrega':
      return {
        redirectUrl: null,
        clientData: null,
        instructions: 'Pagarás al recibir tu pedido. Escríbenos por WhatsApp para coordinar la entrega. Tu boleta se emite al recibir el pago.',
      };
    case 'tarjeta':
      // TODO: integra aquí tu pasarela. Ejemplo genérico:
      // const session = await proveedor.checkout.create({ amount: Math.round(order.total * 100), currency: s.currency, reference: order.code, email: order.email });
      // return { redirectUrl: session.url, clientData: null, instructions: '' };
      return { redirectUrl: null, clientData: null, instructions: 'Pasarela de tarjeta pendiente de configuración.' };
    default:
      return { redirectUrl: null, clientData: null, instructions: '' };
  }
}

/**
 * Procesa notificaciones (webhooks) de la pasarela.
 * Debe validar la firma y devolver el resultado normalizado, o null para ignorar.
 * @returns {Promise<{ orderCode: string, status: 'pagado'|'fallido', reference?: string } | null>}
 */
async function handleWebhook(provider, req) {
  // TODO: verifica la firma con PAYMENT_WEBHOOK_SECRET según tu proveedor.
  // Ejemplo:
  // if (!proveedor.verify(req.rawBody, req.headers['x-signature'], process.env.PAYMENT_WEBHOOK_SECRET)) return null;
  // const evt = req.body;
  // return { orderCode: evt.metadata.order_code, status: evt.paid ? 'pagado' : 'fallido', reference: evt.id };
  void provider; void req;
  return null;
}

module.exports = { getMethods, isValidMethod, createPayment, handleWebhook };
