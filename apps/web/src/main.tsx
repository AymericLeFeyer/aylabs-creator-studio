import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './registerServiceWorker.ts';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable dans index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Après le rendu : l'installation ne doit pas retarder le premier écran.
registerServiceWorker();
