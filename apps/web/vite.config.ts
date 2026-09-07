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
          // L'éditeur de script (TipTap + ProseMirror) ne sert que sur une fiche de
          // production ou une sponso : isolé, il n'est téléchargé que par ceux qui en
          // ouvrent une. `marked` l'accompagne — il ne sert qu'à relire les scripts
          // écrits en markdown avant la bascule en WYSIWYG.
          //
          // `@tiptap/pm` n'est PAS listable ici : ce paquet n'expose que des
          // sous-chemins (`@tiptap/pm/state`…) et rollup echoue a resoudre sa racine.
          // Ce sont les paquets `prosemirror-*` eux-memes qu'on nomme.
          editor: [
            '@tiptap/react',
            '@tiptap/core',
            '@tiptap/starter-kit',
            '@tiptap/extensions',
            '@tiptap/extension-text-style',
            '@tiptap/extension-highlight',
            '@tiptap/extension-text-align',
            '@tiptap/extension-list',
            '@tiptap/extension-table',
            'prosemirror-changeset',
            'prosemirror-commands',
            'prosemirror-dropcursor',
            'prosemirror-gapcursor',
            'prosemirror-history',
            'prosemirror-inputrules',
            'prosemirror-keymap',
            'prosemirror-model',
            'prosemirror-schema-list',
            'prosemirror-state',
            'prosemirror-tables',
            'prosemirror-transform',
            'prosemirror-view',
            'marked',
          ],
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
