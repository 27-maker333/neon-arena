# NEON ARENA — Contrato API v1

**URL base al desplegar:** https://PROJECT_REF.supabase.co/functions/v1/api
**Estado:** backend escrito, **no desplegado ni probado contra Supabase real**.

Públicos: GET /v1/health, GET /v1/games, GET /v1/leaderboard, GET /v1/shop.
Privados: Authorization: Bearer SUPABASE_ACCESS_TOKEN.
Errores: {"error":{"message":"..."}}. No enviar ninguna clave service_role desde el navegador.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | /v1/health | {ok,project,version} |
| GET | /v1/games | {games:[{id,slug,title,description,enabled}]} |
| GET | /v1/leaderboard?game=neon-blast&limit=20 | {leaderboard:[{rank,player_name,best_score,games_played}]} |
| GET | /v1/shop | {items:[{id,slug,title,description,price_coins}]} |
| GET | /v1/profile | {profile:{id,username,avatar_url,level,created_at}} |
| PATCH | /v1/profile | Body {username:"Jugador_1",avatar_url:null} |
| GET | /v1/wallet | {wallet:{coins}} |
| GET | /v1/inventory | {inventory:[{item_id,purchased_at,shop_items:{...}}]} |
| GET | /v1/stats/me | {stats:{games_played,best_score}} |
| POST | /v1/rewards/daily | {coins_awarded,already_claimed} |
| POST | /v1/shop/purchase | Body {item_id:"UUID"}; returns {success,coins_remaining} |
| POST | /v1/matches/start | Body {game_slug:"neon-blast"}; returns {match:{id,seed,grid,started_at,expires_at,duration_ms}} |
| POST | /v1/matches/finish | Body {match_id:"UUID",moves:[{index:12,atMs:500}]} returns {result:{score,moves,coins_awarded}} |

## Neon Blast rules
- 8x8 grid with 5 colors (0..4), index=row*8+col.
- Click connected orthogonal groups of >=3 identical orbs.
- Deterministic seeded RNG regenerates orbs after gravity.
- Score += n*10 + max(0,n-3)^2*5.
- 60 seconds, 120 valid moves max; each atMs integer in 0..60000; consecutive atMs at least 150ms apart.
- Shared engine: supabase/functions/_shared/neon-blast.ts exports initialState,applyMove,replay.
- Server generates seed. Client sends only valid movements; score is reconstructed on server.
- If backend offline, show EXPLICIT demo mode: no fictional online rankings, wallet balance, or purchases.

## Frontend states
401 login; 400 invalid request; 404 missing; 409 conflict; 503 retry.
Security: this is only baseline score replay, not strong protection against automation.