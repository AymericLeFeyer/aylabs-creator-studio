import type { DiscordAnnouncement } from '../services/discordAnnouncement.ts';

/** Publie une annonce dans un salon forum Discord, au nom du bot. */
export interface DiscordAnnouncer {
  announce(
    credentials: { botToken: string; channelId: string },
    announcement: DiscordAnnouncement,
  ): Promise<void>;
}
