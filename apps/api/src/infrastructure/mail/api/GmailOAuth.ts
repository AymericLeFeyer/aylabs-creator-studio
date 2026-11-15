import { z } from 'zod';
import type { GmailOAuthCredentials } from '../../../domain/mail/entities/Mail.ts';
import { upstream } from '../../../shared/errors.ts';

const tokenResponse = z.object({
  access_token: z.string().min(1).optional(),
  error: z.string().optional(),
});

/** Demande un jeton court à Google au moment d'ouvrir une connexion mail. */
export const gmailAccessToken = async (credentials: GmailOAuthCredentials): Promise<string> => {
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw upstream('Le service OAuth de Google est injoignable. Réessaie dans un instant.');
  }
  const result = tokenResponse.safeParse(await response.json().catch(() => null));
  if (response.ok && result.data?.access_token) return result.data.access_token;
  if (result.data?.error === 'invalid_grant') {
    throw upstream(
      'Autorisation Gmail expirée ou révoquée. Enregistre un nouveau jeton de renouvellement.',
    );
  }
  if (result.data?.error === 'invalid_client' || result.data?.error === 'unauthorized_client') {
    throw upstream(
      'Client OAuth Gmail refusé. Vérifie son identifiant, son secret et le projet Google Cloud.',
    );
  }
  throw upstream(`Échec du renouvellement OAuth Gmail (HTTP ${response.status}).`);
};
