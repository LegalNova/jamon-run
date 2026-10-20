import { defineConfig } from 'vite';

// En desarrollo, /api y /ws van al servidor local de Cloudflare (wrangler dev, puerto 8787).
const SERVER = 'http://127.0.0.1:8787';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/ws': { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
