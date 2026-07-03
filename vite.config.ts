/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // jsdom because the store touches localStorage/localforage at module load;
    // the pure-logic suites (mesher, player physics) don't care either way.
    environment: 'jsdom',
  },
});
