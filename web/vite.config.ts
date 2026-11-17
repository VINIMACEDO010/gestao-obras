import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA: o encarregado instala no celular e usa no canteiro
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Gestão de Obras',
        short_name: 'Obras',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f3a5f',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // A API nunca é servida do cache
        navigateFallbackDenylist: [/^\/api\//, /^\/callback/],
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { sourcemap: false },
});
