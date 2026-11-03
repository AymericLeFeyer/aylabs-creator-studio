import type { SeenContact } from '../../../domain/brand/entities/BrandContact.ts';
import type { BrandContactRepository } from '../../../domain/brand/repositories/BrandContactRepository.ts';
import type { MailThreadView } from '../../../domain/mail/entities/Mail.ts';

/** Ce dont le carnet a besoin de la boîte mail : un fil, et mes propres adresses. */
export interface ContactMailSource {
  thread(id: string): MailThreadView;
  scope(): { mine: string[] };
}

/**
 * Le carnet de contacts des marques, alimenté par les mails.
 *
 * Deux déclencheurs, tous deux sans clic de plus : **rattacher un fil à une marque**
 * (route `PATCH /api/mails/threads/:id`) et **un relevé qui apporte un message** dans un fil
 * déjà rattaché (`ManageMail.onThreadsChanged`). Les interlocuteurs d'un message reçu sont
 * son expéditeur ; ceux d'un message envoyé, ses destinataires (À et Cc) — moi exclu.
 */
export class ManageBrandContacts {
  private readonly contacts: BrandContactRepository;
  private readonly mail: ContactMailSource;

  constructor(contacts: BrandContactRepository, mail: ContactMailSource) {
    this.contacts = contacts;
    this.mail = mail;
  }

  /** Enregistre les interlocuteurs d'un fil dans le carnet de sa marque. Rien sans marque. */
  recordThread(threadId: string): void {
    const thread = this.mail.thread(threadId);
    if (!thread.brandId) return;
    const mine = new Set(this.mail.scope().mine);
    const seen = new Map<string, SeenContact>();
    for (const message of thread.messages) {
      const people = message.outgoing ? [...message.to, ...message.cc] : [message.from];
      for (const person of people) {
        const email = person.address.trim().toLowerCase();
        if (!email.includes('@') || mine.has(email)) continue;
        const known = seen.get(email);
        const name = person.name.trim() || known?.name || '';
        if (!known || message.date > known.date) {
          seen.set(email, { email, name, date: message.date });
        } else if (!known.name && name) {
          known.name = name;
        }
      }
    }
    this.contacts.recordSeen(thread.brandId, [...seen.values()]);
  }

  /** Après un relevé : un échec ne doit pas faire échouer le relevé. */
  recordThreads(threadIds: string[]): void {
    for (const id of threadIds) {
      try {
        this.recordThread(id);
      } catch (error) {
        console.warn(`[contacts] fil ${id} non enregistré :`, error);
      }
    }
  }
}
