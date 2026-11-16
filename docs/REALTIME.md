# MULTIPLAYER TITAN ISLAND

## API de salas (backend desplegado)
Supabase Edge Function: https://plbbuuhomxqhiidstigg.supabase.co/functions/v1/arena-rooms
GET / -> comprobación de servicio.
POST body action=public -> sala PUB222.
POST body action=join,code=ABC234 -> devuelve sala.
POST body action=create,title=Mi Sala,max_players=8,is_private=true -> sala privada temporal.
La API tiene CORS limitado, validación de input, control de cuotas por huella de IP y expiración de salas.

## Realtime
Cada sala crea un canal público con nombre na:room:CODE. Presence sincroniza miembros; Broadcast sincroniza posición, efectos de disparo, impacto y muerte.
Frecuencia de estados adaptativa al número de miembros para reducir la cuota del plan gratuito.

## Seguridad (beta)
- Se comprueba el código de sala en el servidor, pero los canales Realtime son públicos a quien conozca el nombre.
- El servidor no valida inputs, velocidad ni impacto; los clientes podrían mentir.
- El máximo de 8 personas se verifica en el cliente; no sustituye reserva de plazas del backend.
- No compartir datos personales ni usar saldo monetario en salas.
- Antes de torneos serios, instalar game server autoritativo Colyseus/Node o equivalente y ejecutar pruebas de carga.

## Pruebas realizadas
Desde un despliegue Vercel se comprobó la API de sala pública, se creó una sala privada y se verificó la unión por código. No se ha comprobado una partida WebGL completa entre dos dispositivos; queda como prueba manual recomendada.
