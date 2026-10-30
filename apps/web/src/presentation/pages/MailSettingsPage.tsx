import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  useMailSettings,
  useTestMail,
  useUpdateMailSettings,
} from '../../application/mail/usecases/useMails.ts';
import {
  AI_MODELS,
  type MailSettingsInput,
  type MailSettingsView,
  type SecretSource,
} from '../../domain/mail/entities/Mail.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Input, Textarea } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Switch } from '../components/ui/switch.tsx';

/** Les réglages courants des grandes messageries, pour ne pas avoir à les chercher. */
interface Preset {
  label: string;
  imap: string;
  smtp: string;
  hint?: string;
  /** Défauts : IMAPS 993 et SMTPS 465, certificat vérifié. */
  imapPort?: number;
  smtpPort?: number;
  secure?: boolean;
  selfSigned?: boolean;
}

const PRESETS: Preset[] = [
  {
    // Le conteneur `protonmail-bridge` de la stack (docker-compose.yml) : STARTTLS sur les
    // ports internes 143 / 25, certificat auto-signé.
    label: 'Proton (Bridge)',
    imap: 'protonmail-bridge',
    smtp: 'protonmail-bridge',
    imapPort: 143,
    smtpPort: 25,
    secure: false,
    selfSigned: true,
    hint: 'Identifiant et mot de passe : ceux affichés par la commande « info » de Bridge, pas ceux de ton compte Proton. Voir la procédure en tête du service dans docker-compose.yml.',
  },
  {
    label: 'Gmail',
    imap: 'imap.gmail.com',
    smtp: 'smtp.gmail.com',
    hint: 'Gmail demande un « mot de passe d’application » (compte Google → Sécurité → Validation en deux étapes → Mots de passe des applications), pas ton mot de passe habituel.',
  },
  { label: 'Outlook / Office 365', imap: 'outlook.office365.com', smtp: 'smtp.office365.com' },
  { label: 'OVH', imap: 'ssl0.ovh.net', smtp: 'ssl0.ovh.net' },
  {
    label: 'iCloud',
    imap: 'imap.mail.me.com',
    smtp: 'smtp.mail.me.com',
    hint: 'iCloud demande un mot de passe d’application (appleid.apple.com).',
  },
  { label: 'Infomaniak', imap: 'mail.infomaniak.com', smtp: 'mail.infomaniak.com' },
];

