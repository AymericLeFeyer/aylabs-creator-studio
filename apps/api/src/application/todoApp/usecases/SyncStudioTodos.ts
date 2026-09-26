import type { IsoDate } from '../../../shared/dates.ts';
import { addDays, todayIn } from '../../../shared/dates.ts';
import type {
  NewTodoTask,
  TodoLink,
  TodoLinkRepository,
  TodoTaskSource,
} from '../../../domain/todoApp/repositories/TodoRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import type { LegalObligationRepository } from '../../../domain/legal/repositories/LegalRepository.ts';
import type { LegalMonthItem } from '../../../domain/legal/entities/LegalOverview.ts';
import type { GetLegalOverview } from '../../legal/usecases/GetLegalOverview.ts';
import type { ManageTodoTasks } from './ManageTodoTasks.ts';

export interface SyncStudioTodosResult {
  connected: boolean;
  created: number;
  /** Cases légales mises d'accord (dans un sens ou dans l'autre). */
  synced: number;
  errors: string[];
}

const RELEASE_PREFIX = 'release:';
const LEGAL_PREFIX = 'legal:';

const legalKey = (obligationId: string, month: string) => `${LEGAL_PREFIX}${obligationId}:${month}`;

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/**
 * Ce que le studio pose **tout seul** dans l'app Todo :
 *
 * 1. **Le jour d'une sortie**, « Surveiller la sortie de « X » » — pour chaque vidéo dont
 *    la sortie visée (`plannedDate`) tombe aujourd'hui, et pour chaque vidéo collectée
 *    aujourd'hui sans fiche de production.
 * 2. **Chaque case à faire du tableau légal** : celles du mois en cours, et celles du
 *    mois précédent encore en retard. Ces tâches-là sont **synchronisées dans les deux
 *    sens** : cocher dans Todo coche la case, cocher la case termine la tâche.
 *
 * Trois règles :
 *
 * - **Une tâche n'est posée qu'une fois.** `todo_links` retient ce qui a été créé, et la
 *   ligne ne disparaît jamais : une tâche supprimée à la main dans Todo ne revient pas.
 *   L'`externalId` (`acs:<clé>`) couvre en plus le POST rejoué — Todo rend la tâche
 *   existante au lieu d'en créer une seconde.
 * - **Le dernier état commun décide du sens.** `link.done` est l'état sur lequel les deux
 *   côtés étaient d'accord ; celui qui s'en écarte a bougé, l'autre suit. Sans cette
 *   mémoire, une tâche rouverte dans Todo serait refermée par la case cochée, ou l'inverse.
 * - **« Aujourd'hui » est celui de l'utilisateur** (`APP_TIMEZONE`), pas celui du serveur
 *   en UTC : aucun navigateur n'est là pour le donner, contrairement au planning.
 *
 * Tourne à chaque passage du cron et au démarrage. Une Todo injoignable ne fait rien
 * échouer d'autre : elle est rattrapée au passage suivant.
 */
export class SyncStudioTodos {
  private readonly todoTasks: ManageTodoTasks;
  private readonly links: TodoLinkRepository;
  private readonly productions: ProductionRepository;
  private readonly videos: VideoRepository;
  private readonly legalOverview: GetLegalOverview;
  private readonly legalObligations: LegalObligationRepository;
  private readonly timeZone: string;
  private running = false;

  constructor(deps: {
    todoTasks: ManageTodoTasks;
    links: TodoLinkRepository;
    productions: ProductionRepository;
    videos: VideoRepository;
    legalOverview: GetLegalOverview;
    legalObligations: LegalObligationRepository;
    timeZone: string;
  }) {
    this.todoTasks = deps.todoTasks;
    this.links = deps.links;
    this.productions = deps.productions;
    this.videos = deps.videos;
    this.legalOverview = deps.legalOverview;
    this.legalObligations = deps.legalObligations;
    this.timeZone = deps.timeZone;
  }

  async run(): Promise<SyncStudioTodosResult> {
    const result: SyncStudioTodosResult = { connected: false, created: 0, synced: 0, errors: [] };
    const client = this.todoTasks.client();
    if (!client || this.running) return { ...result, connected: client !== null };
    result.connected = true;
    this.running = true;
    try {
      const today = todayIn(this.timeZone);
      // Isolées : une sortie qui échoue ne doit pas empêcher le tableau légal, ni l'inverse.
      try {
        result.created += await this.releases(client, today);
      } catch (error) {
        result.errors.push(`sorties : ${message(error)}`);
      }
      try {
        const legal = await this.legal(client, today);
        result.created += legal.created;
        result.synced += legal.synced;
      } catch (error) {
        result.errors.push(`légal : ${message(error)}`);
      }
    } finally {
      this.running = false;
    }
    return result;
  }

  /**
   * Une case vient d'être cochée ou décochée dans le studio : la tâche suit **tout de
   * suite**, sans attendre le cron. L'échec est avalé — la synchro suivante rattrapera,
   * puisque `link.done` n'aura pas bougé.
   */
  async legalChanged(obligationId: string, month: string, checked: boolean): Promise<void> {
    const link = this.links.find(legalKey(obligationId, month));
    const client = this.todoTasks.client();
    if (!link || !client || link.done === checked) return;
    try {
      if (checked) await client.complete(link.taskId);
      else await client.uncomplete(link.taskId);
      this.links.save({ ...link, done: checked });
    } catch (error) {
      // 404 : la tâche a été supprimée dans Todo, il n'y a plus rien à suivre.
      console.warn(`[todo] case légale ${obligationId} ${month} : ${message(error)}`);
    }
  }

