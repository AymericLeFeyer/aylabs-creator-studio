import type { IsoDate } from '../../../shared/dates.ts';
import { addDays, today } from '../../../shared/dates.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';
import type {
  CalendarEvent,
  CalendarRef,
} from '../../../domain/planning/entities/CalendarEvent.ts';
import type {
  PlanningBoard,
  PlanningDay,
  PlanningProductionSpan,
} from '../../../domain/planning/entities/PlanningBoard.ts';
import type { PlanningItemView } from '../../../domain/planning/entities/PlanningItem.ts';
import type { PlanningSettingsView } from '../../../domain/planning/entities/PlanningSettings.ts';
import { toMinutes, toTime } from '../../../domain/planning/entities/WorkHours.ts';
import type {
  PlanningItemRepository,
  PlanningSettingsRepository,
  WorkHoursRepository,
} from '../../../domain/planning/repositories/PlanningRepository.ts';
import {
  schedule,
  weekdayOf,
  type BusyBlock,
  type Interval,
  type PlanTask,
} from '../../../domain/planning/services/scheduler.ts';
import type { TimeEntry, TimeEntryView } from '../../../domain/production/entities/TimeEntry.ts';
import type { ProductionSlotView } from '../../../domain/production/entities/ProductionSlot.ts';
import { slotMinutes } from '../../../domain/production/entities/ProductionSlot.ts';
import type {
  ProductionRepository,
  ProductionSlotRepository,
  ProductionStepRepository,
} from '../../../domain/production/repositories/ProductionRepository.ts';
import type { SqliteTodoRepository } from '../../../infrastructure/production/repositories/SqliteTodoRepository.ts';
import type { HomeAssistantClient } from '../../../infrastructure/planning/api/HomeAssistantClient.ts';
import type { TrackTime } from '../../production/usecases/TrackTime.ts';
import type { ManageTodos } from '../../production/usecases/ManageTodos.ts';

/** Durée retenue quand ni la tâche ni son étape n'en donnent une. */
const FALLBACK_MINUTES = 60;

/**
 * Du travail que l'on vient de mesurer et qui **peut être déclaré terminé**.
 *
 * Rendu par `stopTimer` pour que l'écran sache s'il a une question à poser. `null` quand
 * la session ne couvrait aucune ligne de pile — un chronomètre lancé depuis une fiche de
 * vidéo, par exemple : il n'y a alors rien à fermer, et demander « as-tu terminé ? »
 * n'aurait aucun objet.
 */
export interface CompletableWork {
  itemId: string;
  productionId: string;
  /** La tâche à cocher. `null` quand la ligne couvre l'étape entière. */
  todoId: string | null;
  /** L'étape à cocher, quand il n'y a pas de tâche plus fine à viser. */
  stepId: string | null;
  label: string;
}

/** Ce que la sélection de l'écran « ajouter une vidéo » envoie. */
export interface PlanTargetInput {
  productionId: string;
  /** Étapes entières à planifier : chacune amène ses tâches non cochées. */
  stepIds: string[];
  /** Tâches choisies une à une, en plus ou à la place des étapes. */
  todoIds: string[];
}

/**
 * Comment le moteur a le droit d'intervenir.
 *
 * - `incremental` — **il ne déplace rien**. Les créneaux déjà posés valent occupation, et
 *   seules les minutes qu'aucun d'eux ne couvre reçoivent une place. C'est le mode de tout
 *   ce qui se déclenche tout seul : ajouter une vidéo, approuver, arrêter un chronomètre.
 * - `full` — la table rase : les suggestions déplaçables sont effacées et tout est reposé.
 *   **Réservé au bouton « Repositionner »**, parce que c'est le seul moment où
 *   l'utilisateur a demandé que sa journée soit réécrite.
 *
 * La distinction n'est pas cosmétique : un replan complet déclenché par une suppression
 * de ligne réécrivait toute la journée sans qu'on l'ait demandé, et — faute de recevoir
 * l'heure qu'il est — reposait des créneaux à des heures déjà passées.
 */
export type ReplanMode = 'incremental' | 'full';

export interface ReplanOptions {
  mode?: ReplanMode;
  /** Premier jour ouvert au moteur. Par défaut aujourd'hui. */
  from?: IsoDate;
  /**
   * Ne replanifier qu'un seul jour : le bouton « réorganiser » d'une colonne.
   * Les créneaux des autres jours ne bougent alors pas d'un pouce.
   */
  onlyDate?: IsoDate;
  /**
   * Le jour qu'il est **pour le navigateur**. Il ne se déduit pas de `from` : un
   * placement peut repartir d'une date passée — matérialiser une session d'hier, arrêter
   * un chronomètre lancé la veille — sans pour autant autoriser à poser du travail hier.
   */
  nowDate?: IsoDate;
  /** Heure locale du navigateur, en minutes depuis minuit. */
  nowMinutes?: number;
}

