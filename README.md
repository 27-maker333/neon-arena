# NEON ARENA — plataforma de videojuegos web

Repositorio de desarrollo del proyecto NEON ARENA. **El backend inicial está versionado, pero todavía no está desplegado. El frontend aún no está implementado.**

## Archivos principales

- `supabase/migrations/20261116000000_init.sql`: tablas PostgreSQL, RLS, rankings, recompensas y tienda.
- `supabase/functions/api/index.ts`: 13 rutas HTTP de Supabase Edge Functions.
- `supabase/functions/_shared/neon-blast.ts`: reglas compartidas del juego Neon Blast.
- `docs/API.md`: contrato de integración REST.
- `docs/CLAUDE.md`: instrucciones técnicas para desarrollar la web con Claude.
- `.env.example`: variables de entorno públicas de ejemplo; nunca subir contraseñas.

## Configurar backend

1. Crear un proyecto en https://supabase.com/dashboard/ (plan gratuito).
2. Instalar Supabase CLI e iniciar sesión con `supabase login`.
3. Desde la raíz ejecutar `supabase link --project-ref TU_PROJECT_REF`.
4. Ejecutar `supabase db push` para aplicar la migración.
5. Configurar CORS con `supabase secrets set ALLOWED_ORIGINS=https://tu-web.pages.dev,http://localhost:5173`.
6. Desplegar con `supabase functions deploy api --no-verify-jwt` (las rutas privadas validan el token internamente).
7. Activar Supabase Auth Email/Password y configurar URLs de redirección.
8. En el futuro frontend usar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_API_BASE_URL` (ver `.env.example`).

URL de prueba tras desplegar: `https://PROJECT_REF.supabase.co/functions/v1/api/v1/health`.

## Para Claude

Lee primero `docs/CLAUDE.md` y `docs/API.md`. Construye el frontend en carpeta `web/` con React, TypeScript, Vite y Phaser sin alterar las reglas compartidas. La compilación debe servir para Cloudflare Pages.

## Seguridad y limitaciones

- La clave `SUPABASE_SERVICE_ROLE_KEY` jamás debe estar en el navegador ni en GitHub.
- La validación de puntuaciones mediante reproducción de movimientos es una primera barrera; faltan rate limits robustos, pruebas de integración y controles antifraude adicionales.
- Todo está pensado para planes gratuitos con límites de uso, no recursos ilimitados.
- Sin proyecto Supabase conectado no hay endpoints en funcionamiento ni web publicada.
