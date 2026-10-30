import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Standalone (Supabase) build only: installable app – manifest, icons and the service worker in public/ (the SAP build gets none of it).
const pwa = (): Plugin => ({
  name: 'slate-space-pwa',
  transformIndexHtml: html => html.replace('</title>', ['</title>', '<link rel="manifest" href="./manifest.webmanifest">', '<meta name="theme-color" content="#13161b">',
    '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">'].join('\n  ')),
});

// base './' so the build works from the BSP path /sap/bc/ui5_ui5/sap/zdd_app/.
// Fonts are inlined: the company network blocks CDNs, and the UI5 repository may serve .woff2 with a wrong content type.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const standalone = mode === 'supabase';
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(standalone ? [pwa()] : [])],
    publicDir: standalone ? 'public' : false,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { assetsInlineLimit: 200_000, chunkSizeWarningLimit: 1200 },
    server: {
      port: 5181,
      // SAP mode: forward /sap/* to the S/4 system (target in .env.sap.local, never committed)
      proxy: env.VITE_SAP_TARGET
        ? { '/sap': { target: env.VITE_SAP_TARGET, changeOrigin: true, secure: false, cookieDomainRewrite: 'localhost' } }
        : undefined,
    },
  };
});
