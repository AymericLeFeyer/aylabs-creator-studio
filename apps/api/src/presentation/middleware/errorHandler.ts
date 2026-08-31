import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.ts';

/**
 * Traduit les erreurs en réponses JSON uniformes `{ error, code, details? }`.
 * Doit être enregistré en dernier : Express reconnaît un middleware d'erreur
 * à ses quatre paramètres, `next` compris même s'il n'est pas utilisé.
 */
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: 'Données invalides',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  console.error('[api] erreur non gérée :', error);
  res.status(500).json({ error: 'Erreur interne du serveur', code: 'INTERNAL_ERROR' });
};

/**
 * Enrobe un handler async pour que ses rejets partent dans `errorHandler`.
 * Express 5 propage déjà les promesses rejetées, mais l'enrobage garde le
 * comportement explicite et indépendant de la version.
 */
export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res)).catch(next);
  };
