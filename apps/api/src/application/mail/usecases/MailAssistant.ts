import type {
  MailAiAction,
  MailDraftIntent,
  MailThreadView,
} from '../../../domain/mail/entities/Mail.ts';
import type { MailAi, MailStore } from '../../../domain/mail/repositories/MailRepository.ts';
import type { ProductionNoteRepository } from '../../../domain/production/repositories/ProductionNoteRepository.ts';
import type { ProductionNote } from '../../../domain/production/entities/ProductionNote.ts';
import {
  bodyText,
  sanitizeNoteHtml,
  stripQuoted,
  transcriptOf,
} from '../../../domain/mail/services/threading.ts';
import { badRequest, notFound } from '../../../shared/errors.ts';
import type { ManageMail } from './ManageMail.ts';

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
  private readonly ai: MailAi;
  private readonly notes: ProductionNoteRepository;

  constructor(mail: ManageMail, store: MailStore, ai: MailAi, notes: ProductionNoteRepository) {
    this.mail = mail;
    this.store = store;
    this.ai = ai;
    this.notes = notes;
  }

  private async ask(system: string, prompt: string): Promise<string> {
    const context = this.mail.aiContext();
    return this.ai.complete({
      apiKey: context.apiKey,
      model: context.model,
      system: `${BASE_SYSTEM(context.fromName)}\n\n${system}`,
      prompt,
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
          `${INTENTS[request.intent](this.mail.aiContext().rates)}\n- ${DRAFT_RULES}`,
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
    }
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
    const content = `<p><em>D’après le fil « ${escapeHtml(thread.subject)} » (${thread.messageCount} message${thread.messageCount > 1 ? 's' : ''}).</em></p>${html}`;
    const title = `Échanges — ${thread.subject}`.slice(0, 200);

    if (thread.noteId) {
      try {
        return this.notes.update(thread.productionId, thread.noteId, { title, content });
      } catch {
        // La note appartient à une autre vidéo (le rattachement a changé) : on en crée une.
      }
    }
    const note = this.notes.create(thread.productionId, { title, content });
    this.store.setThreadNote(threadId, note.id);
    return note;
  }
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
