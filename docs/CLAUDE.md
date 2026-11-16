# Instrucciones para Claude — NEON ARENA

El repositorio contiene el backend de ChatGPT. Tu responsabilidad: desarrollar el frontend profesional en **web/** y revisar la integración.
**Antes de editar:** leer docs/API.md y el motor supabase/functions/_shared/neon-blast.ts.
No cambiar el esquema ni API sin proponer primero los cambios.

## Stack
React + Vite + TypeScript + Tailwind CSS + Motion + Lucide React + React Router + Phaser + @supabase/supabase-js. Zustand opcional.

## Objetivo
Web gaming premium y responsive (PC y móvil), tema oscuro #090C20, morado #7C3AED, cian #00D4FF, rosa #FF3DAD. Animaciones fluidas, microinteracciones, accesibilidad y prefers-reduced-motion.
Landing SEO pública, catálogo, login/registro, perfil, dashboard, juego Neon Blast, ranking, inventario, tienda virtual, recompensas diarias. Admin fuera del MVP.

## Integración
- Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL.
- Supabase Auth Email/Password. Pasar token de acceso en Authorization Bearer a endpoints privados.
- No poner nunca service role / contraseñas en frontend.
- Para jugar POST /v1/matches/start y recibir seed. Reutilizar mismo engine compartido, NO crear reglas alternativas.
- Registrar movimientos válidos {index,atMs}; POST /v1/matches/finish; reflejar resultado validado.
- No inventar balance, partidas ni rankings. Si Supabase no está listo, habilitar modo demo etiquetado.
- Cliente REST tipado, loading/error/empty, mobile-first, tests básicos.
- No monetización con dinero real todavía.

## Entregables
web/ con package.json, src/, index.html, configuración Tailwind, pantallas implementadas, README propio; scripts npm run dev, build y test.
Cloudflare Pages compatible (build: npm run build, output: web/dist).
Incluye review de integración en docs/FRONTEND_REVIEW.md.
De momento NO existe proyecto Supabase real: el backend está versionado pero no desplegado.