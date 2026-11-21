# NovaShop — Tienda en línea con panel de administración

Sistema completo de ventas: tienda pública, carrito, checkout, cuentas de cliente, seguimiento de pedidos y panel de administración. Hecho con **Node.js + Express + SQLite** y un frontend en HTML/CSS/JS puro (sin compilación).

La pasarela de pagos **no está conectada**: el sistema ya funciona con pagos manuales (transferencia, Yape/Plin, contra entrega) y deja un único archivo listo para integrar tu proveedor.

---

## 1. Requisitos

- Node.js **20 o superior** (recomendado 22 o 24 LTS)
- npm

## 2. Instalación y arranque

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm start
```

- Tienda: http://localhost:3000
- Panel admin: http://localhost:3000/admin

La primera vez se crea la base de datos (`data/tienda.db`), el usuario administrador y datos de demostración.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@tienda.com` | `Admin123!` |
| Cliente demo | `cliente@tienda.com` | `Cliente123!` |

Cupones de prueba: `BIENVENIDO10` (10 %), `AHORRA50` (S/ 50 desde S/ 400).

### Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia con recarga automática al editar archivos |
| `npm run reset` | Borra la base de datos y vuelve a cargar los datos demo |

Para empezar **sin datos demo**: pon `SEED_DEMO=false` en `.env`, ejecuta `npm run reset` y crea tus categorías y productos desde el panel.

---

## 3. Funcionalidades

**Tienda**
- Portada con banner, categorías, destacados, novedades y banner de cupón
- Catálogo con búsqueda, filtros (categoría, precio, stock, ofertas), orden y paginación
- Ficha de producto con precio anterior/descuento, stock en vivo, cantidad y productos relacionados
- Carrito persistente, cupones y barra de "envío gratis"
- Checkout como invitado o con cuenta, validación de campos, elección de método de pago
- Página de confirmación con estado del pedido, instrucciones de pago y botón de WhatsApp
- Registro, inicio de sesión, "Mi cuenta" (datos, contraseña, historial de pedidos)
- Rastreo de pedido con código + correo
- Diseño responsive (móvil, tablet, escritorio) y botón flotante de WhatsApp

**Panel de administración**
- Resumen: ventas del mes vs. mes anterior, ticket promedio, gráfico de 30 días, pedidos por estado, más vendidos, stock bajo
- Pedidos: filtros por estado, pago, fecha y texto; detalle completo; cambio de estado y de pago con historial; notas internas; impresión; exportación a CSV
- Productos: crear, editar, eliminar, subir imagen, activar/ocultar, destacar, precio anterior, SKU
- Categorías, clientes (activar/desactivar, crear administradores) y cupones (% o monto fijo, mínimo, usos, vencimiento)
- Ajustes: nombre, color de marca, textos de portada, moneda, impuesto (incluido o adicional), envío, datos bancarios/Yape, contacto y redes

**Logo, imágenes y campañas (v1.1)**
- **Logo de la tienda** (Ajustes → Logo): se adapta solo al encabezado, pie de página, panel y pestaña del navegador, en PC y celular. Admite una versión para fondo oscuro y se puede ocultar el nombre si tu logo ya lo incluye.
- **Editor de imágenes integrado** al subir o editar cualquier imagen: recorte (1:1, 4:3, 16:9, banner 16:6 u original), zoom, encuadre arrastrando, girar ±90°, voltear, brillo, contraste, saturación y transparencia PNG. Las fotos se optimizan automáticamente (máx. 1600 px, WEBP).
- **Galería por producto**: hasta 13 imágenes; la primera es la principal. Se pueden reordenar, editar, quitar o subir varias a la vez. En la tienda se ven como miniaturas en la ficha.
- **Campañas por fechas importantes** (menú Campañas): plantillas de un clic para Año Nuevo, San Valentín, Regreso a clases, Día de la Mujer, Día del Niño, Día de la Madre, Día del Padre, Fiestas Patrias, Halloween/Canción Criolla, Black Friday/Cyber Monday y Navidad, con las fechas del año ya calculadas.
  - Cada campaña puede mostrar un **banner en la portada** (slider con varias campañas), un **aviso en la barra superior** y una **cuenta regresiva**.
  - **Descuento automático** (%) para toda la tienda o una categoría. El precio rebajado se ve en todo el catálogo y se respeta en el carrito y en el pedido. Si varias campañas aplican, gana el mayor descuento.
  - Se **activa y desactiva sola** según la fecha y hora de inicio y fin. Puedes pausarla, duplicarla o editarla con vista previa en vivo.
  - Para agregar o cambiar fechas, edita `importantDates()` en `public/js/admin.js`.

