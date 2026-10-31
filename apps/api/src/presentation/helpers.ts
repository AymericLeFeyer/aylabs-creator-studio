import type { Request } from 'express';
import { badRequest } from '../shared/errors.ts';

/**
 * Lit un paramètre de route en garantissant un `string`.
 *
 * Express 5 type `req.params` largement (`string | string[] | undefined`) parce qu'un
 * motif peut capturer plusieurs segments. Nos routes n'utilisent que des paramètres
 * simples : ce helper resserre le type en un seul endroit plutôt que de caster partout.
 */
export const param = (req: Request, name: string): string => {
  const value = (req.params as Record<string, unknown>)[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`Paramètre de route "${name}" manquant`);
  }
  return value;
};

/**
 * La clé se lit dans `Authorization: Bearer …`, sinon dans `?key=`.
 *
 * L'en-tête est la voie à préférer — une adresse finit dans les journaux de nginx. Le
 * paramètre existe pour les clients qui ne savent pas poser d'en-tête.
 */
export const readToken = (req: Request): string | null => {
  const match = req.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return typeof req.query.key === 'string' ? req.query.key : null;
};
