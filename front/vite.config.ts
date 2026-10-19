import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || 3100;

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    // "^/api/" (com a barra): "/api" puro também pegaria o arquivo /api.ts do próprio front
    proxy: { '^/api/': { target: `http://localhost:${apiPort}`, changeOrigin: true } },
  },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
