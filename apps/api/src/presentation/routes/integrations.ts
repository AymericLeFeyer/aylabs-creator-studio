import { Router, type Request } from 'express';
import type { Container } from '../../container.ts';
import {
  isIntegrationProvider,
  type IntegrationProvider,
} from '../../domain/integration/entities/Integration.ts';
import { notFound } from '../../shared/errors.ts';
import { createExportKeySchema, updateIntegrationSchema } from '../validation.ts';
import { param } from '../helpers.ts';

const providerParam = (req: Request): IntegrationProvider => {
  const value = param(req, 'provider');
  if (!isIntegrationProvider(value)) throw notFound('Source');
  return value;
};

/**
 * Paramètres → API : les sources de l'export et les clés qui autorisent à le lire.
 *
 * `/keys` est déclaré **avant** `/:provider`, même vigilance que `/overview` ailleurs.
 *
 * **Aucun secret ne sort d'ici.** Les réponses sont des `IntegrationView`, où un mot de
 * passe se réduit à sa provenance ; le seul jeton jamais renvoyé est celui d'une clé
 * qu'on vient de créer, une fois.
 */
export const integrationsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.manageIntegrations.overview());
  });

  router.get('/keys', (_req, res) => {
    res.json(container.manageIntegrations.listKeys());
  });

  router.post('/keys', (req, res) => {
    const body = createExportKeySchema.parse(req.body);
    res.status(201).json(container.manageIntegrations.createKey(body.label));
  });

  router.delete('/keys/:id', (req, res) => {
    container.manageIntegrations.deleteKey(param(req, 'id'));
    res.status(204).end();
  });

  router.patch('/:provider', (req, res) => {
    const body = updateIntegrationSchema.parse(req.body);
    res.json(container.manageIntegrations.update(providerParam(req), body));
  });

  /** Collecte immédiate. Peut prendre une vingtaine de secondes quand un navigateur tourne. */
  router.post('/:provider/collect', async (req, res) => {
    const provider = providerParam(req);
    const result = await container.collectIntegrations.collectOne(provider);
    res.json({ result, integration: container.manageIntegrations.view(provider) });
  });

  return router;
};
