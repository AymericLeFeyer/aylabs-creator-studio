import type { DatabaseSync } from 'node:sqlite';
import type { StoredMailSettings } from '../../../domain/mail/entities/Mail.ts';
import type { MailSettingsRepository } from '../../../domain/mail/repositories/MailRepository.ts';

interface Row {
  imap_host: string | null;
  imap_port: number;
  imap_secure: number;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: number;
  allow_self_signed: number;
  username: string | null;
  password: string | null;
  from_name: string;
  from_address: string | null;
  signature: string;
  rates: string;
  addresses: string;
  move_folders: string;
  sync_days: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

const ROW_ID = 'default';

const COLUMNS: Record<keyof StoredMailSettings, string> = {
  imapHost: 'imap_host',
  imapPort: 'imap_port',
  imapSecure: 'imap_secure',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpSecure: 'smtp_secure',
  allowSelfSigned: 'allow_self_signed',
  username: 'username',
  encryptedPassword: 'password',
  fromName: 'from_name',
  fromAddress: 'from_address',
  signature: 'signature',
  rates: 'rates',
  addresses: 'addresses',
  moveFolders: 'move_folders',
  syncDays: 'sync_days',
  lastSyncAt: 'last_sync_at',
  lastSyncError: 'last_sync_error',
};

/**
 * La ligne unique des réglages mail. Le dépôt ne range que du **chiffré** pour le mot de
 * passe et la clé de l'IA : c'est `ManageMail` qui chiffre et déchiffre.
 */
export class SqliteMailSettingsRepository implements MailSettingsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(): StoredMailSettings {
    const now = new Date().toISOString();
    // La migration insère la ligne ; ce filet ne sert qu'à une base recopiée.
    this.db
      .prepare('INSERT OR IGNORE INTO mail_settings (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(ROW_ID, now, now);
    const row = this.db
      .prepare('SELECT * FROM mail_settings WHERE id = ?')
      .get(ROW_ID) as unknown as Row;
    return {
      imapHost: row.imap_host,
      imapPort: row.imap_port,
      imapSecure: row.imap_secure === 1,
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      smtpSecure: row.smtp_secure === 1,
      allowSelfSigned: row.allow_self_signed === 1,
      username: row.username,
      encryptedPassword: row.password,
      fromName: row.from_name,
      fromAddress: row.from_address,
      signature: row.signature,
      rates: row.rates,
      addresses: row.addresses.split('\n').filter(Boolean),
      moveFolders: row.move_folders.split('\n').filter(Boolean),
      syncDays: row.sync_days,
      lastSyncAt: row.last_sync_at,
      lastSyncError: row.last_sync_error,
    };
  }

  update(patch: Partial<StoredMailSettings>): void {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    for (const [key, value] of Object.entries(patch) as Array<
      [keyof StoredMailSettings, StoredMailSettings[keyof StoredMailSettings]]
    >) {
      if (value === undefined) continue;
      fields.push(`${COLUMNS[key]} = ?`);
      values.push(
        typeof value === 'boolean'
          ? value
            ? 1
            : 0
          : Array.isArray(value)
            ? value.join('\n')
            : value,
      );
    }
    if (fields.length === 0) return;
    this.get();
    fields.push('updated_at = ?');
    values.push(new Date().toISOString(), ROW_ID);
    this.db.prepare(`UPDATE mail_settings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
}
