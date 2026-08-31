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
