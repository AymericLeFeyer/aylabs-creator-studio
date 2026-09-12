import type { DiscordExport } from '../../../domain/integration/entities/ExportData.ts';
import { upstream } from '../../../shared/errors.ts';

interface InviteResponse {
  guild?: { name?: string };
  profile?: { name?: string; member_count?: number; online_count?: number };
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

/**
 * Les compteurs d'un serveur Discord, lus depuis une **invitation**.
 *
 * Aucun bot ni jeton : `GET /invites/<code>?with_counts=true` est public et renvoie
 * membres et présents. C'est aussi sa limite — une invitation expirée ou révoquée coupe
 * la source, d'où l'intérêt d'en créer une sans expiration.
 *
 * `profile` n'existe que sur les serveurs qui ont un profil public ; les champs
 * `approximate_*` sont le repli standard.
 */
export class DiscordClient {
  async fetch(inviteCode: string): Promise<DiscordExport> {
    const code = inviteCode
      .trim()
      .replace(/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//, '');
    const response = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    );
    if (response.status === 404) {
      throw upstream(
        'Invitation Discord inconnue ou expirée : crée une invitation sans expiration.',
      );
    }
    if (!response.ok) throw upstream(`Discord a répondu ${response.status}`);

    const data = (await response.json()) as InviteResponse;
    return {
      name: data.profile?.name ?? data.guild?.name ?? '',
      members: data.profile?.member_count ?? data.approximate_member_count ?? null,
      members_online: data.profile?.online_count ?? data.approximate_presence_count ?? null,
    };
  }
}
