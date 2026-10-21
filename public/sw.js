// Service worker mínimo (para poder "Añadir a pantalla de inicio"). Siempre va a la red:
// el juego online necesita la versión más nueva.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
