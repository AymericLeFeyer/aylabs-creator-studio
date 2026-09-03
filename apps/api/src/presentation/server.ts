import express from 'express';
import cors from 'cors';
import type { Container } from '../container.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { channelsRouter } from './routes/channels.ts';
import { categoriesRouter, revenuesRouter } from './routes/revenues.ts';
import { expensesRouter } from './routes/expenses.ts';
import { analyticsRouter } from './routes/analytics.ts';
import { videosRouter } from './routes/videos.ts';
import { brandsRouter } from './routes/brands.ts';
import {
  productionsRouter,
  productionSlotsRouter,
  productionStepsRouter,
} from './routes/productions.ts';
import { productionTimeRouter } from './routes/productionTime.ts';
import { productionTodosRouter, stepTodosRouter } from './routes/productionTodos.ts';
import { recurringExpensesRouter } from './routes/recurringExpenses.ts';
import { productsRouter } from './routes/products.ts';
import { sponsorshipsRouter } from './routes/sponsorships.ts';
import { ideasRouter } from './routes/ideas.ts';
import { legalRouter } from './routes/legal.ts';
import { affiliatePlatformsRouter } from './routes/affiliatePlatforms.ts';

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
  app.use('/api/videos', videosRouter(container));
  app.use('/api/analytics', analyticsRouter(container));
  app.use('/api/brands', brandsRouter(container));
  // Monté AVANT `/api/productions` : un router de préfixe plus long doit passer en
  // premier, sinon c'est le plus court qui capte la requête et répond 404.
  app.use('/api/productions/:id/todos', productionTodosRouter(container));
  app.use('/api/productions', productionsRouter(container));
  app.use('/api/production-steps', productionStepsRouter(container));
  app.use('/api/production-slots', productionSlotsRouter(container));
  app.use('/api/production-time', productionTimeRouter(container));
  app.use('/api/step-todos', stepTodosRouter(container));
  app.use('/api/recurring-expenses', recurringExpensesRouter(container));
  app.use('/api/products', productsRouter(container));
  app.use('/api/sponsorships', sponsorshipsRouter(container));
  app.use('/api/ideas', ideasRouter(container));
  app.use('/api/legal', legalRouter(container));
  app.use('/api/affiliate-platforms', affiliatePlatformsRouter(container));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route inconnue', code: 'NOT_FOUND' });
  });
  app.use(errorHandler);

  return app;
};
