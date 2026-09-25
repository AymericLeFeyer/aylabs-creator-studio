import express, { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  BRANDING_ICON_KEYS,
  DEFAULT_ICON_PATHS,
  type BrandingIconKey,
} from '../../domain/branding/entities/Branding.ts';
import { appName, buildManifest } from '../../domain/branding/services/manifest.ts';
import { setBrandingLogoSchema, updateBrandingSchema } from '../validation.ts';
import { param } from '../helpers.ts';
import { notFound } from '../../shared/errors.ts';

/**
 * Le nom et le logo de l'application (Paramètres → Général → Personnalisation), et ce qui
 * en découle : le manifeste PWA et les icônes.
 *
 * Monté **avant** le `express.json` global de 1 Mo : cinq PNG en base64 le dépassent
 * vite, et le parseur global répondrait 413 avant que ce routeur ne soit atteint.
 *
 * Les adresses d'icônes n'ont **pas d'extension** : nginx sert tout ce qui finit en
 * `.png` depuis le disque (règle de cache des icônes), et une icône en `.png` sous
 * `/api/` n'atteindrait jamais l'API.
 */
export const brandingRouter = (container: Container): Router => {
  const router = Router();
  router.use(express.json({ limit: '8mb' }));

  const view = () => {
    const branding = container.branding.get();
    return { ...branding, displayName: appName(branding) };
  };

  router.get('/', (_req, res) => {
    res.json(view());
  });

  router.patch('/', (req, res) => {
    const { name } = updateBrandingSchema.parse(req.body);
    container.branding.setName(name);
    res.json(view());
  });

  router.put('/logo', (req, res) => {
    const { icons } = setBrandingLogoSchema.parse(req.body);
    container.branding.setLogo(icons);
    res.json(view());
  });

  router.delete('/logo', (_req, res) => {
    container.branding.clearLogo();
    res.json(view());
  });

  // Relu à chaque ouverture : un nom ou un logo changé doit se voir à la prochaine
  // vérification du navigateur, pas dans un an.
  router.get('/manifest', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res
      .type('application/manifest+json')
      .send(JSON.stringify(buildManifest(container.branding.get())));
  });

  router.get('/icons/:key', (req, res) => {
    const key = param(req, 'key');
    if (!BRANDING_ICON_KEYS.includes(key as BrandingIconKey)) throw notFound('Icône');
    const data = container.branding.icon(key as BrandingIconKey);
    // Sans logo (ou juste après l'avoir retiré), l'icône livrée avec le front : une
    // adresse gardée en cache par un navigateur ne doit jamais tomber sur un 404.
    if (!data) {
      res.redirect(302, DEFAULT_ICON_PATHS[key as BrandingIconKey]);
      return;
    }
    // L'adresse porte `?v=` : une version donnée ne change jamais de contenu.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('image/png').send(Buffer.from(data));
  });

  return router;
};
