import cron from 'node-cron';
import type { Container } from '../../container.ts';

/**
 * Planifie la collecte périodique.
 *
 * Un verrou en mémoire empêche deux collectes de se chevaucher : un rattrapage de
 * deux ans sur plusieurs chaînes peut dépasser l'heure entre deux déclenchements.
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
