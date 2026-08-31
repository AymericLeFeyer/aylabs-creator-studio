/** Erreur métier portant un code HTTP, interceptée par le middleware d'erreurs Express. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what: string) => new AppError(`${what} introuvable`, 404, 'NOT_FOUND');
export const badRequest = (message: string) => new AppError(message, 400, 'BAD_REQUEST');
export const conflict = (message: string) => new AppError(message, 409, 'CONFLICT');
export const upstream = (message: string) => new AppError(message, 502, 'UPSTREAM_ERROR');
