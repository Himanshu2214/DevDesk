import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// base './' so the build works from the BSP path /sap/bc/ui5_ui5/sap/zdd_app/.
// Fonts are inlined: the company network blocks CDNs, and the UI5 repository may serve .woff2 with a wrong content type.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
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
