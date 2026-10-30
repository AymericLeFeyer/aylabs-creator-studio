import { createHash } from 'node:crypto';
import type {
  MailAiAction,
  MailDateCheck,
  MailDateTask,
  MailDraftIntent,
  MailThreadView,
} from '../../../domain/mail/entities/Mail.ts';
import type { MailStore } from '../../../domain/mail/repositories/MailRepository.ts';
import type { AiClient } from '../../../domain/ai/repositories/AiRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { TodoLinkRepository } from '../../../domain/todoApp/repositories/TodoRepository.ts';
import type { ManageAi } from '../../ai/usecases/ManageAi.ts';
import type { ManageTodoTasks } from '../../todoApp/usecases/ManageTodoTasks.ts';
import {
  DATE_CHECK_SCHEMA,
  describeDay,
  parseDateCheck,
} from '../../../domain/mail/services/dateCheck.ts';
import type { ProductionNoteRepository } from '../../../domain/production/repositories/ProductionNoteRepository.ts';
import type { ProductionNote } from '../../../domain/production/entities/ProductionNote.ts';
import {
  bodyText,
  sanitizeNoteHtml,
  stripQuoted,
  transcriptOf,
} from '../../../domain/mail/services/threading.ts';
import { badRequest, notFound, upstream } from '../../../shared/errors.ts';
import type { ManageMail } from './ManageMail.ts';
import type { MailVideoNotes } from './MailVideoNotes.ts';

const BASE_SYSTEM = (fromName: string) =>
  `Tu assistes ${fromName || 'un créateur de contenu'}, créateur de contenu YouTube francophone, ` +
  `dans la gestion de ses mails professionnels : partenariats de marques, envois de produits, ` +
  `sponsorisations, demandes diverses. Tu es précis, factuel, et tu n'inventes jamais un ` +
  `montant, une date, un engagement ou une information absente des messages.`;

/** Les règles communes à tout ce qui deviendra un brouillon de mail. */
const DRAFT_RULES = [
  'Rédige uniquement le corps du mail, en texte brut : pas d’objet, pas de Markdown, pas de signature (elle est ajoutée ensuite).',
  'Réponds dans la langue du dernier message reçu de l’interlocuteur, avec le même niveau de formalité (tutoiement ou vouvoiement compris).',
  'Ce qui ne peut pas être déduit des messages (un prix, une date, un détail personnel) reste un champ à compléter entre crochets, par exemple [date de tournage].',
  'Sois bref et naturel : quelques phrases, pas de formules creuses.',
].join('\n- ');

const INTENTS: Record<MailDraftIntent, (rates: string) => string> = {
  not_interested: () =>
    'Décline poliment la proposition : remercie, dis que ce n’est pas pour le moment ou pas en adéquation avec la chaîne, et laisse la porte ouverte sans promettre.',
  interested: () =>
    'Montre de l’intérêt pour la proposition : remercie, dis que ça t’intéresse, et pose les questions utiles pour avancer (livrables attendus, calendrier, budget, conditions) en fonction de ce qui manque dans les messages.',
  rates: (rates) =>
    rates.trim()
      ? `Présente mes tarifs, en reprenant fidèlement la grille ci-dessous (adapte la présentation à la langue, jamais les montants), puis propose la suite.\n\nMa grille :\n${rates.trim()}`
      : 'Présente mes tarifs : comme aucune grille n’est renseignée, laisse les montants en champs à compléter entre crochets, par exemple [tarif intégration], [tarif vidéo dédiée].',
};

/**
 * L'assistant de la boîte mail : résumer, traduire, proposer des brouillons, et tenir la
 * note d'une vidéo à jour depuis ses échanges.
 *
 * **Il n'envoie rien, jamais.** Chaque méthode rend du texte ; l'écran le pose dans le
 * brouillon, que l'utilisateur relit, complète et envoie lui-même par le seul chemin
 * d'envoi (`ManageMail.send`). Aucune référence à ce chemin n'existe ici.
 */
export class MailAssistant {
  private readonly mail: ManageMail;
  private readonly store: MailStore;
  private readonly ai: AiClient;
  private readonly settings: ManageAi;
  private readonly notes: ProductionNoteRepository;
  private readonly productions: ProductionRepository;
  private readonly todoTasks: ManageTodoTasks;
  private readonly todoLinks: TodoLinkRepository;
  private readonly videoNotes: MailVideoNotes;

