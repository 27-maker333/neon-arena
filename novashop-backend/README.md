# NovaShop API deployment source
This branch exists only to deploy the NovaShop API from the user-supplied ZIP.
Main branch and game files are not changed.

Render service configuration:
- Runtime: Node
- Branch: deploy/novashop-tienda-api
- Build: node novashop-backend/unpack.js && cd novashop-backend/app && npm ci
- Start: cd novashop-backend/app && npm start
- Node version: 22.16.0 (NODE_VERSION)
- Health endpoint: /api/health

Set NODE_ENV=production, JWT_SECRET with >=32 random chars, ADMIN_PASSWORD with >=12 random chars, ADMIN_EMAIL and SEED_DEMO. Do not run the checkout/admin system in production without persistent storage for SQLite and uploads. The Render free tier has ephemeral local files.
