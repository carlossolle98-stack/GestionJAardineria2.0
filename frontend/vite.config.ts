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
      '/api': { target: 'https://gestionjaardineria20-backend-production.up.railway.app', changeOrigin: true },
    },
  },
});