/**
 * Le planning : décider où poser le travail qui reste, et tenir la trace de ce qui a
 * réellement été fait.
 *
 * **Ce use case possède toutes les écritures du module.** Les routes ne touchent ni la
 * pile, ni les créneaux planifiés, ni l'agenda : approuver un créneau crée une session
 * de travail, ferme éventuellement une ligne de pile, publie dans l'agenda et peut
 * reposer un créneau ailleurs. Quatre effets pour un clic — les éparpiller dans des
 * routes en ferait oublier un.
 *
 * Trois règles gouvernent tout le reste :
 *
 * 1. **Les suggestions vivent ici, l'agenda ne reçoit que l'approuvé.** Home Assistant
 *    sait créer un événement, pas le modifier ni le supprimer : pousser une suggestion
 *    laisserait au premier replan une traînée de fantômes qu'on ne pourrait plus
 *    retirer.
 * 2. **Un créneau approuvé ou posé à la main ne bouge jamais.** Le moteur ne réécrit que
 *    `origin = 'planner' AND done = 0`.
 * 3. **Approuver ne veut pas dire terminer.** On confirme le temps passé ; si le travail
 *    continue, un créneau de même durée est reposé, et la ligne reste dans la pile.
 */
export class ManagePlanning {
  private readonly items: PlanningItemRepository;
  private readonly workHours: WorkHoursRepository;
  private readonly settings: PlanningSettingsRepository;
  private readonly slots: ProductionSlotRepository;
  private readonly productions: ProductionRepository;
  private readonly steps: ProductionStepRepository;
  private readonly todos: SqliteTodoRepository;
  private readonly manageTodos: ManageTodos;
  private readonly trackTime: TrackTime;
  private readonly makeClient: (baseUrl: string, token: string) => HomeAssistantClient;

  constructor(
    items: PlanningItemRepository,
    workHours: WorkHoursRepository,
    settings: PlanningSettingsRepository,
    slots: ProductionSlotRepository,
    productions: ProductionRepository,
    steps: ProductionStepRepository,
    todos: SqliteTodoRepository,
    manageTodos: ManageTodos,
    trackTime: TrackTime,
    makeClient: (baseUrl: string, token: string) => HomeAssistantClient,
  ) {
    this.items = items;
    this.workHours = workHours;
    this.settings = settings;
    this.slots = slots;
    this.productions = productions;
    this.steps = steps;
    this.todos = todos;
    this.manageTodos = manageTodos;
    this.trackTime = trackTime;
    this.makeClient = makeClient;
  }

  // --- Réglages -------------------------------------------------------------

  /** Les réglages **sans le jeton** : il ne sort jamais de l'API. */
  settingsView(): PlanningSettingsView {
    return { ...this.settings.get(), hasToken: this.settings.token() !== null };
  }

  private client(): HomeAssistantClient | null {
    const config = this.settings.get();
    const token = this.settings.token();
    if (!config.calendarBaseUrl || !token) return null;
    return this.makeClient(config.calendarBaseUrl, token);
  }

  /** Les calendriers de l'instance, pour le sélecteur des réglages. */
  async listCalendars(): Promise<CalendarRef[]> {
    const client = this.client();
    if (!client) {
      throw badRequest("Renseigne d'abord l'adresse de Home Assistant et un jeton d'accès.");
    }
    return client.listCalendars();
  }

  // --- La pile de travail ---------------------------------------------------

  /**
   * Met des étapes et des tâches dans la pile, puis replanifie.
   *
   * Cocher « Écriture » dépose **une ligne par tâche non cochée** de cette étape, et non
   * une ligne pour l'étape : c'est ce qui donne les cinq créneaux attendus plutôt qu'un
   * bloc opaque de trois heures. Une étape sans aucune tâche, elle, entre entière — il
   * n'y a rien de plus fin à viser.
   *
   * Ce qui est **déjà coché** n'entre pas : replanifier du travail terminé remplirait
   * l'agenda de séances sans objet.
   */
  async addTargets(
    input: PlanTargetInput,
    options: ReplanOptions = {},
  ): Promise<PlanningItemView[]> {
    const production = this.productions.findById(input.productionId);
    if (!production) throw notFound('Vidéo');

    const steps = this.steps.findAll(true);
    const todos = this.todos.listForProduction(input.productionId);

    const wantedSteps = new Set(input.stepIds);
    const wantedTodos = new Set(input.todoIds);
    if (wantedSteps.size === 0 && wantedTodos.size === 0) {
      throw badRequest('Choisis au moins une étape ou une tâche à planifier.');
    }

    let sequence = this.items.nextSequence();

    // L'ordre d'insertion suit celui des étapes, puis celui des tâches : c'est l'ordre
    // dans lequel le travail se fait, et le moteur le respectera à la lettre.
    for (const step of steps) {
      const stepTodos = todos.filter((todo) => todo.stepId === step.id);
      const selected = stepTodos.filter(
        (todo) => !todo.checked && (wantedSteps.has(step.id) || wantedTodos.has(todo.id)),
      );

      for (const todo of selected) {
        this.items.create({
          productionId: input.productionId,
          stepId: step.id,
          todoId: todo.id,
          label: `${step.name} · ${todo.label}`,
          plannedMinutes: todo.defaultMinutes ?? step.defaultMinutes ?? FALLBACK_MINUTES,
          sequence: sequence++,
        });
      }

      // Une étape sans tâche se planifie entière : il n'y a rien de plus fin à viser.
      if (wantedSteps.has(step.id) && stepTodos.length === 0) {
        this.items.create({
          productionId: input.productionId,
          stepId: step.id,
          todoId: null,
          label: step.name,
          plannedMinutes: step.defaultMinutes ?? FALLBACK_MINUTES,
          sequence: sequence++,
        });
      }
    }

    // Une tâche ponctuelle rangée sous aucune étape ne serait vue par aucune boucle.
    for (const todo of todos) {
      if (todo.checked || todo.stepId !== null || !wantedTodos.has(todo.id)) continue;
      this.items.create({
        productionId: input.productionId,
        stepId: null,
        todoId: todo.id,
        label: todo.label,
        plannedMinutes: todo.defaultMinutes ?? FALLBACK_MINUTES,
        sequence: sequence++,
      });
    }

    // Incrémental : la nouvelle vidéo reçoit ses créneaux, celles qui étaient déjà calées
    // ne bougent pas d'un pouce. Réécrire toute la journée à chaque ajout déplaçait ce
    // qu'on venait de caler à la main.
    await this.replan({ ...options, mode: 'incremental' });
    return this.items.findAll({ statuses: ['pending'] });
  }

