import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      fs: {
        // El servidor de desarrollo sirve la raíz del proyecto: sin esto, cualquiera que llegue
        // al puerto descarga server/data (datos de todas las empresas) sin iniciar sesión.
        // Reemplaza la lista por defecto de Vite, por eso se repiten sus entradas.
        deny: [
          '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
          '**/server/**', '**/.secrets/**', '**/.neon', '**/*.bak', '**/*.prev',
          '**/firebase-export-*/**', '**/emulator-data/**', 'server.ts', 'neon.ts',
          '**/db/**', '**/database/**', '**/scripts/**', '**/audit-*.json',
        ],
      },
    },
  };
});
