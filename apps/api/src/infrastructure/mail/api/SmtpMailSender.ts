import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { MailConnection, OutgoingMail } from '../../../domain/mail/entities/Mail.ts';
import type { MailSender } from '../../../domain/mail/repositories/MailRepository.ts';
import { upstream } from '../../../shared/errors.ts';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * L'envoi, par SMTP. **Le seul endroit du studio qui fait partir un mail**, et il n'est
 * appelé que par `SendMail`, lui-même appelé par la seule route `POST /api/mails/send`.
 *
 * Le message est composé **une fois** (`MailComposer`) : la même source part au serveur
 * SMTP et se range dans les envoyés, si bien que le `Message-ID` des deux est identique et
 * que la réponse suivante retrouve son fil.
 */
export class SmtpMailSender implements MailSender {
  async send(connection: MailConnection, mail: OutgoingMail) {
    const domain = connection.fromAddress.split('@')[1] ?? 'localhost';
    const messageId = `<${randomUUID()}@${domain}>`;
    const options = {
      from: { name: connection.fromName, address: connection.fromAddress },
      to: mail.to.map((entry) => ({ name: entry.name, address: entry.address })),
      cc: mail.cc.map((entry) => ({ name: entry.name, address: entry.address })),
      subject: mail.subject,
      text: mail.text,
      html: `<div style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(mail.text)}</div>`,
      messageId,
      inReplyTo: mail.inReplyTo ?? undefined,
      references: mail.references.length > 0 ? mail.references : undefined,
      date: new Date(),
    };
    const raw = await new MailComposer(options).compile().build();

    const transport = nodemailer.createTransport({
      host: connection.smtp.host,
      port: connection.smtp.port,
      secure: connection.smtp.secure,
      auth: { user: connection.username, pass: connection.password },
      ...(connection.allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
    });
    try {
      await transport.sendMail({
        envelope: {
          from: connection.fromAddress,
          to: [...mail.to, ...mail.cc].map((entry) => entry.address),
        },
        raw,
      });
    } catch (error) {
      throw upstream(
        `Envoi refusé par le serveur SMTP : ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      transport.close();
    }
    return { raw, messageId };
  }
}
