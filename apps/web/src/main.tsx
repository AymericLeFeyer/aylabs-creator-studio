import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './registerServiceWorker.ts';
import { applyBranding } from './presentation/branding/applyBranding.ts';
import { readCachedBranding } from './infrastructure/branding/brandingCache.ts';
import './index.css';

// Avant le premier rendu : l'onglet porte tout de suite le dernier nom et logo connus,
// sans attendre la réponse de l'API.
applyBranding(readCachedBranding());

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable dans index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Après le rendu : l'installation ne doit pas retarder le premier écran.
registerServiceWorker();
