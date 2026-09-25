import type { TikTokPublicProfile } from '../../../domain/tiktok/entities/TikTokAccount.ts';
import type { TikTokProfileSink } from '../../../domain/integration/repositories/IntegrationCollectors.ts';
import type {
  TikTokAccountRepository,
  TikTokDataRepository,
} from '../../../domain/tiktok/repositories/TikTokRepository.ts';
import { today } from '../../../shared/dates.ts';
import { badRequest } from '../../../shared/errors.ts';

const localDateOf = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * Écrit le relevé d'un profil TikTok dans les tables du module — même rôle que
 * `CollectInstagram.recordPublicProfile` avant le passage à l'API Graph.
 *
 * Rien d'autre que le profil public n'existe pour TikTok : pas de jeton, pas de
 * distinction entre un compte "connecté" et un compte "public", donc un seul chemin.
 */
export class CollectTikTok implements TikTokProfileSink {
  private readonly accounts: TikTokAccountRepository;
  private readonly data: TikTokDataRepository;

  constructor(accounts: TikTokAccountRepository, data: TikTokDataRepository) {
    this.accounts = accounts;
    this.data = data;
  }

  /**
   * Le compte est créé au premier passage, retrouvé ensuite **par son nom
   * d'utilisateur** (`COLLATE NOCASE`) : c'est la seule clé stable, TikTok n'a pas
   * d'identifiant numérique lisible depuis la page publique.
   */
  recordPublicProfile(profile: TikTokPublicProfile): { accountId: string; username: string } {
    const existing = this.accounts.findByUsername(profile.username);
    if (existing?.isArchived) {
      throw badRequest(
        `@${existing.username} est archivé : réactive-le dans Paramètres → TikTok pour reprendre son suivi.`,
      );
    }

    const account =
      existing ?? this.accounts.create({ username: profile.username, name: profile.fullName });

    this.data.upsertSnapshot({
      accountId: account.id,
      date: today(),
      followersCount: profile.followers,
      followingCount: profile.following,
      heartCount: profile.hearts,
      videoCount: profile.videoCount,
    });

    for (const video of profile.recentVideos) {
      this.data.upsertVideo({
        accountId: account.id,
        videoId: video.id,
        description: video.description,
        permalink: video.permalink,
        thumbnailUrl: video.thumbnailUrl,
        postedAt: video.postedAt,
        date: localDateOf(video.postedAt),
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: video.shares,
      });
    }

    this.accounts.update(account.id, {
      username: profile.username,
      name: profile.fullName ?? account.name,
      profilePicture: profile.profilePicture ?? account.profilePicture,
      lastCollectedAt: new Date().toISOString(),
    });

    return { accountId: account.id, username: profile.username };
  }
}
