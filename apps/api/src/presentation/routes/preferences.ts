import { Router } from 'express';
import type { Container } from '../../container.ts';
import { preferenceKeySchema, setPreferenceSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les préférences partagées entre appareils (voir `SharedPreferenceRepository`). Le front
 * relit la liste à intervalle court et au retour sur l'onglet : un réglage fait sur
 * l'ordinateur s'applique au téléphone sans rien faire.
 */
export const preferencesRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.sharedPreferences.findAll());
  });

  router.put('/:key', (req, res) => {
    const key = preferenceKeySchema.parse(param(req, 'key'));
    const { value } = setPreferenceSchema.parse(req.body);
    container.sharedPreferences.set(key, value);
    res.json(container.sharedPreferences.findAll());
  });

  return router;
};
