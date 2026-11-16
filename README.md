# NEON ARENA — ISLA TITÁN: SHOOTER 3D ONLINE

**Abrir y jugar:** https://neon-arena-gaming.vercel.app/

Se implementó un juego 3D en tercera persona con una isla grande, puerto, costa, bosque, ciudad futurista, laboratorios, fortaleza, avatares humanoides acorazados, cuatro armas, radar y salas con códigos para amigos.

## Funcionalidades
- Crear sala de amigos y compartir código de 6 caracteres o enlace.
- Unirse a sala privada con un código o entrar a isla pública PUB222.
- Multijugador mediante Supabase Realtime Presence y Broadcast (versión experimental).
- Bots de práctica cuando no hay otros usuarios conectados.
- Armas: Pulse Rifle, Blaster, Marksman y Neon SMG.
- HUD de salud, munición, eliminaciones, radar y respawn.
- PC: WASD, mouse/clic, espacio saltar, shift correr, R recargar, 1–4 armas, ESC pausa.
- Móvil: joystick, gesto táctil de apuntar y botones de disparo/salto/recarga.

## Código
- web/index.html, web/arena.css, web/island.css
- web/arena.js: controlador, combate y sincronización
- web/island.js: mapa procedural
- web/rooms.js: crear, unirse y compartir salas
- web/assets/*.svg: gráficos vectoriales
- web/config.js: configuración publicable del proyecto
- supabase/functions/arena-rooms/index.ts: API de salas
- supabase/migrations/20261116020000_arena_rooms.sql
- docs/CLAUDE.md: instrucciones para Claude
- docs/ISLAND_GAME.md: arquitectura, puntos del mapa y pruebas

## Probar con amigos
1. Entrar en https://neon-arena-gaming.vercel.app/.
2. Elegir CREAR SALA, escribir nombre y pulsar CREAR.
3. Copiar enlace y enviarlo al amigo.
4. Los dos entran con nickname y presionan ENTRAR A JUGAR.
5. Verificar presencia en marcador, movimientos, armas y disparos.
6. Alternativa: seleccionar ISLA PÚBLICA en ambos.

El juego estático puede servirse desde web/ con python -m http.server 8000. Requiere WebGL, conexión y un navegador moderno.

## Límites (importante)
No hay aún servidor autoritativo de combate: las solicitudes de impacto y movimiento dependen de los clientes y pueden ser falsificadas. La ocupación máxima se controla en frontend y puede tener condiciones de carrera. Los códigos de sala no son contraseñas; no envíes datos personales a canales públicos. El marcador de shooter es temporal y los bots se simulan localmente. Antes de publicar torneos competitivos, usar servidor WebSocket autoritativo.

Supabase Free tiene límites de Realtime: https://supabase.com/docs/guides/realtime/limits.
Vercel aloja la página estática y no sustituye a un game server WebSocket persistente. No subir claves secretas.
