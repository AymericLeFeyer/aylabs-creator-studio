import { loadConfig } from './config.ts';
import { buildContainer } from './container.ts';
import { createServer } from './presentation/server.ts';
import { startCollectScheduler } from './infrastructure/scheduler/collectScheduler.ts';
import { closeDatabase } from './infrastructure/db/database.ts';

const config = loadConfig();
const container = buildContainer(config);
const app = createServer(container);

const server = app.listen(config.port, () => {
  console.log(`[api] démarrée sur http://localhost:${config.port}`);
  console.log(`[api] base de données : ${config.databasePath}`);
  if (!config.youtubeApiKey) {
    console.warn('[api] YOUTUBE_API_KEY absente : les chaînes publiques ne seront pas collectées');
  }
  if (!config.gcpClientId || !config.gcpClientSecret) {
    console.warn('[api] identifiants GCP absents : les chaînes OAuth ne seront pas collectées');
  }
});

startCollectScheduler(container);

// Arrêt propre : sans fermeture explicite, SQLite laisse traîner ses fichiers -wal / -shm.
const shutdown = (signal: string): void => {
  console.log(`[api] ${signal} reçu, arrêt en cours`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  // Filet de sécurité si une connexion HTTP reste ouverte.
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
