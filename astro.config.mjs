// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

import tailwindcss from '@tailwindcss/vite';

const site = process.env.SITE ?? 'https://YOUR_GITHUB_USERNAME.github.io';
const base = process.env.BASE_PATH ?? '/';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-48x48.png', 'app-icon.svg', 'app-icon-maskable.svg'],
      manifest: {
        name: 'Festivos Colombia',
        short_name: 'Festivos',
        description: 'Calendario premium de festivos de Colombia con vistas anual, mensual y semanal.',
        theme_color: '#0c1b1d',
        background_color: '#081012',
        display: 'standalone',
        start_url: base,
        scope: base,
        lang: 'es-CO',
        icons: [
          {
            "src": "icon-48x48.png",
            "sizes": "48x48",
            "type": "image/png"
          },
          {
            "src": "icon-72x72.png",
            "sizes": "72x72",
            "type": "image/png"
          },
          {
            "src": "icon-96x96.png",
            "sizes": "96x96",
            "type": "image/png"
          },
          {
            "src": "icon-128x128.png",
            "sizes": "128x128",
            "type": "image/png"
          },
          {
            "src": "icon-144x144.png",
            "sizes": "144x144",
            "type": "image/png"
          },
          {
            "src": "icon-152x152.png",
            "sizes": "152x152",
            "type": "image/png"
          },
          {
            "src": "icon-192x192.png",
            "sizes": "192x192",
            "type": "image/png"
          },
          {
            "src": "icon-256x256.png",
            "sizes": "256x256",
            "type": "image/png"
          },
          {
            "src": "icon-384x384.png",
            "sizes": "384x384",
            "type": "image/png"
          },
          {
            "src": "icon-512x512.png",
            "sizes": "512x512",
            "type": "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,json}']
      }
    })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