  /**
   * Retire une ligne de la pile, **et ses créneaux non vécus avec elle**.
   *
   * Les créneaux approuvés restent : ils racontent du temps passé, qui a bien eu lieu. Les
   * suggestions, elles, n'ont plus d'objet — les laisser afficherait du travail à faire
   * pour une tâche qu'on vient de retirer.
   *
   * **Aucun replan** : retirer une ligne ne doit pas réécrire la journée. Le bouton
   * « Repositionner » est là pour ça, quand on le décide.
   */
  removeItem(id: string): void {
    for (const slot of this.slots.findAll({})) {
      if (slot.itemId === id && !slot.done) this.slots.delete(slot.id);
    }
    this.items.delete(id);
  }

  /**
   * Vide la pile : toutes les lignes encore en cours partent, et leurs créneaux non
   * approuvés avec elles.
   *
   * C'est `removeItem` appliqué à tout, et pour la même raison — une pile qu'on a laissée
   * grossir pendant trois semaines ne se retire pas ligne à ligne. **Rien n'est
   * replanifié** : réécrire l'agenda reste la décision du bouton « Repositionner ».
   *
   * Ce qui a été **approuvé** ne bouge pas, ici comme ailleurs : ces créneaux racontent du
   * temps réellement passé, et vider une pile de travail à faire n'a pas à effacer du
   * travail déjà fait. Les tâches, elles, ne sont pas décochées : retirer de la pile n'a
   * jamais voulu dire « ce n'est plus à faire », seulement « pas dans ce planning ».
   */
  clearItems(): number {
    const items = this.items.findAll({ statuses: ['pending'] });
    const ids = new Set(items.map((item) => item.id));
    if (ids.size === 0) return 0;

    // Une seule lecture des créneaux pour toute la pile : un `findAll` par ligne ferait
    // autant de balayages que de tâches retirées.
    for (const slot of this.slots.findAll({})) {
      if (slot.itemId && ids.has(slot.itemId) && !slot.done) this.slots.delete(slot.id);
    }
    for (const id of ids) this.items.delete(id);
    return ids.size;
  }

  // --- Le placement ---------------------------------------------------------

  /**
   * Pose les créneaux qui manquent, ou réécrit tout — selon le mode.
   *
   * En `full`, on **efface les suggestions déplaçables et on repose tout**. Chercher quoi
   * bouger reviendrait à réimplémenter le moteur à l'envers, et un placement à moitié
   * appliqué laisserait deux créneaux au même endroit.
   *
   * En `incremental` (le défaut), rien n'est effacé : les créneaux existants comptent
   * comme occupation, et le reste à couvrir d'une ligne tombe naturellement à zéro dès
   * qu'elle a déjà ses créneaux. Ajouter une vidéo ne déplace donc plus celles qui étaient
   * déjà calées.
   *
   * L'appel est **asynchrone** parce qu'il lit l'agenda ; il ne l'est pas dans son
   * effet : les écritures en base sont faites avant qu'il rende la main.
   */
  async replan(options: ReplanOptions = {}): Promise<{ placed: number; unplacedMinutes: number }> {
    const config = this.settings.get();
    const mode = options.mode ?? 'incremental';

    // « Maintenant », vu du navigateur. **Rien ne se pose avant cet instant**, quel que
    // soit le jour d'où le placement repart : c'est la seule garantie qui tienne pour les
    // appels qui remontent une date passée. Le plancher portait auparavant sur le premier
    // jour de l'horizon — les deux coïncidaient dans le cas courant, et divergeaient
    // silencieusement dans tous les autres.
    const notBefore = {
      date: options.nowDate ?? options.from ?? today(),
      minutes: options.nowMinutes ?? 0,
    };

    // Réorganiser une colonne déjà écoulée n'a pas d'objet, et la ramener à aujourd'hui
    // réécrirait un autre jour que celui qu'on a désigné : on ne fait rien.
    if (options.onlyDate && options.onlyDate < notBefore.date) {
      return { placed: 0, unplacedMinutes: 0 };
    }

    const requested = options.onlyDate ?? options.from ?? today();
    const from = requested < notBefore.date ? notBefore.date : requested;
    const horizon = options.onlyDate ? 1 : config.horizonDays;
    const to = addDays(from, horizon - 1);

    const workHours = this.workHoursMap();
    if (workHours.size === 0) return { placed: 0, unplacedMinutes: 0 };

    // Le nettoyage vient **avant** le calcul du reste à faire, et ce n'est pas un détail :
    // ce qui survit à l'effacement — les créneaux posés à la main, et ceux d'un autre
    // jour quand on ne réorganise qu'une colonne — couvre déjà du travail. Compter le
    // reste avant les aurait comptés pour rien, et le moteur aurait posé une seconde fois
    // les mêmes heures.
    //
    // En mode incrémental il n'y a rien à effacer : tout ce qui est posé reste posé, et
    // c'est précisément ce qui garantit qu'un ajout ne déplace pas ce qui était déjà calé.
    if (mode === 'full') {
      this.slots.clearSuggestions(options.onlyDate ? from : null, to);
      this.clearElapsed(notBefore, options.onlyDate ?? null);
    }

    const pending = this.items.findAll({ statuses: ['pending'] });
    const tasks: PlanTask[] = pending
      .map((item) => ({
        id: item.id,
        minutes: Math.max(0, item.plannedMinutes - item.approvedMinutes - item.scheduledMinutes),
      }))
      .filter((task) => task.minutes > 0);

    const external = await this.readCalendar(from, to);
    const busy = [...external.blocks, ...this.immovableBusy(from, to, mode)];

    const result = schedule({
      from,
      horizonDays: horizon,
      workHours,
      busy,
      tasks,
      granularityMinutes: config.slotGranularityMinutes,
      minBlockMinutes: config.minBlockMinutes,
      maxBlockMinutes: config.maxBlockMinutes,
      breakMinutes: config.breakMinutes,
      notBefore,
    });

    const itemById = new Map(pending.map((item) => [item.id, item]));
    for (const block of result.blocks) {
      const item = itemById.get(block.taskId);
      if (!item) continue;
      this.slots.create({
        productionId: item.productionId,
        stepId: item.stepId,
        date: block.date,
        startTime: toTime(block.start),
        endTime: toTime(block.end),
        label: item.label,
        origin: 'planner',
        itemId: item.id,
      });
    }

    return {
      placed: result.blocks.length,
      unplacedMinutes: result.unplaced.reduce((sum, entry) => sum + entry.minutes, 0),
    };
  }

