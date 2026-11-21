# NovaShop backend
Deploy backend from this branch.
Build: `cd app && npm ci`; Start: `cd app && npm start`
Health: `/api/health`
Use secure NODE_ENV / JWT_SECRET / ADMIN_PASSWORD environment variables.
SQLite and uploads need persistent disk before using with real customers.
