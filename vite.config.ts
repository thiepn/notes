import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/notes/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        id: '/notes/',
        name: 'Notes',
        short_name: 'Notes',
        description: 'A private, local-first notes app.',
        start_url: '/notes/',
        scope: '/notes/',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#f6f7f9',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: '/notes/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/notes/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/notes/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/notes/index.html',
        navigateFallbackDenylist: [/^\/notes\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz}'],
        globIgnores: ['ocr/**/*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/notes\/ocr\//u,
            handler: 'CacheFirst',
            options: {
              cacheName: 'notes-ocr-runtime-v1',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
});