  // --- Approbation ----------------------------------------------------------

  /**
   * « J'ai bien passé ce temps là-dessus. »
   *
   * Approuver **fige** le créneau (`done`), enregistre une session de travail — c'est ce
   * qui fait monter le compteur de la vidéo — et le publie dans l'agenda. Le créneau ne
   * bougera plus, et le moteur cessera de le considérer comme de la place libre.
   *
   * Le créneau est **redimensionné sur le temps réellement passé** : approuver 30 minutes
   * d'un bloc de trois quarts d’heure laisse un bloc de 30 minutes. C'est ce qui rend la
   * grille lisible comme un journal de ce qui a eu lieu, et c'est aussi ce qui permet de
   * compter le travail fait sans stocker la durée une seconde fois.
   *
   * `finished` dit si la tâche, elle, est terminée. Si oui, sa ligne quitte la pile et
   * la tâche est cochée. Si non, **un créneau de la durée initialement prévue est
   * reposé** — c'est le cas courant : on a monté une heure, il en reste deux.
   */
  async approve(
    slotId: string,
    input: { finished: boolean; minutes?: number; notes?: string | null },
    options: ReplanOptions = {},
  ): Promise<ProductionSlotView | null> {
    const slot = this.slots.findById(slotId);
    if (!slot) throw notFound('Créneau');
    if (slot.done) throw conflict('Ce créneau est déjà approuvé.');
    if (!slot.startTime || !slot.endTime) {
      throw badRequest("Ce créneau n'a pas d'horaire : renseigne-le avant de l'approuver.");
    }

    // La durée prévue sert deux fois : de valeur par défaut, et de taille du créneau à
    // reposer quand le travail continue.
    const plannedDuration = Math.max(1, slotMinutes(slot));
    const minutes = input.minutes ?? plannedDuration;

    // La session de travail porte le temps réellement passé. C'est elle qui alimente
    // le compteur de la vidéo.
    // La sous-étape vient de la ligne de pile que ce créneau couvre : c'est elle qui
    // porte la maille fine, et c'est ce qui permet plus tard de comparer l'estimation
    // (`plannedMinutes`) au temps réellement passé sur cette tâche précise.
    const covered = slot.itemId ? this.items.findById(slot.itemId) : null;

    const entry = this.trackTime.addManual({
      productionId: slot.productionId,
      stepId: slot.stepId,
      todoId: covered?.todoId ?? null,
      startedAt: `${slot.date}T${slot.startTime}:00`,
      minutes,
      notes: input.notes ?? null,
    });

    // Le créneau est recalé sur le temps vécu **avant** d'être publié : l'événement
    // écrit dans l'agenda doit dire ce qui a eu lieu, pas ce qui était prévu.
    this.slots.update(slot.id, {
      endTime: toTime(toMinutes(slot.startTime) + minutes),
      done: true,
      timeEntryId: entry.id,
    });

    const calendarUid = await this.publish(slot.id);
    if (calendarUid) this.slots.update(slot.id, { calendarUid });

    const item = covered;

    if (input.finished) {
      if (item) this.complete(item);
      return null;
    }

    if (!item) return null;

    // Pas fini : le reste à faire redevient exactement la durée du créneau qu'on vient
    // de vivre. `plannedMinutes` est une estimation, pas un contrat — la recaler sur ce
    // qui est déjà fait est la seule façon d'obtenir « un créneau de la même durée » sans
    // tenir un second compteur qui finirait par diverger.
    const done = this.items
      .findAll({ statuses: ['pending'] })
      .find((candidate) => candidate.id === item.id)?.approvedMinutes;
    this.items.update(item.id, { plannedMinutes: (done ?? minutes) + plannedDuration });
    // Incrémental : le créneau promis est posé, sans déranger le reste de la journée.
    await this.replan({ ...options, mode: 'incremental' });

    const next = this.slots
      .findAll({ range: { from: options.from ?? today(), to: addDays(today(), 60) } })
      .find((candidate) => candidate.itemId === item.id && !candidate.done);
    return next ?? null;
  }

