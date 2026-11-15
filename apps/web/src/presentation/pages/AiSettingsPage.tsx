import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAiSettings, useUpdateAiSettings } from '../../application/ai/usecases/useAi.ts';
import {
  AI_PROVIDERS,
  formatDollars,
  type AiProvider,
  type AiSettingsView,
} from '../../domain/ai/entities/Ai.ts';
import { formatDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';

const keyPlaceholder = (view: AiSettingsView): string => {
  const { envKey, keyExample } = AI_PROVIDERS[view.provider];
  if (view.keySource === 'env') return `Définie par ${envKey}`;
  if (view.keySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.keySource === 'app') return '•••••••• (enregistrée)';
  return view.secretsKeyConfigured ? keyExample : 'SECRETS_KEY requise';
};

const Form = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(view.model);
  const provider = AI_PROVIDERS[view.provider];
  const locked = view.keySource === 'env' || !view.secretsKeyConfigured;

  const save = () =>
    update.mutate(
      // Une clé laissée vide veut dire « je n'y touche pas », pas « efface-la ».
      { provider: view.provider, model, ...(apiKey ? { apiKey } : {}) },
      { onSuccess: () => setApiKey('') },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{provider.label}</CardTitle>
        <CardDescription>
          Utilisé par la boîte mail (résumés, traductions, brouillons, vérification des dates) et
          par les fiches de vidéo (script, titres, tags, description). Le contenu concerné est
          transmis au fournisseur lors de la demande. L’envoi d’un mail demande ta confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">Clé API</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              disabled={locked}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={keyPlaceholder(view)}
            />
            {view.keySource === 'app' && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                disabled={update.isPending}
                onClick={() => update.mutate({ provider: view.provider, apiKey: null })}
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
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <datalist id="ai-models">
              {provider.models.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </datalist>
          </div>
        </div>
        {!view.secretsKeyConfigured && view.keySource !== 'env' && (
          <p className="text-xs text-muted-foreground">
            <code>SECRETS_KEY</code> n’est pas définie côté serveur : la clé ne peut pas être
            enregistrée depuis l’écran. Ajoute-la à la stack, ou passe par{' '}
            <code>{provider.envKey}</code>.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
          <span className="text-sm text-muted-foreground">
            {view.configured ? 'Assistant prêt.' : 'Aucune clé : l’assistant est désactivé.'}
          </span>
          {update.error && <span className="text-sm text-destructive">{update.error.message}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

/** Le studio estime le reste à partir du dernier solde relevé chez le fournisseur. */
const CreditCard = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const [balance, setBalance] = useState('');
  const { credit } = view;
  const amount = Number(balance.replace(',', '.'));
  const valid = balance.trim() !== '' && Number.isFinite(amount) && amount >= 0;

  const save = () =>
    update.mutate(
      { provider: view.provider, creditBalance: amount },
      { onSuccess: () => setBalance('') },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crédits</CardTitle>
        <CardDescription>
          Relève le solde dans la{' '}
          <a
            href={AI_PROVIDERS[view.provider].billingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            page de facturation
          </a>{' '}
          et note-le ici, le studio en retire ce qu’il consomme. Une clé utilisée ailleurs n’est pas
          comptée : c’est une estimation, à recaler de temps en temps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {credit.exhausted && (
          <p className="text-sm font-medium text-destructive">
            L’API a répondu que le solde était épuisé. Recharge-le, puis note le nouveau montant.
          </p>
        )}
        {credit.unpriced ? (
          <p className="text-sm text-muted-foreground">
            Le tarif d’au moins un appel est inconnu. Relève à nouveau le solde pour reprendre
            l’estimation.
          </p>
        ) : credit.remainingCents !== null ? (
          <div className="space-y-1">
            <p
              className={cn(
                'tabular text-2xl font-semibold',
                credit.low && 'text-[var(--expense)]',
                credit.exhausted && 'text-destructive',
              )}
            >
              ≈ {formatDollars(credit.remainingCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDollars(credit.balanceCents ?? 0)} relevés
              {credit.setAt ? ` le ${formatDate(credit.setAt.slice(0, 10))}` : ''}, dont{' '}
              {formatDollars(credit.spentCents)} consommés par le studio depuis.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun solde noté : le studio ne peut pas te prévenir avant qu’il soit épuisé.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-credit">Solde affiché par la Console ($)</Label>
            <Input
              id="ai-credit"
              inputMode="decimal"
              className="w-40"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="12,50"
            />
          </div>
          <Button variant="outline" onClick={save} disabled={!valid || update.isPending}>
            Noter ce solde
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/** Paramètres → API → Assistant IA. */
export const AiSettingsPage = () => {
  const { data } = useAiSettings();
  const update = useUpdateAiSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Assistant IA</h2>
      </div>
      {data ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider">Fournisseur actif</Label>
            <Select
              value={data.provider}
              onValueChange={(activeProvider: AiProvider) => update.mutate({ activeProvider })}
              disabled={update.isPending}
            >
              <SelectTrigger id="ai-provider" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AI_PROVIDERS).map(([id, provider]) => (
                  <SelectItem key={id} value={id}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
          </div>
          <Form key={data.provider} view={data} />
          {data.configured && <CreditCard key={data.provider} view={data} />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}
    </div>
  );
};
