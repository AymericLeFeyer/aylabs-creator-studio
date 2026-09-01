import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { ProductStatus } from '../../domain/product/entities/Product.ts';
import { createProductSchema, productQuerySchema, updateProductSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Produits reçus des marques.
 *
 * L'écriture passe par `manageProducts` et jamais par le dépôt : c'est lui qui tient le
 * revenu en nature à jour, et un chemin d'écriture qui l'oublierait laisserait un
 * produit reçu sans valeur dans le chiffre d'affaires.
 */
export const productsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = productQuerySchema.parse(req.query);
    res.json(
      container.products.findAll({
        statuses: query.statuses as ProductStatus[],
        brandIds: query.brandIds,
        productionIds: query.productionIds,
        channelIds: query.channelIds,
      }),
    );
  });

  // `value` (euros) est converti en centimes par le schéma de validation.
  router.post('/', (req, res) => {
    const { value, ...rest } = createProductSchema.parse(req.body);
    res.status(201).json(container.manageProducts.create({ ...rest, valueCents: value }));
  });

  router.patch('/:id', (req, res) => {
    const { value, ...rest } = updateProductSchema.parse(req.body);
    res.json(
      container.manageProducts.update(param(req, 'id'), {
        ...rest,
        ...(value !== undefined ? { valueCents: value } : {}),
      }),
    );
  });

  router.delete('/:id', (req, res) => {
    container.manageProducts.remove(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