  /**
   * Démarre le chronomètre **sur un créneau**.
   *
   * C'est l'autre chemin vers le même résultat qu'`approve` : au lieu de confirmer après
   * coup un temps qu'on estime, on mesure pendant qu'on travaille. Le créneau retient
   * l'identifiant de la session (`time_entry_id`), et c'est ce lien qui permettra à
   * l'arrêt de le compléter.
   *
   * **Le créneau est déplacé à l'instant où l'on démarre**, et cet instant vient du
   * navigateur (`date`, `startTime`). Il ne peut pas venir de `TimeEntry.startedAt`, qui
   * est un horodatage **UTC** : en extraire l'heure poserait le créneau deux heures trop
   * tôt en été — c'est exactement le bug qu'avait la première version. C'est la même règle
   * que partout ailleurs dans ce module, et elle vaut aussi ici bien que l'horodatage soit
   * produit par le serveur.
   *
   * Il passe en `manual` du même geste : on travaille dessus, le replan n'a plus à le
   * déplacer. La sous-étape vient de la ligne de pile que le créneau couvre, si bien que
   * le temps se range à la même maille que ce qui avait été estimé.
   */
  startTimerOnSlot(slotId: string, at: { date: IsoDate; startTime: string }): TimeEntryView {
    const slot = this.slots.findById(slotId);
    if (!slot) throw notFound('Créneau');
    if (slot.done) throw conflict('Ce créneau est déjà terminé.');

    // Une session qui courait sur un AUTRE créneau doit d'abord le compléter : la laisser
    // arrêter par `TrackTime.start` figerait sa durée sans jamais recaler son créneau, qui
    // resterait une suggestion alors que le travail a eu lieu.
    const running = this.trackTime.running();
    if (running && running.id !== slot.timeEntryId) this.stopTimer(running.id);

    const item = slot.itemId ? this.items.findById(slot.itemId) : null;
    const entry = this.trackTime.start(slot.productionId, slot.stepId, item?.todoId ?? null);

    // La durée prévue est conservée le temps que ça tourne : elle sera remplacée par la
    // durée vécue à l'arrêt, et entre-temps le bloc occupe une place plausible.
    const planned = Math.max(15, slotMinutes(slot) || item?.plannedMinutes || 30);
    this.slots.update(slot.id, {
      date: at.date,
      startTime: at.startTime,
      endTime: toTime(toMinutes(at.startTime) + planned),
      origin: 'manual',
      timeEntryId: entry.id,
    });

    return entry;
  }

  /**
   * Arrête le chronomètre, et **complète le créneau d'où il avait été lancé**.
   *
   * Le créneau cesse d'être une suggestion : ses horaires sont recalés sur ce qui s'est
   * réellement passé — début réel, durée réelle — et il passe en approuvé, donc immobile.
   * C'est ce qui fait qu'une journée finit par ressembler à ce qu'elle a été plutôt qu'à ce
   * qu'on avait prévu.
   *
   * `plannedMinutes` n'est **pas** gonflé, contrairement à `approve(finished: false)` : le
   * temps mesuré se déduit de l'estimation, et ce qui reste — s'il reste quelque chose —
   * retrouvera une place au replan. Un chronomètre mesure, il ne renégocie pas la charge.
   *
   * Un chronomètre lancé depuis une fiche de production n'a aucun créneau lié : la méthode
   * se contente alors d'arrêter la session, et rien d'autre ne bouge.
   */
  async stopTimer(
    entryId: string,
    options: ReplanOptions = {},
  ): Promise<{ entry: TimeEntry; completable: CompletableWork | null }> {
    const entry = this.trackTime.stop(entryId);

    const slot = this.slots.findByTimeEntry(entryId);
    if (!slot) return { entry, completable: null };

    // **Seule la durée est reprise de la session** — elle ne dépend d'aucun fuseau. Le
    // début, lui, a été posé à l'heure locale au démarrage : le relire dans `startedAt`,
    // qui est en UTC, décalerait le créneau de deux heures en été.
    const minutes = Math.max(1, entry.minutes ?? 1);
    const startMinutes = toMinutes(slot.startTime ?? '00:00');

    this.slots.update(slot.id, {
      endTime: toTime(startMinutes + minutes),
      done: true,
      origin: 'manual',
    });

    const calendarUid = await this.publish(slot.id);
    if (calendarUid) this.slots.update(slot.id, { calendarUid });

    // Incrémental : ce qui reste de la tâche trouve une place, le reste de la journée
    // garde la sienne.
    await this.replan({ ...options, mode: 'incremental' });

    // **La question « as-tu terminé ? » n'est pas posée ici, elle est rendue possible.**
    // On ne peut pas y répondre à la place de l'utilisateur — arrêter un chronomètre est
    // souvent une pause —, mais ne rien proposer laissait la ligne dans la pile jusqu'à
    // ce qu'on aille l'y retirer à la main, alors même que le travail était fait. L'écran
    // pose la question au bon moment ; ce champ lui dit qu'il y a lieu de la poser.
    const covered = slot.itemId ? this.items.findById(slot.itemId) : null;
    return {
      entry,
      completable:
        covered && covered.status === 'pending'
          ? {
              itemId: covered.id,
              productionId: covered.productionId,
              todoId: covered.todoId,
              stepId: covered.stepId,
              label: covered.label,
            }
          : null,
    };
  }

