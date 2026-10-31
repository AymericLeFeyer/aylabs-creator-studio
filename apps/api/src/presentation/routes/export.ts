import { Router } from 'express';
import type { Container } from '../../container.ts';
import { isIntegrationProvider } from '../../domain/integration/entities/Integration.ts';
import { notFound } from '../../shared/errors.ts';
import { param, readToken } from '../helpers.ts';

/**
 * `/api/export` — ce que publie le studio pour Home Assistant, un widget, un script.
 *
 * **La seule route protégée par une clé.** Le reste de l'API n'a pas d'authentification
 * et vit derrière nginx sur le réseau interne ; celle-ci est faite pour être appelée
 * depuis une autre machine, et porte des chiffres d'argent.
 */
export const exportRouter = (container: Container): Router => {
  const router = Router();

  router.use((req, res, next) => {
    container.manageIntegrations.authenticate(readToken(req));
    // Une réponse d'export mise en cache par un proxy servirait des chiffres périmés
    // à qui connaît l'adresse.
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', (_req, res) => {
    res.json(container.getExport.execute());
  });

  router.get('/:provider', (req, res) => {
    const provider = param(req, 'provider');
    if (!isIntegrationProvider(provider)) throw notFound('Source');
    const entry = container.getExport.entry(provider);
    if (!entry) throw notFound(`Données ${provider}`);
    res.json(entry);
  });

  return router;
};
