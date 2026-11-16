# NEON ARENA — TITAN ISLAND

Producción: https://neon-arena-gaming.vercel.app/

## Empezar
Abre la web en un navegador compatible con WebGL. Escribe nickname, elige color y selecciona:
- Isla pública: sala PUB222.
- Crear sala: título, crear código de 6 caracteres, copiar enlace.
- Unirme: pegar el código recibido por un amigo.

### Juego
- WASD + mouse/clic para moverse, mirar y disparar.
- Espacio saltar, Shift correr, R recargar, teclas 1–4 elegir arma, ESC pausa.
- Móvil: joystick táctil, gestos de cámara, botones de acción.

## Archivos
- index.html + arena.css + island.css: interfaz y SEO.
- arena.js: juego Three.js.
- island.js: gran isla procedural con 6 zonas.
- rooms.js: conexión a API de salas, enlaces e invitaciones.
- config.js: configuración pública de Supabase.
- assets/: ilustraciones SVG originales.

## Desarrollo
Desde web/: python -m http.server 8000. No requiere npm; módulos cargados con CDN.
La web se despliega en Vercel. Servicio de salas y Realtime están alojados en Supabase.

## Límites
La API de salas está activa y permite crear y unirse por código, pero el combate online usa mensajes entre clientes. No tiene árbitro autoritativo ni controles antitrampas suficientes para competir por premios reales.
