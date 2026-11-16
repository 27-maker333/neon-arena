# NEON ARENA — Integraciones: situación actual

## Conectado y probado
- GitHub: repositorio https://github.com/27-maker333/neon-arena, acceso de escritura confirmado.
- Hosting Vercel: https://neon-arena-gaming.vercel.app/ (web estática; estado de despliegue READY).
- Juego Neon Blast: lógica determinista 8x8 con reloj, validación local de grupos, y récord local sin backend.
- SEO técnico: título, descripción, Open Graph, canonical, robots.txt, sitemap.xml, esquema WebSite.

## Código preparado, servicio aún NO conectado
- Supabase: proyecto por autorizar/crear y desplegar. SQL en supabase/migrations y API en supabase/functions/api/index.ts.
- Registro e inicio de sesión de Supabase Auth: interfaz implementada, bloqueada sin configuración real.
- Ranking mundial y monedero: interfaz y rutas REST preparadas, desactivadas hasta desplegar la API.
- Recompensas diarias: funcionalidad de backend versionada, sin activación real.

## Requiere acceso del titular para configuración real
- Supabase: instalar/conectar app Supabase en ChatGPT o crear/autorizar proyecto Supabase. Nunca enviar contraseñas ni service-role.
- Google Search Console: verificar la propiedad de https://neon-arena-gaming.vercel.app/. Cuando haya propiedad autorizada, solicitar indexación y registrar https://neon-arena-gaming.vercel.app/sitemap.xml.
- Google Analytics: crear propiedad GA4, obtener ID público de medición; integrar eventos con consentimiento adecuado.
- Cloudflare Turnstile: crear sitio, obtener site key pública y secret solo en backend; añadir verificación server-side.
- Google OAuth: crear credenciales del proyecto en Google Cloud, configurar las URLs de redirección de Supabase; no se puede fabricar/extraer una credencial privada.
- Cloudflare Pages: opcional; Vercel se está utilizando porque era una cuenta conectada. Para monetización se debe revisar la licencia/condiciones de hosting.

## Protocolo de integración
1. Autorizar Supabase.
2. Crear proyecto neonatal (nombre recomendado neon-arena), aplicar migración, desplegar Edge Function api.
3. Establecer ALLOWED_ORIGINS incluyendo https://neon-arena-gaming.vercel.app y localhost:5173.
4. Añadir URL del proyecto Supabase, clave publicable y API_BASE_URL a web/config.js (no service_role).
5. Probar signup, login, partida start/finish, ranking, wallet y recompensa.
6. Desplegar nueva versión.
7. Verificar Search Console y, si se desea, activar Analytics y Turnstile.

No existen cobros ni sistemas de apuestas en este proyecto.