  // --- Sorties ---------------------------------------------------------------

  private async releases(client: TodoTaskSource, today: IsoDate): Promise<number> {
    let created = 0;
    const range = { from: today, to: today };

    for (const production of this.productions.findAll({ range })) {
      if (!production.plannedDate) continue;
      created += await this.createOnce(client, `${RELEASE_PREFIX}production:${production.id}`, {
        title: `Surveiller la sortie de « ${production.title} »`,
        notes: production.channelName ? `Chaîne : ${production.channelName}` : null,
        dueDate: production.plannedDate,
        duration: 15,
      });
    }

    // Les sorties sans fiche de production : tout l'historique importé de YouTube, et ce
    // qu'on publie sans passer par l'outil. Une vidéo déjà rattachée à une production est
    // couverte par la clé de la production, jamais deux fois.
    const claimed = new Set(
      this.productions
        .findAll()
        .map((production) => production.videoId)
        .filter(Boolean),
    );
    for (const video of this.videos.findAllWithChannel({ range })) {
      if (claimed.has(video.id)) continue;
      created += await this.createOnce(client, `${RELEASE_PREFIX}video:${video.id}`, {
        title: `Surveiller la sortie de « ${video.title} »`,
        notes: video.channelName ? `Chaîne : ${video.channelName}` : null,
        dueDate: video.date,
        duration: 15,
      });
    }
    return created;
  }

  // --- Légal -----------------------------------------------------------------

  private async legal(
    client: TodoTaskSource,
    today: IsoDate,
  ): Promise<{ created: number; synced: number }> {
    const overview = this.legalOverview.execute();
    const items = new Map<string, LegalMonthItem & { month: string }>();
    for (const month of overview.months) {
      for (const item of month.items)
        items.set(legalKey(item.obligationId, month.month), { ...item, month: month.month });
    }

    // D'abord les tâches déjà posées : mettre les deux côtés d'accord.
    let synced = 0;
    for (const link of this.links.findByPrefix(LEGAL_PREFIX)) {
      const item = items.get(link.key);
      if (!item) continue; // obligation supprimée ou archivée : plus rien à suivre
      if (await this.reconcile(client, link, item)) synced += 1;
    }

    // Puis ce qui reste à faire et n'a pas encore sa tâche.
    const current = today.slice(0, 7);
    const previous = addDays(`${current}-01`, -1).slice(0, 7);
    let created = 0;
    for (const [key, item] of items) {
      if (item.checked) continue;
      const wanted = item.month === current || (item.month === previous && item.status === 'late');
      if (!wanted) continue;
      const obligation = overview.obligations.find((entry) => entry.id === item.obligationId);
      created += await this.createOnce(client, key, {
        title: `${item.label} (${monthLabel(item.month)})`,
        notes: [
          obligation?.notes,
          'Posée par Creator Studio : la cocher coche la case du tableau légal.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        dueDate: item.dueDate,
        duration: null,
      });
    }
    return { created, synced };
  }

  /** Aligne une case et sa tâche. `true` si l'un des deux côtés a été modifié. */
  private async reconcile(
    client: TodoTaskSource,
    link: TodoLink,
    item: LegalMonthItem & { month: string },
  ): Promise<boolean> {
    const task = await client.getTask(link.taskId);
    if (!task) return false; // supprimée dans Todo : la case vit sa vie
    const todoDone = task.completedAt !== null;
    const studioDone = item.checked;
    if (todoDone === studioDone) {
      if (link.done !== todoDone) this.links.save({ ...link, done: todoDone });
      return false;
    }
    if (todoDone !== link.done) {
      // Todo a bougé : la case suit.
      if (todoDone) this.legalObligations.check(item.obligationId, item.month);
      else this.legalObligations.uncheck(item.obligationId, item.month);
      this.links.save({ ...link, done: todoDone });
    } else {
      // Le studio a bougé (et l'envoi immédiat avait échoué) : la tâche suit.
      if (studioDone) await client.complete(link.taskId);
      else await client.uncomplete(link.taskId);
      this.links.save({ ...link, done: studioDone });
    }
    return true;
  }

  // --- Commun ----------------------------------------------------------------

  /** Pose la tâche si la clé n'a jamais servi. `1` si elle vient d'être créée. */
  private async createOnce(
    client: TodoTaskSource,
    key: string,
    task: Omit<NewTodoTask, 'externalId' | 'tags'>,
  ): Promise<number> {
    if (this.links.find(key)) return 0;
    // Le premier tag de la connexion : c'est lui qui fait apparaître la tâche dans le
    // planning quand celui-ci filtre les tâches Todo par tag.
    const tags = this.todoTasks.tags().slice(0, 1);
    const created = await client.createTask({ ...task, tags, externalId: `acs:${key}` });
    this.links.save({ key, taskId: created.id, done: created.completedAt !== null });
    return 1;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
