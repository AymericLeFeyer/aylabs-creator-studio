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

  /** Les tâches posées dans l'app Todo. Rien à faire tant que Todo n'est pas connecté. */
  const syncTodos = async (): Promise<void> => {
    try {
      const result = await container.syncStudioTodos.run();
      if (result.created > 0) console.log(`[todo] ${result.created} tâche(s) posée(s) dans Todo`);
      if (result.synced > 0)
        console.log(`[todo] ${result.synced} case(s) légale(s) synchronisée(s)`);
      for (const error of result.errors) console.warn(`[todo] ${error}`);
    } catch (error) {
      console.error('[todo] synchro interrompue :', error);
    }
  };

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

      try {
        // **Après** les métriques, jamais avant : les vidéos viennent d'être collectées,
        // et c'est ce qui permet aux commentaires du jour de se rattacher à leur sortie
        // du premier coup plutôt qu'au passage suivant.
        //
        // L'échec est avalé, comme celui d'Instagram : les métriques sont déjà écrites, et
        // les commentaires se rattrapent au passage suivant — la pagination antéchronologique
        // remonte largement au-delà d'une journée manquée, contrairement aux stories.
        const comments = await container.collectComments.collectAll();
        const created = comments.reduce((total, result) => total + result.created, 0);
        if (created > 0) console.log(`[cron] ${created} nouveau(x) commentaire(s) à trier`);
        for (const result of comments.filter((r) => r.status === 'error')) {
          console.warn(`[cron]   commentaires ${result.channelName} : ${result.message}`);
        }
      } catch (error) {
        console.error('[cron] collecte des commentaires interrompue :', error);
      }

      try {
        // En dernier : Amazon et Domadoo ouvrent un navigateur et prennent chacun une
        // vingtaine de secondes, ils n'ont pas à retarder ce qui alimente les écrans.
        // YouTube n'y figure pas — l'export le relit depuis la base. Instagram y figure pour
        // son seul profil public, relevé une fois par jour (le premier passage réussi du
        // jour ; les suivants sont sautés).
        const integrations = await container.collectIntegrations.collectAll();
        for (const result of integrations) {
          if (result.status === 'ok') console.log(`[cron]   export ${result.provider} à jour`);
          if (result.status === 'error') {
            console.warn(`[cron]   export ${result.provider} : ${result.message}`);
          }
        }
      } catch (error) {
        console.error('[cron] collecte des sources de l’export interrompue :', error);
      }

      // Après la collecte : les vidéos du jour viennent d'être écrites.
      await syncTodos();
    } catch (error) {
      console.error('[cron] collecte interrompue :', error);
    } finally {
      running = false;
    }
  };

  cron.schedule(collectCron, () => void run('planifiée'));
  console.log(`[cron] collecte planifiée (${collectCron})`);

  // Le relevé des ventes Domadoo en attente se pagine et ne bouge pas d'une heure à
  // l'autre : une fois par nuit suffit. Hors du verrou horaire (il a le sien, dans
  // `CollectIntegrations`) et décalé de la demi-heure pour ne pas tomber sur 3 h pile.
  cron.schedule('30 3 * * *', () => {
    void container.collectIntegrations
      .collectDomadooSales()
      .then((result) => {
        if (result.status === 'error') console.warn(`[cron] ventes Domadoo : ${result.message}`);
      })
      .catch((error: unknown) => console.error('[cron] ventes Domadoo interrompues :', error));
  });

  if (collectAtStartup) {
    void run('au démarrage');
  } else {
    // Sans collecte au démarrage, la synchro Todo tourne quand même : elle ne coûte rien.
    void syncTodos();
  }
};
