import { createHash, randomBytes } from 'node:crypto';
import type { MailDraft, MailDraftIntent } from '../../../domain/mail/entities/Mail.ts';
import type { MailDraftRepository } from '../../../domain/mail/repositories/MailRepository.ts';
import { replySubject, replyTargets } from '../../../domain/mail/services/threading.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';
import type { MailAssistant } from './MailAssistant.ts';
import type { ManageMail } from './ManageMail.ts';

/** Un brouillon oublié ne doit pas rester envoyable indéfiniment. */
const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Ce que le MCP demande : une action rapide de l'écran, ou un texte déjà écrit. */
export type MailReplyRequest =
  | { kind: 'intent'; intent: MailDraftIntent; notes?: string }
  | { kind: 'follow_up' }
  | { kind: 'text'; text: string };

/**
 * Les réponses préparées depuis le MCP.
 *
 * **Le modèle prépare, un humain envoie.** `prepare` ne fait rien partir : il range un
 * brouillon et rend un jeton à usage unique, qui ne va qu'à la carte de confirmation
 * (`_meta`), jamais au modèle. Deux gestes seulement font partir le brouillon : le bouton
 * de cette carte (`confirm`), et « Envoyer maintenant » dans le studio.
 */
export class ManageMailDrafts {
  private readonly drafts: MailDraftRepository;
  private readonly mail: ManageMail;
  private readonly assistant: MailAssistant;

  constructor(drafts: MailDraftRepository, mail: ManageMail, assistant: MailAssistant) {
    this.drafts = drafts;
    this.mail = mail;
    this.assistant = assistant;
  }

  private async bodyOf(threadId: string, request: MailReplyRequest): Promise<string> {
    switch (request.kind) {
      case 'text':
        return request.text;
      case 'follow_up':
        return this.assistant.run(threadId, { action: 'follow_up' });
      case 'intent':
        return this.assistant.run(threadId, {
          action: 'draft',
          intent: request.intent,
          notes: request.notes,
        });
    }
  }

  async prepare(
    threadId: string,
    request: MailReplyRequest,
  ): Promise<{ draft: MailDraft; token: string }> {
    this.drafts.deleteOlderThan(new Date(Date.now() - DRAFT_LIFETIME_MS).toISOString());

    const thread = this.mail.thread(threadId);
    const to = replyTargets(thread.messages);
    if (to.length === 0) throw badRequest('Ce fil n’a personne à qui répondre.');

    const body = (await this.bodyOf(threadId, request)).trim();
    if (!body) throw badRequest('Le brouillon est vide.');

    const token = randomBytes(24).toString('base64url');
    const draft = this.drafts.create(
      {
        threadId,
        from: thread.replyFrom,
        to,
        cc: [],
        subject: replySubject(thread.subject),
        body,
        signature: this.mail.writingContext().signature,
      },
      hashToken(token),
    );
    return { draft, token };
  }

  find(id: string): MailDraft {
    const draft = this.drafts.find(id);
    if (!draft) throw notFound('Brouillon');
    return draft;
  }

  /** Abandonné, ou parti depuis le studio : sa carte ne doit plus pouvoir l'envoyer. */
  discard(id: string): void {
    this.drafts.delete(id);
  }

  private authorized(id: string, token: string): MailDraft {
    const draft = this.drafts.findByToken(id, hashToken(token));
    if (!draft) throw conflict('Brouillon déjà traité ou expiré.');
    return draft;
  }

  /** Le bouton « Abandonner » de la carte. */
  cancel(id: string, token: string): void {
    this.authorized(id, token);
    this.drafts.delete(id);
  }

  /**
   * Le bouton « Envoyer » de la carte. `body` est le texte tel qu'il y a été relu, retouches
   * comprises. `claim` précède l'envoi : un double clic ne fait pas partir deux mails, et
   * un échec SMTP rend le brouillon pour réessayer.
   */
  async confirm(id: string, token: string, body: string): Promise<{ messageId: string }> {
    const draft = this.authorized(id, token);
    if (!body.trim()) throw badRequest('Le message est vide.');
    if (!this.drafts.claim(id)) throw conflict('Ce brouillon est déjà en cours d’envoi.');

    const signature = draft.signature.trim();
    try {
      const { messageId } = await this.mail.send({
        to: draft.to,
        cc: draft.cc,
        subject: draft.subject,
        text: signature ? `${body.trimEnd()}\n\n${signature}` : body.trimEnd(),
        threadId: draft.threadId,
        from: draft.from,
      });
      this.drafts.delete(id);
      return { messageId };
    } catch (error) {
      this.drafts.release(id);
      throw error;
    }
  }
}
