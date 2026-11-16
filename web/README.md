# NEON ARENA · shooter 3D web

Versión desplegada: https://neon-arena-gaming.vercel.app/

Abrir desde HTTPS para usar módulos ESM, WebGL y Supabase Realtime. El proyecto es estático y no requiere instalar npm.

- index.html: lobby, HUD y SEO.
- arena.css: diseño arcade responsive.
- arena.js: escena 3D, jugador, IA de práctica y multijugador.
- assets/: ilustraciones SVG originales.
- config.js: valores públicos del proyecto Supabase.

Deathmatch usa Broadcast/Presence con una sala única, límite de 6 jugadores recomendado. No existe servidor autoritativo de combate. Prohibido publicar claves service_role en el navegador.
