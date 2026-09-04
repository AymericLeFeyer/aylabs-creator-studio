import cron from 'node-cron';
import type { Container } from '../../container.ts';

/**
 * Planifie la collecte périodique — YouTube **et** Instagram.
 *
 * Un verrou en mémoire empêche deux collectes de se chevaucher : un rattrapage de
 * deux ans sur plusieurs chaînes peut dépasser l'heure entre deux déclenchements.
 *
 * **Instagram passe en premier, et son échec n'arrête pas YouTube.** Les stories
 * n'existent dans l'API que pendant 24 heures : une journée manquée est perdue pour
 * toujours, alors qu'une collecte YouTube ratée se rattrape au passage suivant. La
 * priorité va donc à ce qui ne se rattrape pas.
 *
 * C'est aussi ce qui rend le rythme horaire indispensable côté Instagram, là où il n'est
 * qu'un confort côté YouTube.
 */
export const startCollectScheduler = (container: Container): void => {
  const { collectCron, collectAtStartup } = container.config;

  if (!cron.validate(collectCron)) {
    console.error(`[cron] expression invalide (${collectCron}), collecte automatique désactivée`);
    return;
  }

  let running = false;

  const run = async (trigger: string): Promise<void> => {
    if (running) {
      console.warn(`[cron] collecte déjà en cours, déclenchement ${trigger} ignoré`);
      return;
    }
    running = true;
    try {
      try {
        const instagram = await container.collectInstagram.collectAll();
        for (const account of instagram) {
          console.log(
            `[cron]   @${account.username} : ${account.storiesFound} story(s), ` +
              `${account.mediaUpserted} publication(s)`,
          );
          if (account.error) console.warn(`[cron]   @${account.username} : ${account.error}`);
        }
      } catch (error) {
        // Avalé : une panne côté Meta ne doit pas empêcher la collecte YouTube, qui n'a
        // rien à voir avec elle.
        console.error('[cron] collecte Instagram interrompue :', error);
      }

      const results = await container.collectMetrics.collectAll();
      const ok = results.filter((r) => r.status === 'ok').length;
      const errors = results.filter((r) => r.status === 'error');
      console.log(`[cron] collecte ${trigger} : ${ok}/${results.length} chaînes à jour`);
      for (const error of errors) {
        console.error(`[cron]   ${error.channelName} : ${error.message}`);
      }
    } catch (error) {
      console.error('[cron] collecte interrompue :', error);
    } finally {
      running = false;
    }
  };

  cron.schedule(collectCron, () => void run('planifiée'));
  console.log(`[cron] collecte planifiée (${collectCron})`);

  if (collectAtStartup) {
    void run('au démarrage');
  }
};