**Envíos, comprobantes y control total (v1.2)**
- **Envíos con Shalom** (recojo en agencia), delivery a domicilio y recojo en tienda, desde el menú **Envíos**. Puedes:
  - poner un precio base y un precio distinto por departamento (los 25 del Perú),
  - elegir en qué departamentos está disponible cada método (por ejemplo, delivery solo en Lima y Callao),
  - fijar un monto a partir del cual el envío es gratis,
  - agregar un enlace de rastreo con `{codigo}`.
  En el checkout el cliente elige su departamento y ve las opciones con precio. Con Shalom se le pide la agencia de destino y su DNI.
- **Guía de envío por pedido**: desde el detalle del pedido registras el N° de orden Shalom, la agencia y el costo de envío (el total se recalcula). El cliente lo ve en su pedido.
- **Boletas formales**: numeración correlativa (B001-00000001), datos del emisor (razón social y RUC), datos del cliente (nombre y DNI), detalle, op. gravada, IGV, total y monto en letras ("SON: …"). Se pueden imprimir o guardar en PDF desde la tienda y desde el admin. Todo se configura en Ajustes → Boletas.
  > Es una representación impresa de la venta. Para comprobantes electrónicos válidos ante SUNAT hay que conectar un proveedor autorizado (OSE/PSE).
- **Descuentos claros**: en cada producto pones el precio original y el % (o el precio nuevo) y el otro valor se calcula solo. En la tienda se ve el precio original tachado, el -% y el precio nuevo. **Descuento masivo** por categoría o para toda la tienda (pon 0 % para volver al precio original).
- **Crear cuenta en el checkout** con una casilla, además del registro normal.
- **Ajustes por pestañas**: nombre, logo (también **SVG**), colores, textos de portada, beneficios, banner promocional, secciones visibles, moneda e impuesto, comprobantes, pagos y páginas legales (términos, devoluciones, envíos).
- **Celular tipo app**: barra de navegación inferior, botón fijo de "Agregar al carrito" en el producto, checkout optimizado y panel admin con tarjetas en vez de tablas.

**Pago por WhatsApp y solo boleta (v1.3)**
- **Solo boleta de venta** (sin factura).
- **Pago por WhatsApp**: al confirmar el pedido se abre WhatsApp con tu número y un mensaje listo que incluye código, productos, envío, total, método de pago (Yape/Plin con tu número o tus cuentas bancarias), nombre y DNI. El cliente paga y te envía la captura. Si el navegador bloquea la ventana, en la página del pedido hay un botón verde para abrir WhatsApp.
- **La boleta se emite al verificar el pago**: en el admin, el pedido muestra "Pago por verificar". Revisas la captura, presionas **Confirmar pago recibido** (opcional: N° de operación) y en ese momento se genera el número de boleta B001 correlativo y el pedido pasa a "Confirmado". Con **Enviar boleta** se abre WhatsApp con el número del cliente y el enlace a su boleta.
- El cliente ve su boleta en el pedido solo después de que confirmas el pago. Antes ve "Tu boleta aún no está lista".
- El resumen muestra "Pagos por verificar" y en Pedidos hay un filtro rápido **Por verificar**.
- En Ajustes → Pagos por WhatsApp configuras:
  - el número que recibe los pedidos,
  - si WhatsApp se abre automáticamente,
  - la frase final del mensaje,
  - qué métodos aceptas: Yape/Plin, transferencia y contra entrega (este último viene desactivado).

