import type { MailThreadView } from '../../../domain/mail/entities/Mail.ts';
import type { MailStore } from '../../../domain/mail/repositories/MailRepository.ts';
import type { ProductionNote } from '../../../domain/production/entities/ProductionNote.ts';
import type { ProductionNoteRepository } from '../../../domain/production/repositories/ProductionNoteRepository.ts';
import type { ManageMail } from './ManageMail.ts';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} ko`;

/**
 * La note « Échanges » qu'un fil tient dans la fiche de sa vidéo : la partie rédigée par
 * l'IA (`note_body`, gardée) **et les pièces jointes du fil**, en liens de téléchargement.
 *
 * **Une seule note par fil** (`mail_threads.note_id`), réécrite à chaque passage. Trois
 * déclencheurs, et c'est ce qui rend les pièces jointes « naturelles » :
 *
 * - rattacher le fil à une vidéo — la note naît avec les pièces déjà reçues ;
 * - un relevé qui apporte un message avec pièce jointe dans un fil rattaché ;
 * - « Écrire la note dans la vidéo » (l'IA), qui remplace la partie rédigée.
 *
 * Un fil sans pièce jointe ni texte de l'IA ne crée pas de note : une note vide dans la
 * fiche ne dirait rien. Les pièces sont téléchargées en base au passage, pour que les liens
 * survivent au mail rangé ou supprimé.
 */
export class MailVideoNotes {
  private readonly mail: ManageMail;
  private readonly store: MailStore;
  private readonly notes: ProductionNoteRepository;

  constructor(mail: ManageMail, store: MailStore, notes: ProductionNoteRepository) {
    this.mail = mail;
    this.store = store;
    this.notes = notes;
  }

  /** `body` : la nouvelle partie rédigée (l'IA) ; absent, celle déjà gardée est reprise. */
  async refresh(threadId: string, body?: string): Promise<ProductionNote | null> {
    const thread = this.mail.thread(threadId);
    if (!thread.productionId) return null;
    if (body !== undefined) this.store.setThreadNoteBody(threadId, body);
    const kept = body ?? this.store.threadNoteBody(threadId);

    const attachments = thread.messages.flatMap((message) =>
      message.attachments
        .filter((attachment) => attachment.id)
        .map((attachment) => ({ ...attachment, from: message.from, date: message.date })),
    );
    if (!kept && attachments.length === 0) return null;

    try {
      await this.mail.cacheAttachments(thread);
    } catch (error) {
      // Les liens restent : la pièce sera relue au premier clic tant que le mail est là.
      console.warn('[mail] pièces jointes non téléchargées :', error);
    }

    const content = [
      kept ?? `<p><em>Fil « ${escapeHtml(thread.subject)} » rattaché à cette vidéo.</em></p>`,
      attachments.length > 0
        ? `<h2>Pièces jointes</h2><ul>${attachments
            .map(
              (attachment) =>
                `<li><a href="/api/mails/attachments/${attachment.id}">${escapeHtml(attachment.filename)}</a> — ${formatSize(attachment.size)}, de ${escapeHtml(attachment.from.name || attachment.from.address)}</li>`,
            )
            .join('')}</ul>`
        : '',
    ].join('');
    return this.write(thread, content);
  }

  /** Les fils touchés par un relevé : seuls ceux rattachés à une vidéo ont une note. */
  async refreshMany(threadIds: string[]): Promise<void> {
    for (const id of threadIds) {
      try {
        await this.refresh(id);
      } catch (error) {
        console.warn(`[mail] note du fil ${id} :`, error);
      }
    }
  }

  private write(thread: MailThreadView, content: string): ProductionNote {
    const title = `Échanges — ${thread.subject}`.slice(0, 200);
    if (thread.noteId) {
      try {
        return this.notes.update(thread.productionId!, thread.noteId, { title, content });
      } catch {
        // La note appartient à une autre vidéo (le rattachement a changé) : on en crée une.
      }
    }
    const note = this.notes.create(thread.productionId!, { title, content });
    this.store.setThreadNote(thread.id, note.id);
    return note;
  }
}