  /**
   * Ferme une ligne de pile parce que son travail est terminé.
   *
   * **Le geste qui compte est de cocher la tâche, pas de fermer la ligne** : c'est lui
   * qui fait remonter l'avancement de la vidéo, coche l'étape quand c'était la dernière
   * tâche, et retire la ligne de la pile au passage. D'où le passage par `ManageTodos`
   * plutôt que par `todos.check` : la règle « une étape est cochée exactement quand
   * toutes ses tâches le sont » vit là-bas et nulle part ailleurs. L'appeler directement
   * cochait bien la tâche, mais laissait l'étape ouverte — et la barre de progression ne
   * bougeait pas d'un pixel.
   *
   * Une ligne qui couvre une **étape entière** (aucune tâche à viser) coche l'étape.
   */
  private complete(item: {
    id: string;
    productionId: string;
    todoId: string | null;
    stepId: string | null;
  }): void {
    this.items.update(item.id, { status: 'done' });

    if (item.todoId) this.manageTodos.toggle(item.productionId, item.todoId, true);
    else if (item.stepId) this.manageTodos.toggleStep(item.productionId, item.stepId, true);

    // Les créneaux restants de la ligne n'ont plus d'objet : le travail est fait.
    for (const slot of this.slots.findAll({})) {
      if (slot.itemId === item.id && !slot.done) this.slots.delete(slot.id);
    }
  }

  /**
   * Transforme une session de travail en **créneau approuvé**.
   *
   * Le geste répond à un cas courant : on a chronométré deux heures de montage sans
   * qu'aucun créneau ne les attende, et rien n'en garde trace dans le planning. Le
   * créneau créé est `manual` **et** `done` — il raconte du temps déjà passé, donc rien
   * ne le déplacera jamais, et il occupe la place aux yeux du moteur.
   *
   * **Aucune session n'est créée** : elle existe déjà, et c'est elle qui compte dans les
   * totaux. Le créneau n'en est que la représentation dans le temps. `time_entry_id` les
   * relie, et sa présence interdit d'en tirer un second — une même heure de montage ne
   * doit apparaître qu'une fois dans le planning, et surtout pas deux dans l'agenda, où
   * rien ne permettrait de retirer le doublon.
   *
   * `date` et `startTime` viennent **du navigateur** : `startedAt` est un horodatage UTC,
   * et en extraire l'heure côté serveur poserait le créneau deux heures trop tôt en été.
   */
  async slotFromTimeEntry(
    timeEntryId: string,
    input: { date: IsoDate; startTime: string; nowDate?: IsoDate; nowMinutes?: number },
  ): Promise<ProductionSlotView | null> {
    const entry = this.trackTime.find(timeEntryId);
    if (!entry) throw notFound('Session de travail');
    if (entry.endedAt === null || entry.minutes === null) {
      throw conflict('Cette session tourne encore : arrête le chronomètre d’abord.');
    }
    if (entry.slotId) throw conflict('Cette session a déjà son créneau dans le planning.');

    const slot = this.slots.create({
      productionId: entry.productionId,
      stepId: entry.stepId,
      date: input.date,
      startTime: input.startTime,
      endTime: toTime(toMinutes(input.startTime) + entry.minutes),
      label: entry.todoLabel ?? entry.stepName ?? entry.productionTitle,
      done: true,
      origin: 'manual',
      notes: entry.notes,
    });
    this.slots.update(slot.id, { timeEntryId: entry.id });

    const calendarUid = await this.publish(slot.id);
    if (calendarUid) this.slots.update(slot.id, { calendarUid });

    // Le créneau occupe désormais la journée. En incrémental, il devient une occupation
    // parmi d'autres et rien n'est déplacé : c'est au bouton « Repositionner » de décider
    // si la journée doit être réécrite.
    await this.replan({
      from: input.date,
      nowDate: input.nowDate,
      nowMinutes: input.nowMinutes,
      mode: 'incremental',
    });

    return (
      this.slots
        .findAll({ range: { from: input.date, to: input.date } })
        .find((candidate) => candidate.id === slot.id) ?? null
    );
  }

