import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { upstream } from '../../../shared/errors.ts';
import type { YouTubePrivacy } from '../../../domain/publish/entities/Publish.ts';
import type { AnalyticsCredentials } from './YouTubeAnalyticsClient.ts';

export interface YouTubeUploadInput {
  filePath: string;
  mimeType: string;
  title: string;
  description: string;
  tags: string[];
  privacy: YouTubePrivacy;
}

/**
 * Mise en ligne d'une vidéo par `videos.insert`, avec le refresh token **de la chaîne**.
 *
 * Trois choses à savoir, qu'aucun code ne contourne :
 *
 * - il faut le scope `https://www.googleapis.com/auth/youtube.upload` sur le token : les
 *   tokens générés pour la collecte ne l'ont pas, il faut les **régénérer** (même client
 *   OAuth, même piège : choisir la chaîne de marque à l'écran de consentement) ;
 * - un projet GCP **non audité** voit toute vidéo envoyée par l'API **forcée en privé**,
 *   quel que soit `privacyStatus` — on teste en privé de toute façon ;
 * - un envoi coûte environ **1 600 unités** de quota sur 10 000 par jour.
 *
 * Un Short n'a pas de drapeau dans l'API : une vidéo verticale de 3 min au plus en est un.
 */
export class YouTubeUploadClient {
  private readonly credentials: AnalyticsCredentials;

  constructor(credentials: AnalyticsCredentials) {
    this.credentials = credentials;
  }

  async upload(input: YouTubeUploadInput): Promise<{ videoId: string }> {
    const auth = new google.auth.OAuth2(this.credentials.clientId, this.credentials.clientSecret);
    auth.setCredentials({ refresh_token: this.credentials.refreshToken });
    const youtube = google.youtube({ version: 'v3', auth });

    try {
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        notifySubscribers: false,
        requestBody: {
          snippet: {
            title: input.title,
            description: input.description,
            tags: input.tags.length > 0 ? input.tags : undefined,
          },
          status: { privacyStatus: input.privacy, selfDeclaredMadeForKids: false },
        },
        media: { mimeType: input.mimeType, body: createReadStream(input.filePath) },
      });
      const videoId = response.data.id;
      if (!videoId) throw upstream('YouTube n’a renvoyé aucun identifiant de vidéo');
      return { videoId };
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(describeUploadError(error));
    }
  }
}

const describeUploadError = (error: unknown): string => {
  const anyError = error as {
    response?: {
      data?: {
        error?: string | { message?: string; errors?: Array<{ reason?: string }> };
        error_description?: string;
      };
    };
    message?: string;
  };
  const data = anyError?.response?.data;
  const apiError = data?.error && typeof data.error === 'object' ? data.error : null;
  const reason = apiError?.errors?.[0]?.reason;
  const message =
    apiError?.message ??
    (typeof data?.error === 'string'
      ? `${data.error}${data.error_description ? ` (${data.error_description})` : ''}`
      : (anyError?.message ?? 'erreur inconnue'));

  // La panne attendue au premier essai : le token de collecte n'a pas le droit d'envoyer.
  if (
    reason === 'insufficientPermissions' ||
    /insufficient (authentication )?scopes?|insufficient permission/i.test(message)
  ) {
    return (
      'Le refresh token de cette chaîne n’a pas le scope youtube.upload. Régénère-le en ' +
      'ajoutant https://www.googleapis.com/auth/youtube.upload, puis colle-le dans ' +
      'Paramètres → YouTube.'
    );
  }
  if (reason === 'quotaExceeded')
    return 'Quota YouTube épuisé pour aujourd’hui (≈ 1 600 unités par envoi).';
  if (reason === 'uploadLimitExceeded')
    return 'La chaîne a atteint sa limite d’envois pour aujourd’hui.';
  return `YouTube (envoi) : ${message}`;
};