**Libro de Reclamaciones, correos y privacidad (v1.4)**
- **Libro de Reclamaciones virtual** (Ley 29571 y su reglamento), en `#/libro-reclamaciones`, con acceso desde el pie de página de todas las páginas y desde cada pedido:
  - Hoja con número correlativo por año (000001-2026), fecha, datos del proveedor (razón social, RUC, dirección), datos del consumidor (con apoderado si es menor de edad), bien contratado, reclamo o queja con sus definiciones, detalle, pedido del consumidor y observaciones del proveedor.
  - No tiene casillas de aceptación obligatorias (criterio de Indecopi).
  - Al registrar, el consumidor recibe una **copia por correo** y tú recibes un **aviso** en el correo que configures, con la **fecha límite**: 15 días hábiles improrrogables, que excluyen fines de semana y feriados nacionales.
  - En el admin, la sección **Reclamaciones** muestra los días hábiles restantes (avisa cuando quedan pocos o el plazo venció). Respondes desde ahí: la respuesta se envía al correo del consumidor y queda en su hoja. Puedes exportar todo a CSV para conservarlo al menos 2 años.
- **Correos automáticos por SMTP** (Gmail, Outlook, Zoho o el de tu hosting; se configura en `.env`):
  - aviso de pedido nuevo para ti,
  - "pedido recibido" para el cliente,
  - boleta al cliente cuando confirmas el pago,
  - todos los del Libro de Reclamaciones.
  En Ajustes → Correos eliges a qué correos llegan, envías un correo de prueba y ves el registro de los últimos envíos.
- **Privacidad (Ley 29733 y D.S. 016-2024-JUS)**:
  - Política de privacidad editable, que usa tus datos (`{empresa}`, `{ruc}`, `{direccion}`, `{correo}`).
  - Casilla de consentimiento sin marcar en el registro y en el checkout, y casilla separada y opcional para ofertas.
  - En "Mi cuenta → Privacidad" el cliente puede descargar sus datos, rectificarlos, retirar el consentimiento para ofertas o eliminar su cuenta. Al eliminarla se anonimiza; los pedidos se conservan por obligación tributaria.
- **Política de cambios y devoluciones** detallada y editable.

> Los textos legales son una base. Revísalos con tu asesor y, si corresponde, inscribe tu banco de datos ante la Autoridad Nacional de Protección de Datos Personales.

**Footer profesional (v1.5)**
- Nuevo pie de página con:
  - franja de beneficios,
  - redes sociales con íconos y botón de WhatsApp,
  - columnas Comprar / Ayuda / Legal,
  - contacto con horario de atención (editable en Ajustes → General),
  - distintivo del **Libro de Reclamaciones**,
  - medios de pago, envíos y compra segura,
  - barra inferior con razón social, RUC y botón "volver arriba".
- En el celular, las columnas se pliegan como acordeón.
- Íconos de **Bootstrap Icons** (licencia MIT) incrustados en `public/js/lib.js` con `UI.bi('nombre')`, sin depender de internet.
- Distintivo del Libro de Reclamaciones en SVG: `public/img/libro-reclamaciones.svg`. También se descarga desde Admin → Reclamaciones → "Distintivo SVG", para imprimirlo o colocarlo en tu local.

**Reglas de negocio en el servidor**
- Los precios y totales se recalculan siempre en el backend (el navegador no puede alterar precios)
- El stock se descuenta en una transacción al crear el pedido; no se puede vender más de lo disponible
- Al cancelar un pedido se devuelve el stock y el uso del cupón
- Al marcar un pago como "Pagado", un pedido pendiente pasa a "Confirmado"

**Seguridad**
- Contraseñas con bcrypt, sesiones con JWT
- Cabeceras de seguridad (Helmet + CSP), límite de intentos en login/registro/pedidos
- Validación de todos los datos de entrada y consultas SQL parametrizadas
- Todo el contenido se escapa en el frontend (protección XSS)
- Subida de imágenes limitada a JPG/PNG/WEBP/GIF y tamaño máximo configurable

---

## 4. Conectar tu pasarela de pagos

Todo está en **`src/services/payment.js`** (el archivo tiene instrucciones paso a paso):

1. Activa o agrega un método con `online: true` en `PAYMENT_METHODS` (ya existe `tarjeta`, desactivado).
2. En `createPayment(order)` crea el cargo o la sesión con el SDK de tu proveedor y devuelve:
   - `{ redirectUrl }` para un checkout alojado (el cliente es redirigido automáticamente), o
   - `{ clientData }` si usarás un formulario embebido.
