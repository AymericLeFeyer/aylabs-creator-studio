import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Recharts pèse plus que tout le reste de l'application : l'isoler évite de
        // retélécharger le socle React à chaque déploiement d'une correction d'écran.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          // Le rendu markdown ne sert qu'à l'éditeur de script : isolé, il n'est
          // téléchargé que par ceux qui ouvrent une fiche de production.
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Le front appelle /api en relatif : le proxy évite toute question de CORS en dev,
    // et en production nginx sert le même chemin depuis le conteneur.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
