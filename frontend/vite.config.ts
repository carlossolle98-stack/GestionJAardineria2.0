import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(dir, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Desarrollo contra el backend local. Apuntarlo a Railway escribe en la
      // base de produccion desde la maquina de desarrollo.
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
