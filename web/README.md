# NEON ARENA - web inicial

Web gratuita y jugable sin dependencias externas. Ejecuta desde la carpeta web con python -m http.server 8000 y abre localhost:8000.

Modo demo inicial: el récord se guarda solo en el navegador. Para activar cuentas, ranking y recompensas, despliega el backend de Supabase y configura las TRES claves publicables en web/config.js: apiBaseUrl, supabaseUrl, supabaseAnonKey. NUNCA publiques service_role.

Contrato API: docs/API.md. Claude puede convertir el frontend en React/Vite y Phaser más adelante sin cambiar el motor determinista del juego. También están incluidos title, meta description, Open Graph, robots.txt y manifest. Después de tener el dominio definitivo, registra sitemap y Search Console.