3. En `handleWebhook(provider, req)` verifica la firma (tienes `req.rawBody`) y devuelve `{ orderCode, status: 'pagado' | 'fallido', reference }`.
4. Configura en tu proveedor la URL de webhook: `https://TU-DOMINIO/api/payments/webhook/NOMBRE`.
5. Si tu pasarela carga scripts o iframes, agrega sus dominios a la CSP en `server.js` (`script-src`, `frame-src`, `connect-src`).
6. Guarda las llaves en `.env` (`PAYMENT_SECRET_KEY`, etc.), nunca en el código.

El endpoint del webhook ya actualiza el pedido, registra el evento en el historial y confirma el pedido automáticamente.

---

## 5. Estructura

```
server.js                 Servidor Express (seguridad, rutas, estáticos, errores)
src/
  config.js               Configuración desde .env
  db.js                   Esquema SQLite
  seed.js                 Admin inicial y datos demo
  settings.js             Ajustes editables desde el panel
  utils.js                Validación y utilidades
  middleware/auth.js      JWT y permisos
  routes/auth.js          Registro, login, perfil
  routes/shop.js          Catálogo, carrito, pedidos, webhook
  routes/admin.js         API del panel
  services/orders.js      Totales, stock, estados de pedido
  services/promos.js      Campañas y descuentos automáticos
  services/shipping.js    Métodos de envío y tarifas por departamento
  services/complaints.js  Libro de Reclamaciones (correlativo, días hábiles y feriados)
  services/mailer.js      Envío de correos SMTP y registro
  services/notify.js      Correos automáticos (pedidos, boletas, reclamos)
  services/payment.js     ← PUNTO DE INTEGRACIÓN DE PAGOS
public/
  index.html, js/store.js Tienda (SPA)
  js/image-editor.js      Editor de imágenes del panel
  admin/index.html, js/admin.js  Panel de administración
  css/                    Estilos
  uploads/                Imágenes subidas desde el panel
data/tienda.db            Base de datos (se crea sola)
```

## 6. API (resumen)

Públicas: `POST /api/complaints`, `GET /api/complaints/:numero?token=`, `GET /api/settings`, `GET /api/promotions`, `GET /api/shipping-methods?region=`, `GET /api/categories`, `GET /api/products`, `GET /api/products/:slug`, `POST /api/cart/quote`, `POST /api/orders`, `GET /api/orders/:code?token=`, `POST /api/orders/track`, `POST /api/payments/webhook/:provider`.

Cliente (Bearer token): `GET/PUT /api/auth/me`, `GET /api/orders/mine`.

Admin (Bearer token de administrador): `/api/admin/stats`, `/products`, `/categories`, `/orders` (+ `/export`, `/:id/status`, `/:id/payment`, `/:id/note`), `/customers`, `/coupons`, `/promotions`, `/shipping`, `/products/bulk-discount`, `/orders/:id/shipping`, `/complaints`, `/complaints-export`, `/email/status`, `/email/test`, `/settings`, `/upload`.

Cliente (privacidad): `GET /api/auth/me/export`, `DELETE /api/auth/me`.

---

## 7. Publicar en producción

1. En `.env`: `NODE_ENV=production`, un `JWT_SECRET` largo y aleatorio, y cambia `ADMIN_PASSWORD` **antes** del primer arranque (o cámbiala luego desde "Mi cuenta").
2. Usa un gestor de procesos: `npm i -g pm2 && pm2 start server.js --name tienda`.
3. Pon el servidor detrás de Nginx/Caddy con HTTPS.
4. Respalda periódicamente `data/` y `public/uploads/`.

Funciona en cualquier VPS (DigitalOcean, Hetzner, AWS Lightsail, etc.) o en plataformas como Railway/Render con un disco persistente montado en `data/` y `public/uploads/`.

## 8. Actualizar desde la versión anterior

Reemplaza los archivos del proyecto **sin borrar** las carpetas `data/` ni `public/uploads/`, ejecuta `npm install` y luego `npm start`. La base de datos se actualiza sola (campañas, galería, métodos de envío y datos de comprobante) y no pierdes productos, pedidos ni clientes.