const secretPlaceholder = (source: SecretSource, envVar: string, secretsKey: boolean): string => {
  if (source === 'env') return `Défini par ${envVar}`;
  if (source === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (source === 'app') return '•••••••• (enregistré)';
  return secretsKey ? '' : 'SECRETS_KEY requise';
};

type Draft = Omit<MailSettingsInput, 'password' | 'aiApiKey'> & {
  password: string;
  aiApiKey: string;
};

const draftOf = (view: MailSettingsView): Draft => ({
  imapHost: view.imapHost ?? '',
  imapPort: view.imapPort,
  imapSecure: view.imapSecure,
  smtpHost: view.smtpHost ?? '',
  smtpPort: view.smtpPort,
  smtpSecure: view.smtpSecure,
  allowSelfSigned: view.allowSelfSigned,
  username: view.username ?? '',
  password: '',
  fromName: view.fromName,
  fromAddress: view.fromAddress ?? '',
  signature: view.signature,
  rates: view.rates,
  syncDays: view.syncDays,
  aiApiKey: '',
  aiModel: view.aiModel,
});

const Form = ({ view }: { view: MailSettingsView }) => {
  const update = useUpdateMailSettings();
  const test = useTestMail();
  const [draft, setDraft] = useState<Draft>(() => draftOf(view));
  const [hint, setHint] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    const { password, aiApiKey, ...rest } = draft;
    const input: MailSettingsInput = { ...rest };
    // Un secret laissé vide veut dire « je n'y touche pas », pas « efface-le ».
    if (password) input.password = password;
    if (aiApiKey) input.aiApiKey = aiApiKey;
    update.mutate(input, { onSuccess: () => set({ password: '', aiApiKey: '' }) });
  };

  const secretsLocked = !view.secretsKeyConfigured;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Connexion à la boîte mail</CardTitle>
          <CardDescription>
            IMAP pour relever (réception et envoyés, toutes les 5 minutes), SMTP pour envoyer. Le
            mot de passe est chiffré en base et ne ressort jamais de l’API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="outline"
                onClick={() => {
                  set({
                    imapHost: preset.imap,
                    imapPort: preset.imapPort ?? 993,
                    imapSecure: preset.secure ?? true,
                    smtpHost: preset.smtp,
                    smtpPort: preset.smtpPort ?? 465,
                    smtpSecure: preset.secure ?? true,
                    allowSelfSigned: preset.selfSigned ?? false,
                  });
                  setHint(preset.hint ?? null);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="imap-host">Serveur IMAP</Label>
              <Input
                id="imap-host"
                value={draft.imapHost ?? ''}
                onChange={(e) => set({ imapHost: e.target.value })}
                placeholder="imap.exemple.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imap-port">Port</Label>
              <Input
                id="imap-port"
                type="number"
                value={draft.imapPort}
                onChange={(e) => set({ imapPort: Number(e.target.value) })}
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <Switch
                checked={draft.imapSecure}
                onCheckedChange={(imapSecure) => set({ imapSecure })}
              />
              SSL/TLS
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">Serveur SMTP</Label>
              <Input
                id="smtp-host"
                value={draft.smtpHost ?? ''}
                onChange={(e) => set({ smtpHost: e.target.value })}
                placeholder="smtp.exemple.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                value={draft.smtpPort}
                onChange={(e) => set({ smtpPort: Number(e.target.value) })}
              />
            </div>
            <label
              className="flex h-9 items-center gap-2 text-sm"
              title="Port 465 : SSL activé. Port 587 : désactivé (STARTTLS)."
            >
              <Switch
                checked={draft.smtpSecure}
                onCheckedChange={(smtpSecure) => set({ smtpSecure })}
              />
              SSL/TLS
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Switch
              checked={draft.allowSelfSigned}
              onCheckedChange={(allowSelfSigned) => set({ allowSelfSigned })}
            />
            <span>
              Accepter un certificat auto-signé
              <span className="block text-xs text-muted-foreground">
                Pour Proton Mail Bridge, joint par le réseau interne de la stack. La connexion reste
                chiffrée, seule la vérification du certificat saute : à ne jamais cocher pour un
                serveur sur Internet.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mail-user">Identifiant</Label>
              <Input
                id="mail-user"
                autoComplete="off"
                value={draft.username ?? ''}
                onChange={(e) => set({ username: e.target.value })}
                placeholder="toi@exemple.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mail-password">Mot de passe</Label>
              <Input
                id="mail-password"
                type="password"
                autoComplete="new-password"
                disabled={view.passwordSource === 'env' || secretsLocked}
                value={draft.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder={secretPlaceholder(
                  view.passwordSource,
                  'MAIL_PASSWORD',
                  view.secretsKeyConfigured,
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mail-from-name">Nom affiché</Label>
              <Input
                id="mail-from-name"
                value={draft.fromName ?? ''}
                onChange={(e) => set({ fromName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mail-from">Adresse d’expédition</Label>
              <Input
                id="mail-from"
                value={draft.fromAddress ?? ''}
                onChange={(e) => set({ fromAddress: e.target.value })}
                placeholder="Par défaut : l’identifiant"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mail-days">Historique relevé (jours)</Label>
              <Input
                id="mail-days"
                type="number"
                min={1}
                max={365}
                value={draft.syncDays}
                onChange={(e) => set({ syncDays: Number(e.target.value) })}
              />
            </div>
          </div>
          {secretsLocked && (
            <p className="text-xs text-muted-foreground">
              <code>SECRETS_KEY</code> n’est pas définie côté serveur : le mot de passe ne peut pas
              être enregistré depuis l’écran (rien n’est stocké en clair). Ajoute-la à la stack, ou
              passe par <code>MAIL_PASSWORD</code>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rédaction</CardTitle>
          <CardDescription>
            La signature s’ajoute sous chaque message (modifiable avant l’envoi). Les tarifs servent
            au bouton « Voici mes tarifs » : l’IA les reprend tels quels, sans jamais inventer de
            montant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mail-signature">Signature</Label>
            <Textarea
              id="mail-signature"
              rows={4}
              value={draft.signature ?? ''}
              onChange={(e) => set({ signature: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-rates">Mes tarifs</Label>
            <Textarea
              id="mail-rates"
              rows={6}
              value={draft.rates ?? ''}
              onChange={(e) => set({ rates: e.target.value })}
              placeholder={'Intégration 60 s : 800 €\nVidéo dédiée : 2 500 €\nShort : 400 €'}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assistant IA (Claude)</CardTitle>
          <CardDescription>
            Résumés, traductions, relances et brouillons. L’IA ne fait que proposer du texte :{' '}
            <strong>aucun mail ne part sans que tu le confirmes</strong>. Le contenu des mails
            concernés est envoyé à l’API d’Anthropic au moment où tu cliques.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">Clé API Anthropic</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              disabled={view.aiKeySource === 'env' || secretsLocked}
              value={draft.aiApiKey}
              onChange={(e) => set({ aiApiKey: e.target.value })}
              placeholder={
                secretPlaceholder(
                  view.aiKeySource,
                  'ANTHROPIC_API_KEY',
                  view.secretsKeyConfigured,
                ) || 'sk-ant-…'
              }
            />
            {view.aiKeySource === 'app' && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => update.mutate({ aiApiKey: null })}
              >
                Effacer la clé
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modèle</Label>
            <Input
              id="ai-model"
              list="ai-models"
              value={draft.aiModel ?? ''}
              onChange={(e) => set({ aiModel: e.target.value })}
            />
            <datalist id="ai-models">
              {AI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending || !view.configured}
        >
          {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Tester la connexion
        </Button>
        {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
        {test.error && <span className="text-sm text-destructive">{test.error.message}</span>}
        {test.data && (
          <span className="flex items-center gap-1 text-sm text-[var(--positive)]">
            <CheckCircle2 className="h-4 w-4" /> Connexion OK : {test.data.folders.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
};

/** Paramètres → Admin → Mails : la connexion, la rédaction, et l'assistant. */
export const MailSettingsPage = () => {
  const { data } = useMailSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mails</h2>
        <p className="text-sm text-muted-foreground">
          La boîte relevée dans Admin → Mails. Le studio n’envoie jamais rien tout seul.
        </p>
      </div>
      {data ? <Form view={data} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
    </div>
  );
};
