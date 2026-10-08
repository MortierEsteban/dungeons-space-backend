import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = process.env.API_URL ?? 'http://localhost:3000';

// En développement, le front proxifie l'API et Socket.IO : une seule origine, cookies httpOnly simples.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query', 'socket.io-client'],
        },
      },
    },
  },
  test: { name: 'web', environment: 'jsdom', passWithNoTests: true },
});
