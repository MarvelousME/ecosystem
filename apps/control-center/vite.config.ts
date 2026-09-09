import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import path from 'node:path';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'es2022',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts']
  }
});
