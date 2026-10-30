import { badRequest, conflict, notFound } from '../../../shared/errors.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import type { DiscordAnnouncer } from '../../../domain/production/repositories/DiscordAnnouncer.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import { buildDiscordAnnouncement } from '../../../domain/production/services/discordAnnouncement.ts';
import type { ManageIntegrations } from '../../integration/usecases/ManageIntegrations.ts';

/**
 * Annonce une sortie sur le Discord. Une seule fois : `discordAnnouncedAt` n'est posé
 * qu'après la réponse de Discord, si bien qu'un échec laisse le bouton disponible, et un
 * second envoi est refusé en 409 — une annonce publiée ne se retire pas d'ici.
 */
export class AnnounceOnDiscord {
  private readonly productions: ProductionRepository;
  private readonly integrations: ManageIntegrations;
  private readonly announcer: DiscordAnnouncer;

  constructor(
    productions: ProductionRepository,
    integrations: ManageIntegrations,
    announcer: DiscordAnnouncer,
  ) {
    this.productions = productions;
    this.integrations = integrations;
    this.announcer = announcer;
  }

  async execute(productionId: string, publicDate: IsoDate): Promise<Production> {
    const production = this.productions.findViewById(productionId);
    if (!production) throw notFound('Vidéo');
    if (!production.videoExternalId) {
      throw badRequest('Rattache d’abord la sortie YouTube de cette vidéo.');
    }
    if (production.discordAnnouncedAt) throw conflict('Cette vidéo a déjà été annoncée.');

    const { botToken, announceChannelId, announceRoleId } =
      this.integrations.resolve('discord').values;
    if (!botToken || !announceChannelId || !announceRoleId) {
      throw badRequest(
        'Renseigne le jeton du bot, le salon et le rôle dans Paramètres → Audience → Discord.',
      );
    }

    await this.announcer.announce(
      { botToken, channelId: announceChannelId },
      buildDiscordAnnouncement({
        title: production.videoTitle ?? production.title,
        externalId: production.videoExternalId,
        publicDate,
        roleId: announceRoleId,
      }),
    );

    return this.productions.markDiscordAnnounced(productionId);
  }
}
