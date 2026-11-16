# NEON ARENA — HANDOFF PARA CLAUDE

Primero inspecciona el repositorio ya construido. No empieces desde cero ni sustituyas el juego con una landing vacía.

URL de pruebas: https://neon-arena-gaming.vercel.app/
GitHub: https://github.com/27-maker333/neon-arena
Supabase está conectado, proyecto plbbuuhomxqhiidstigg.

## Archivos existentes
- web/index.html: lobby, HUD y SEO.
- web/arena.css + web/island.css: estilos responsive.
- web/arena.js: motor 3D, cuatro armas, bots, colisiones, respawn y sincronización.
- web/island.js: isla de unos 200 metros (puerto, bosque, ciudad, laboratorios, núcleo, fortaleza).
- web/rooms.js: crear sala, entrar con código y copiar invitación.
- web/assets/*.svg: ilustraciones y marca originales.
- supabase/functions/arena-rooms/index.ts: API online para crear y localizar salas.
- supabase/migrations/20261116020000_arena_rooms.sql: tabla de salas y límites de creación.

## Prioridades
1. Probar dos clientes conectados al mismo enlace y corregir errores WebGL/multiplayer.
2. Mejorar personajes 3D: proporciones humanas, rigging, idle/run/jump/reload/shoot, modelados profesionales y materiales con licencias compatibles.
3. Isla: interiores transitables, colisiones, coberturas y elevaciones reales; optimizar LOD/instancing.
4. Armas: animaciones, efectos, audio CC0, balance, retículas y feedback de daño.
5. Menús: lista de amigos, lobby de sala, crear/unirse con código, estados de error y reconexión.
6. Calidad: pruebas en PC y móvil, accesibilidad, rendimiento, cámara, antitrampas y monitoreo.
7. Migrar a React/TypeScript modular sin romper el juego jugable.
8. Para competitivo serio, reemplazar transporte de daño basado en clientes por servidor autoritativo.

## Restricciones
- No usar APIs de pago sin autorización.
- El backend actual usa Supabase Realtime público para prototipos y tiene límites estrictos.
- Nunca publicar SUPABASE_SERVICE_ROLE_KEY ni secret keys en el frontend.
- Los disparos son reportados por clientes: aún no se puede garantizar juego sin trampas.
- Los invitados acceden mediante un código; no equivale a autenticación fuerte.
- No mostrar bots como jugadores humanos reales.
