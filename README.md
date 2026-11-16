# NEON ARENA — Deathmatch 3D

Sitio: https://neon-arena-gaming.vercel.app/

Juego 3D en tercera persona con personajes estilizados de bloques, un único mapa y una sala compartida en Supabase Realtime. El juego funciona con hasta 6 participantes por sala en esta versión de prueba. Si juegas solo, aparecen bots locales para practicar.

## Controles
PC: WASD mover, mouse mirar, clic disparar, espacio saltar, shift correr, R recargar, ESC pausa.
Móvil: joystick virtual, gesto para apuntar, botones de salto/disparo/recarga.

## Código fuente
- web/index.html: lobby, paneles y HUD.
- web/arena.css: interfaz responsive.
- web/arena.js: escena Three.js, combate, movimiento, bots y realtime.
- web/assets/: SVG originales de marca y póster.
- web/config.js: URL y clave PUBLICABLE de Supabase. Nunca subir una clave privada.
- docs/REALTIME.md: protocolo de eventos y límites técnicos.

Servir web/ con cualquier servidor HTTP. No requiere npm ni compilación; los módulos Three.js y Supabase JS se cargan desde CDN.

## Estado técnico
La versión inicial está publicada con la conexión de Vercel. Los cambios del repositorio no se despliegan automáticamente todavía.
El multiplayer por Broadcast NO tiene servidor autoritativo; los movimientos y daños pueden falsificarse desde un navegador alterado. No es apto para clasificaciones profesionales ni premios reales hasta añadir validación centralizada, controles antifraude y pruebas con varios jugadores reales.
El backend legado para Neon Blast (SQL/Edge Functions) está todavía en supabase/ pero NO lo utiliza Deathmatch.

El marcador de Deathmatch es temporal y los bots son locales. Los planes gratuitos de Realtime tienen cuotas estrictas.
