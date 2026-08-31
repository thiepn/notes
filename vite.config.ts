import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/notes/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'Notes',
        short_name: 'Notes',
        description: 'A private, local-first notes app.',
        start_url: '/notes/',
        scope: '/notes/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: {
        navigateFallback: '/notes/index.html',
      },
    }),
  ],
});
