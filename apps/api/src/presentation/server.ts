import express from 'express';
import cors from 'cors';
import type { Container } from '../container.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { channelsRouter } from './routes/channels.ts';
import { categoriesRouter, revenuesRouter } from './routes/revenues.ts';
import { expensesRouter } from './routes/expenses.ts';
import { analyticsRouter } from './routes/analytics.ts';

export const createServer = (container: Container): express.Express => {
  const app = express();

  app.use(
    cors({
      // Une liste vide (ou `*`) laisse passer tout le monde : pratique en local,
      // à restreindre via CORS_ORIGINS dès que l'API est exposée.
      origin: container.config.corsOrigins.includes('*') ? true : container.config.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/channels', channelsRouter(container));
  app.use('/api/categories', categoriesRouter(container));
  app.use('/api/revenues', revenuesRouter(container));
  app.use('/api/expenses', expensesRouter(container));
  app.use('/api/analytics', analyticsRouter(container));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route inconnue', code: 'NOT_FOUND' });
  });
  app.use(errorHandler);

  return app;
};