  constructor(deps: {
    mail: ManageMail;
    store: MailStore;
    ai: AiClient;
    settings: ManageAi;
    notes: ProductionNoteRepository;
    productions: ProductionRepository;
    todoTasks: ManageTodoTasks;
    todoLinks: TodoLinkRepository;
    videoNotes: MailVideoNotes;
  }) {
    this.videoNotes = deps.videoNotes;
    this.mail = deps.mail;
    this.store = deps.store;
    this.ai = deps.ai;
    this.settings = deps.settings;
    this.notes = deps.notes;
    this.productions = deps.productions;
    this.todoTasks = deps.todoTasks;
    this.todoLinks = deps.todoLinks;
  }

  private async ask(system: string, prompt: string, schema?: Record<string, unknown>) {
    return this.ai.complete(this.settings.credentials(), {
      system: `${BASE_SYSTEM(this.mail.writingContext().fromName)}\n\n${system}`,
      prompt,
      schema,
    });
  }

  async summarizeMessage(id: string): Promise<string> {
    const message = this.store.findMessage(id);
    if (!message) throw notFound('Message');
    const text = await this.ask(
      'Résume le message en français, en trois à cinq puces courtes commençant par « - » : qui écrit, ce qui est proposé ou demandé, les chiffres et dates cités, ce qui est attendu de moi. Texte brut, pas de titre.',
      `De : ${message.from.name} <${message.from.address}>\nObjet : ${message.subject}\nDate : ${message.date}\n\n${stripQuoted(bodyText(message))}`,
    );
    this.store.setMessageSummary(id, text);
    return text;
  }

  async run(threadId: string, request: MailAiAction): Promise<string> {
    const thread = this.mail.thread(threadId);
    const transcript = transcriptOf(thread.messages);

    switch (request.action) {
      case 'summarize': {
        const text = await this.ask(
          'Résume l’ensemble du fil en français. Texte brut, puces commençant par « - ». Donne : l’objet de l’échange et l’interlocuteur, où en est la discussion, ce qui a été convenu (montants, dates, livrables), et ce qui reste en suspens — en précisant qui doit répondre à qui.',
          transcript,
        );
        this.store.setThreadSummary(threadId, text);
        return text;
      }
      case 'follow_up':
        return this.ask(
          `Propose un message de relance pour ce fil, à envoyer en réponse au dernier message. Tiens compte de qui attend quoi : si j’attends une réponse, relance poliment en rappelant l’objet ; si c’est moi qui suis en retard, excuse-toi brièvement et avance.\n- ${DRAFT_RULES}`,
          transcript,
        );
      case 'draft':
        return this.ask(
          `${INTENTS[request.intent](this.mail.writingContext().rates)}\n- ${DRAFT_RULES}`,
          request.notes?.trim()
            ? `${transcript}\n\n### Mes indications pour la réponse\n${request.notes.trim()}`
            : transcript,
        );
      case 'translate': {
        if (!request.text.trim()) throw badRequest('Rien à traduire.');
        const target = request.language?.trim()
          ? `en ${request.language.trim()}`
          : 'dans la langue du dernier message reçu de l’interlocuteur dans le fil ci-dessous';
        return this.ask(
          `Traduis le brouillon ${target}. Garde le sens, le ton et la mise en forme (paragraphes, listes), ainsi que les champs entre crochets tels quels. Rends uniquement la traduction, en texte brut, sans commentaire.`,
          `## Fil (pour le contexte et la langue)\n${transcript}\n\n## Brouillon à traduire\n${request.text}`,
        );
      }
      case 'refine':
        // Un ajustement, pas une réécriture : ce qui n'est pas visé doit rester mot pour mot.
        return this.ask(
          [
            'Applique au brouillon uniquement la modification demandée. Tout le reste reste mot pour mot : mêmes phrases, même ordre, mêmes paragraphes, même langue, mêmes champs entre crochets.',
            'Ne reformule rien d’autre, ne corrige pas le style, n’ajoute ni formule ni signature. N’invente aucun montant, date ou engagement : ce qui manque devient un champ entre crochets.',
            'Rends uniquement le brouillon modifié, en texte brut, sans commentaire.',
          ].join('\n'),
          `## Fil (pour le contexte)\n${transcript}\n\n## Brouillon\n${request.text}\n\n## Modification demandée\n${request.instruction}`,
        );
    }
  }

