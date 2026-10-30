import type { IsoDate } from '../../../shared/dates.ts';

/** Ce que l'annonce d'une sortie publie : un post de forum Discord. */
export interface DiscordAnnouncement {
  /** Titre du post. Discord refuse au-delà de 100 caractères. */
  name: string;
  content: string;
  imageUrl: string;
}

const DISCORD_THREAD_NAME_MAX = 100;

/** Le jour en toutes lettres : `2026-11-03` → « mardi 3 novembre ». */
export const formatAnnouncementDate = (date: IsoDate): string =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/**
 * Le message d'annonce : la vidéo est déjà visible par les membres (le rôle mentionné),
 * et `publicDate` est le jour où elle l'est pour tout le monde.
 *
 * La miniature se déduit du code de la vidéo : pas d'appel à YouTube ni de quota, et ça
 * marche aussi sur une sortie encore non listée.
 */
export const buildDiscordAnnouncement = (input: {
  title: string;
  externalId: string;
  publicDate: IsoDate;
  roleId: string;
}): DiscordAnnouncement => ({
  name: input.title.slice(0, DISCORD_THREAD_NAME_MAX),
  content:
    `https://www.youtube.com/watch?v=${input.externalId}\n` +
    `Disponible dès maintenant pour les <@&${input.roleId}>, ` +
    `et le **${formatAnnouncementDate(input.publicDate)}** pour tous !`,
  imageUrl: `https://i.ytimg.com/vi/${input.externalId}/maxresdefault.jpg`,
});
