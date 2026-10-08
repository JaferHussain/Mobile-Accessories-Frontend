/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Without this the client's default base URL of "/api" resolves to the dev server itself
      // and every call 404s. Proxying means a fresh clone works with no .env at all, and the
      // browser sees one origin, so CORS never enters into it during development.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5080',
        changeOrigin: true,
      },
      // Product pictures (feature 005) are served as static files, not under /api — without
      // this, every thumbnail and full image 404s against the dev server itself and silently
      // falls back to the placeholder, even for a product that really has a picture.
      '/content': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Typing-heavy tests pass in well under a second alone, but can pass 5 s under full-suite load.
    testTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      // Constitution Principle III: the pure business logic in lib/ is where the money maths
      // lives, so it is held to a higher bar than presentational components.
      include: ['src/lib/**', 'src/features/**'],
    },
  },
});