  /**
   * « Vérifier les dates » : l'IA lit le fil, relève **ce qui m'engage** et pour quand, et
   * chaque échéance devient une tâche dans l'app Todo — plus une tâche « s'y mettre »
   * quelques jours avant quand c'est urgent. Elle compare aussi aux dates de la vidéo
   * rattachée et signale ce qui ne colle pas, avec la date qui le résoudrait. **Rien n'est
   * changé sur la vidéo** : c'est l'écran qui propose, et l'utilisateur qui applique.
   *
   * **Une tâche n'est posée qu'une fois** (`todo_links`, clé `mail:<fil>:<empreinte>`, et
   * `externalId` côté Todo) : revérifier après un nouveau message ajoute ce qui est nouveau
   * sans dupliquer, et une tâche supprimée à la main dans Todo ne revient pas. L'empreinte
   * porte sur le titre et la date : une échéance déplacée par la marque est une autre tâche.
   *
   * Sans Todo connecté, l'analyse est quand même rendue : c'est elle qui dit s'il y a
   * quelque chose d'urgent, la tâche n'est que le rappel.
   */
  async checkDates(threadId: string, today: string): Promise<MailDateCheck> {
    const thread = this.mail.thread(threadId);
    const production = thread.productionId ? this.productions.findById(thread.productionId) : null;

    const context = [
      `Aujourd’hui : ${describeDay(today)}.`,
      thread.brandName
        ? `Marque rattachée au fil : ${thread.brandName}.`
        : 'Aucune marque rattachée.',
      production
        ? `Vidéo rattachée : « ${production.title} » — statut ${production.status}, début du travail ${production.startDate ?? 'non fixé'}, sortie prévue ${production.plannedDate ?? 'non fixée'}.`
        : 'Aucune vidéo rattachée à ce fil.',
    ].join('\n');

    const raw = await this.ask(
      [
        'Lis ce fil et relève toutes les échéances qui m’engagent, MOI : livrer un brouillon ou un script, tourner, publier, répondre avant une date, envoyer une facture, renvoyer un produit, valider quelque chose. Pas les échéances de l’interlocuteur, sauf s’il faut le relancer à une date précise.',
        'Résous chaque date relative (« mercredi », « fin du mois », « sous 10 jours ») par rapport à la date du message où elle apparaît, et rends-la au format AAAA-MM-JJ.',
        'Ignore une échéance que la suite du fil montre déjà honorée ou annulée. Ne relève pas deux fois la même.',
        'title : ce que je dois faire, en français, court, à l’infinitif (« Envoyer le brouillon à la marque »).',
        'urgent : vrai si l’échéance tombe dans les 7 prochains jours, ou si elle demande un travail conséquent (tournage, montage, écriture) qui ne tiendra pas la veille. Pour une échéance urgente, startDate est le jour où commencer à y travailler (jamais avant aujourd’hui, toujours avant l’échéance) ; sinon null.',
        'duration : l’estimation en minutes de la tâche (15, 30 ou 60), null si c’est plus long ou si tu ne sais pas.',
        'quote : la phrase exacte du mail qui fixe l’échéance.',
        'incoherences : ce qui ne colle pas entre le fil et la vidéo rattachée (publication demandée avant la sortie prévue, travail qui commence après l’échéance du brouillon, échéance déjà dépassée sans trace de réponse, date de publication demandée sans vidéo rattachée…). Rédige le message en français, en disant quoi changer. field et suggestedDate : le champ de la vidéo (plannedDate = sortie, startDate = début du travail) et la date qui résoudrait l’incohérence, sinon null.',
        'summary : une à trois phrases en français, qui disent d’abord s’il y a quelque chose d’urgent à faire, quoi et pour quand. urgent : vrai s’il y a au moins une échéance urgente.',
      ].join('\n'),
      `${context}\n\n${transcriptOf(thread.messages)}`,
      DATE_CHECK_SCHEMA,
    );

    let analysis;
    try {
      analysis = parseDateCheck(raw);
    } catch (error) {
      throw upstream(error instanceof Error ? error.message : String(error));
    }

    const client = this.todoTasks.client();
    const tags = this.todoTasks.tags().slice(0, 1);
    const prefix = thread.brandName ? `[${thread.brandName}] ` : '';
    const tasks: MailDateTask[] = [];

    const place = async (
      task: Omit<MailDateTask, 'status' | 'error'>,
      key: string,
      duration: 15 | 30 | 60 | null,
    ): Promise<void> => {
      if (task.dueDate < today) {
        tasks.push({ ...task, status: 'past', error: null });
        return;
      }
      if (!client) {
        tasks.push({ ...task, status: 'not_connected', error: null });
        return;
      }
      if (this.todoLinks.find(key)) {
        tasks.push({ ...task, status: 'exists', error: null });
        return;
      }
      try {
        const created = await client.createTask({
          title: `${prefix}${task.title}`,
          notes: [`D’après le mail « ${thread.subject} »`, task.quote && `« ${task.quote} »`]
            .filter(Boolean)
            .join('\n'),
          dueDate: task.dueDate,
          duration,
          tags,
          externalId: `acs:${key}`,
        });
        this.todoLinks.save({ key, taskId: created.id, done: created.completedAt !== null });
        tasks.push({ ...task, status: 'created', error: null });
      } catch (error) {
        tasks.push({
          ...task,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    for (const deadline of analysis.deadlines) {
      const key = `mail:${threadId}:${fingerprint(deadline.title, deadline.dueDate)}`;
      await place(
        {
          title: deadline.title,
          dueDate: deadline.dueDate,
          kind: 'deadline',
          urgent: deadline.urgent,
          quote: deadline.quote,
        },
        key,
        deadline.duration,
      );
      const start = deadline.startDate;
      if (deadline.urgent && start && start < deadline.dueDate) {
        await place(
          {
            title: `Commencer : ${deadline.title}`,
            dueDate: start < today ? today : start,
            kind: 'start',
            urgent: true,
            quote: deadline.quote,
          },
          `${key}:start`,
          null,
        );
      }
    }

    return {
      summary: analysis.summary,
      urgent: analysis.urgent,
      todoConnected: client !== null,
      productionId: production?.id ?? null,
      tasks,
      // Sans vidéo rattachée, une incohérence ne peut rien proposer de modifier.
      incoherences: analysis.incoherences.map((entry) =>
        production ? entry : { ...entry, field: null, suggestedDate: null },
      ),
    };
  }

  /**
   * Écrit — ou réécrit — la note « Échanges » dans la fiche de la vidéo rattachée : un
   * résumé des échanges et un récapitulatif de ce qui est attendu.
   *
   * **Une seule note par fil**, retrouvée par `mail_threads.note_id` et réécrite à chaque
   * passage : relancer après un nouveau message met la note à jour au lieu d'en empiler
   * une seconde. Une note supprimée depuis la fiche est recréée.
   */
  async writeVideoNote(threadId: string): Promise<ProductionNote> {
    const thread: MailThreadView = this.mail.thread(threadId);
    if (!thread.productionId) throw badRequest('Rattache d’abord ce fil à une vidéo.');
    const transcript = transcriptOf(thread.messages);

    const html = sanitizeNoteHtml(
      await this.ask(
        [
          'Rédige, en français, une note de travail pour la fiche de la vidéo concernée par ces échanges.',
          'Format : du HTML simple, uniquement les balises h2, h3, p, ul, li, strong, em. Pas de bloc de code, pas de texte hors HTML.',
          'Deux sections, dans cet ordre :',
          '<h2>Résumé des échanges</h2> : qui, quoi, où en est la discussion (quelques phrases ou puces).',
          '<h2>Ce qui est attendu</h2> : une liste à puces de tout ce que la marque attend pour la vidéo — livrables, mentions obligatoires, liens et codes promo, plans à filmer, messages à faire passer, interdits, dates (envoi du brouillon, publication), contreparties. Termine par les points encore à clarifier, s’il y en a.',
          'N’invente rien : si une information manque, dis-le.',
        ].join('\n'),
        transcript,
      ),
    );
    const note = await this.videoNotes.refresh(
      threadId,
      `<p><em>D’après le fil « ${escapeHtml(thread.subject)} » (${thread.messageCount} message${thread.messageCount > 1 ? 's' : ''}).</em></p>${html}`,
    );
    if (!note) throw badRequest('Rattache d’abord ce fil à une vidéo.');
    return note;
  }
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** L'empreinte d'une échéance : même titre et même date = même tâche. */
const fingerprint = (title: string, dueDate: string): string =>
  createHash('sha1').update(`${title.trim().toLowerCase()}|${dueDate}`).digest('hex').slice(0, 16);