  /** Défait une approbation : la session part, le créneau redevient déplaçable. */
  unapprove(slotId: string): void {
    const slot = this.slots.findById(slotId);
    if (!slot) throw notFound('Créneau');
    if (slot.timeEntryId) {
      try {
        this.trackTime.remove(slot.timeEntryId);
      } catch {
        // La session a pu être supprimée à la main depuis la fiche : rien à défaire.
      }
    }
    // `calendarUid` est conservé : l'événement, lui, est toujours dans l'agenda et rien
    // ne permet de l'en retirer. Le garder évite d'en créer un second à la réapprobation.
    //
    // La durée d'origine, elle, ne revient pas : l'approbation a recalé le créneau sur le
    // temps réellement passé, et l'estimation d'avant n'est écrite nulle part. Corriger
    // l'horaire à la main reste possible, et c'est plus honnête que de restaurer une
    // durée que personne n'a vécue.
    this.slots.update(slotId, { done: false, timeEntryId: null });
    if (slot.itemId) this.items.update(slot.itemId, { status: 'pending' });
  }

  /**
   * Publie un créneau dans l'agenda, si la connexion est configurée.
   *
   * Un échec est **avalé** : l'approbation d'un créneau ne doit pas échouer parce que
   * l'instance domotique est en train de redémarrer. Le temps passé est déjà
   * enregistré, c'est ce qui compte ; l'événement est du confort.
   */
  private async publish(slotId: string): Promise<string | null> {
    const slot = this.slots.findById(slotId);
    if (!slot || slot.calendarUid) return null;

    const config = this.settings.get();
    const client = this.client();
    if (!client || !config.pushToCalendar || !config.targetCalendarId) return null;
    if (!slot.startTime || !slot.endTime) return null;

    const production = this.productions.findById(slot.productionId);
    try {
      return await client.createEvent({
        calendarId: config.targetCalendarId,
        summary: slot.label || production?.title || 'Travail vidéo',
        description: production ? `Vidéo : ${production.title}` : '',
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    } catch (error) {
      console.warn('[planning] publication dans l’agenda impossible :', error);
      return null;
    }
  }

  // --- Lecture --------------------------------------------------------------

  /** Tout l'écran de planning en une requête : la grille, ses occupations et la pile. */
  async board(from: IsoDate, to: IsoDate): Promise<PlanningBoard> {
    const workHours = this.workHoursMap();
    const slots = this.slots.findAll({ range: { from, to } });
    const external = await this.readCalendar(from, to);

    const eventsByDate = new Map<IsoDate, CalendarEvent[]>();
    for (const event of external.events) {
      const list = eventsByDate.get(event.date) ?? [];
      list.push(event);
      eventsByDate.set(event.date, list);
    }

    const slotsByDate = new Map<IsoDate, ProductionSlotView[]>();
    for (const slot of slots) {
      const list = slotsByDate.get(slot.date) ?? [];
      list.push(slot);
      slotsByDate.set(slot.date, list);
    }

    const days: PlanningDay[] = [];
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
      const daySlots = slotsByDate.get(cursor) ?? [];
      days.push({
        date: cursor,
        weekday: weekdayOf(cursor),
        windows: workHours.get(weekdayOf(cursor)) ?? [],
        slots: daySlots,
        events: eventsByDate.get(cursor) ?? [],
        suggestedMinutes: daySlots
          .filter((slot) => !slot.done)
          .reduce((sum, slot) => sum + slotMinutes(slot), 0),
        approvedMinutes: daySlots
          .filter((slot) => slot.done)
          .reduce((sum, slot) => sum + slotMinutes(slot), 0),
      });
    }

    return {
      from,
      to,
      days,
      items: this.items.findAll({ statuses: ['pending'] }),
      productions: this.spans(from, to),
      calendarConnected: external.connected,
      calendarError: external.error,
      hasWorkHours: workHours.size > 0,
    };
  }

  /**
   * Les fenêtres de travail des vidéos qui recoupent la période.
   *
   * Le recoupement est calculé **ici et non en SQL** : le `range` du dépôt de productions
   * filtre sur la seule `plannedDate`, ce qui laisserait de côté une vidéo commencée la
   * semaine dernière et attendue la semaine prochaine — précisément celle sur laquelle on
   * travaille aujourd'hui. La file d'attente se compte en dizaines de lignes, la
   * différence de coût est nulle.
   *
   * Une production sans aucune des deux dates n'a pas de fenêtre et n'apparaît pas : elle
   * n'occuperait aucune colonne, et la poser sur le jour courant inventerait une échéance.
   */
  private spans(from: IsoDate, to: IsoDate): PlanningProductionSpan[] {
    const spans: PlanningProductionSpan[] = [];

    for (const production of this.productions.findAll()) {
      const start = production.startDate ?? production.plannedDate;
      const end = production.plannedDate ?? production.startDate;
      if (!start || !end) continue;

      // Les bornes sont remises dans l'ordre : une sortie antérieure au début saisi est
      // une faute de frappe, et une barre de largeur négative ne se dessine pas.
      const spanFrom = start <= end ? start : end;
      const spanTo = start <= end ? end : start;
      if (spanTo < from || spanFrom > to) continue;

      spans.push({
        id: production.id,
        title: production.title,
        status: production.status,
        channelName: production.channelName,
        channelColor: production.channelColor,
        from: spanFrom,
        to: spanTo,
        plannedDate: production.plannedDate,
      });
    }

    return spans.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  }

  // --- Helpers --------------------------------------------------------------

  private workHoursMap(): Map<number, Interval[]> {
    const map = new Map<number, Interval[]>();
    for (const range of this.workHours.findAll()) {
      const list = map.get(range.weekday) ?? [];
      list.push({ start: toMinutes(range.startTime), end: toMinutes(range.endTime) });
      map.set(range.weekday, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }

  /**
   * Ce qui n'a pas eu lieu, et ne peut plus avoir lieu : **entièrement écoulé et non
   * approuvé**.
   *
   * C'est la seule exception à « le moteur ne déplace jamais un créneau posé à la main »,
   * et elle est délibérée. Cette règle protège une **intention** — j'ai voulu ce créneau
   * là, ne le défais pas —, or une intention passée qui n'a pas été tenue n'est plus une
   * intention : c'est du travail qui reste à faire, coincé à une date révolue. Le
   * « Repositionner » ne nettoyait que les suggestions du moteur, et laissait donc
   * indéfiniment dans le passé tout créneau déplacé au doigt ou né d'un chronomètre
   * abandonné — précisément ceux qu'on voulait voir revenir devant soi.
   *
   * Quatre bornes, chacune pour une raison :
   *
   * - **`done` est intouchable**, comme partout : un créneau approuvé raconte du temps
   *   vécu, pas une prévision.
   * - **Il faut une ligne de pile** (`item_id`). C'est ce qui garantit que le travail
   *   effacé sera reposé juste après : sans elle, le moteur n'a rien à replanifier et la
   *   suppression serait une perte sèche. Un créneau ajouté à la main depuis une fiche de
   *   vidéo — « tournage samedi » — n'appartient pas au planning et ne bouge donc pas,
   *   même passé.
   * - **Un créneau lié à une session de travail est épargné** : le chronomètre tourne
   *   peut-être encore, et `stopTimer` le retrouve par `time_entry_id`. L'effacer
   *   laisserait la session sans créneau à recaler.
   * - **Écoulé veut dire ENTIÈREMENT écoulé** : un bloc commencé à 14 h et fini à 16 h
   *   n'est pas passé à 15 h, on est dedans. Un créneau sans horaire (« samedi ») n'est
   *   écoulé que le jour d'après — rien ne dit à quelle heure il tombait.
   *
   * Réservé au mode `full`, donc au bouton : réécrire l'agenda reste une décision.
   */
  private clearElapsed(
    notBefore: { date: IsoDate; minutes: number },
    onlyDate: IsoDate | null,
  ): number {
    let removed = 0;
    for (const slot of this.slots.findAll({})) {
      if (slot.done || slot.itemId === null || slot.timeEntryId !== null) continue;
      if (onlyDate !== null && slot.date !== onlyDate) continue;

      const elapsed =
        slot.date < notBefore.date ||
        (slot.date === notBefore.date &&
          slot.endTime !== null &&
          toMinutes(slot.endTime) <= notBefore.minutes);
      if (!elapsed) continue;

      this.slots.delete(slot.id);
      removed += 1;
    }
    return removed;
  }

  /**
   * Les créneaux que le moteur n'a pas le droit d'écraser.
   *
   * En `full`, ce sont les approuvés et les manuels — les suggestions viennent d'être
   * effacées. En `incremental`, **tout compte**, y compris les suggestions : on ne les a
   * pas effacées, et poser par-dessus mettrait deux blocs au même moment.
   */
  private immovableBusy(from: IsoDate, to: IsoDate, mode: ReplanMode): BusyBlock[] {
    return this.slots
      .findAll({ range: { from, to } })
      .filter(
        (slot) =>
          slot.startTime &&
          slot.endTime &&
          (mode === 'incremental' || slot.done || slot.origin === 'manual'),
      )
      .map((slot) => ({
        date: slot.date,
        start: toMinutes(slot.startTime!),
        end: toMinutes(slot.endTime!),
      }));
  }

  /**
   * L'occupation venue de l'agenda.
   *
   * Une lecture qui échoue ne fait **pas** échouer le planning : on rend une grille sans
   * occupations externes, avec le message d'erreur. Une page vide dirait moins qu'une
   * page qui prévient qu'elle est incomplète.
   *
   * Les événements d'une journée entière sont **ignorés comme occupation** : « congés »
   * couvrirait 24 h et bloquerait toute la journée, alors qu'ils servent surtout à
   * étiqueter. Ils restent affichés en tête de colonne.
   */
  private async readCalendar(
    from: IsoDate,
    to: IsoDate,
  ): Promise<{
    events: CalendarEvent[];
    blocks: BusyBlock[];
    connected: boolean;
    error: string | null;
  }> {
    const config = this.settings.get();
    const client = this.client();
    if (!client || config.busyCalendarIds.length === 0) {
      return { events: [], blocks: [], connected: client !== null, error: null };
    }

    const events: CalendarEvent[] = [];
    let error: string | null = null;
    for (const calendarId of config.busyCalendarIds) {
      try {
        events.push(...(await client.listEvents(calendarId, from, addDays(to, 1))));
      } catch (readError) {
        error = readError instanceof Error ? readError.message : 'Lecture de l’agenda impossible';
      }
    }

    const blocks: BusyBlock[] = events
      .filter((event) => !event.allDay && event.start !== null && event.end !== null)
      .map((event) => ({ date: event.date, start: event.start!, end: event.end! }));

    return { events, blocks, connected: true, error };
  }
}
