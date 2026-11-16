# ISLA TITÁN — DOCUMENTACIÓN Y PRUEBAS

MAPA: radio jugable ~92 unidades. Geografía procedimental, costa, puerto con contenedores, ciudad al norte, bosque, fortaleza del sur, núcleo central, laboratorio al sureste. Agua fuera del terreno, arena y caminos, iluminación solar, farolas y efectos neón.

PERSONAJES: armaduras humanoides estilizadas, casco, visor, guantes, botas, placas de hombro, torso, arma con accesorios. En fases futuras se recomienda glTF/GLB optimizado con rigging y animaciones bajo licencia compatible.

ARMAS: Pulse Rifle (25 daño, 28 balas), Blaster (42, 8 balas), Marksman (45, 12 balas) y Neon SMG (16, 35 balas). Teclas 1 a 4. Disparo con trazadoras, cooldown, recarga y hitmarkers.

ONLINE: se usa Supabase Realtime por sala. Código PUB222 para la sala pública; crear salas privadas produce un código de 6 caracteres válido por 5 horas. La API Edge Function para salas es https://plbbuuhomxqhiidstigg.supabase.co/functions/v1/arena-rooms. Los canales públicos reciben posiciones, trazadoras y solicitudes de daño.

PRUEBAS MANUALES PENDIENTES:
1. Abrir la URL en dos dispositivos con WebGL y conexión.
2. Crear sala, compartir enlace y entrar por código.
3. Ver que ambos usuarios aparecen en marcador y se mueven en el mismo mapa.
4. Probar cuatro armas, munición, disparos, daño, muerte y respawn.
5. Salir y volver a entrar; comprobar móvil y consola del navegador.
6. Comprobar límites Realtime al hacer pruebas de carga pequeñas.

SEGURIDAD: el backend de salas valida el código y limita su creación; el combate aún depende de clientes no autoritativos. El código no es un control de acceso fuerte; los mensajes pueden falsificarse. Para lanzamientos masivos se necesita servidor de simulación autoritativo, input prediction, reconciliación, protección contra trampas y moderación.

COSTES: infraestructura actual en planes gratis, con cuotas y limitaciones. No garantiza soporte de millones de usuarios gratis.
