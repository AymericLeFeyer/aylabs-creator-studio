import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { SponsorshipStatus } from '../../domain/sponsorship/entities/Sponsorship.ts';
import {
  createSponsorshipSchema,
  sponsorshipQuerySchema,
  updateSponsorshipSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Sponsos. Même règle que les produits : l'écriture passe par `manageSponsorships`,
 * qui crée ou retire le revenu cash selon le statut.
 */
export const sponsorshipsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = sponsorshipQuerySchema.parse(req.query);
    res.json(
      container.sponsorships.findAll({
        statuses: query.statuses as SponsorshipStatus[],
        brandIds: query.brandIds,
        productionIds: query.productionIds,
        channelIds: query.channelIds,
      }),
    );
  });

  router.post('/', (req, res) => {
    const { amount, ...rest } = createSponsorshipSchema.parse(req.body);
    res.status(201).json(container.manageSponsorships.create({ ...rest, amountCents: amount }));
  });

  router.patch('/:id', (req, res) => {
    const { amount, ...rest } = updateSponsorshipSchema.parse(req.body);
    res.json(
      container.manageSponsorships.update(param(req, 'id'), {
        ...rest,
        ...(amount !== undefined ? { amountCents: amount } : {}),
      }),
    );
  });

  router.delete('/:id', (req, res) => {
    container.manageSponsorships.remove(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
