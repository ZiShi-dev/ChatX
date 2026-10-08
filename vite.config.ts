/// <reference types="vitest" />

import { createHash } from 'node:crypto'
import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Production document policy. Dev stays open so Vite's inline preamble can run. */
function documentCsp(): Plugin {
  return {
    name: 'chatx-document-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes: string[] = [];
        for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
          const body = match[1] ?? '';
          if (!body.trim()) continue;
          hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
        }
        const policy = [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          `script-src 'self' https://accounts.google.com/gsi/client ${hashes.join(' ')}`.trim(),
          "frame-src https://accounts.google.com",
          "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
          "img-src 'self' data: blob: https://lh3.googleusercontent.com",
          "media-src 'self' blob: data:",
          "connect-src 'self' https:",
          "font-src 'self' data:",
        ].join('; ');
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      treeshake: {
        // Used components keep their registrations; unused components can be removed.
        moduleSideEffects: (id) => !/node_modules[\\/]@ionic[\\/]core[\\/]components[\\/]ion-[^\\/]+\.js$/.test(id),
      },
    },
  },
  plugins: [
    react(),
    legacy(),
    documentCsp(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  server: {
    host: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'microphone=(), geolocation=(), payment=()',
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
