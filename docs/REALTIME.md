# NEON ARENA — Especificación multijugador de prueba

Sala única: neon-arena:deathmatch:room-001.
Tecnología: Supabase Realtime Presence y Broadcast. Sin contraseñas de servidor en cliente.
Presencia: id, name, color, kills, deaths, joinedAt. Se actualiza en la entrada y al cambiar el marcador, no en cada fotograma.
State (broadcast): id, x, z, yaw, hp, live (aproximadamente 3 envíos/segundo/jugador).
Shot (broadcast): id, end (punto de impacto, solo efecto visual).
Hit (broadcast): by, to, damage, t (el cliente afectado aplica daño).
Kill (broadcast): victim, by (se actualiza el marcador en vivo).

La sala permite un máximo recomendado de 6 clientes, solo verificado en frontend. El contador no es autoritativo.
Los bots son locales, únicamente cuando no hay otros usuarios, y no se registran en Realtime.

SEGURIDAD: el cliente comunica impactos y puntuaciones, por lo que un usuario con un navegador modificado puede hacer trampas. Antes de crecer se necesita un servidor autoritativo que valide posición, visibilidad, cadencia, daño y eliminaciones. No usar este MVP para premios con valor real.

Cuotas de Supabase Realtime Free (2026): 200 conexiones por proyecto, 100 mensajes por segundo y 2 millones de mensajes por mes. Ver https://supabase.com/docs/guides/realtime/limits.

PRUEBAS PENDIENTES: dos navegadores conectados a la misma sala; movimiento mutuo; raycast de disparo; daño, eliminación, respawn; reconexión y móvil.
