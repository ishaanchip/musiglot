import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // One .env at the repo root serves the client, server and pipeline.
  const env = loadEnv(mode, '..', '');
  const api = `http://localhost:${env.PORT || 4000}`;
  return {
    plugins: [react()],
    envDir: '..',
    server: { port: 5173, proxy: { '/api': api, '/media': api } },
  };
});
