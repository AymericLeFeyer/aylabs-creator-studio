import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAiSettings, useUpdateAiSettings } from '../../application/ai/usecases/useAi.ts';
import { AI_MODELS, formatDollars, type AiSettingsView } from '../../domain/ai/entities/Ai.ts';
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

const keyPlaceholder = (view: AiSettingsView): string => {
  if (view.keySource === 'env') return 'Définie par ANTHROPIC_API_KEY';
  if (view.keySource === 'unreadable') return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (view.keySource === 'app') return '•••••••• (enregistrée)';
  return view.secretsKeyConfigured ? 'sk-ant-…' : 'SECRETS_KEY requise';
};

const Form = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(view.model);
  const locked = view.keySource === 'env' || !view.secretsKeyConfigured;

  const save = () =>
    update.mutate(
      // Une clé laissée vide veut dire « je n'y touche pas », pas « efface-la ».
      { model, ...(apiKey ? { apiKey } : {}) },
      { onSuccess: () => setApiKey('') },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude (Anthropic)</CardTitle>
        <CardDescription>
          Utilisé par la boîte mail (résumés, traductions, brouillons, vérification des dates) et
          par les fiches de vidéo (script, titres, tags, description). L’IA ne fait que proposer :{' '}
          <strong>elle n’envoie aucun mail</strong> et ne modifie rien sans ton clic. Le contenu
          concerné part à l’API d’Anthropic au moment où tu cliques, et seulement là.
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
                onClick={() => update.mutate({ apiKey: null })}
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
              {AI_MODELS.map((entry) => (
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
            <code>ANTHROPIC_API_KEY</code>.
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

/**
 * Le solde de crédits. **Une estimation** : Anthropic n'expose aucun solde par API. On part
 * de ce qu'affiche la Console, et le studio retire ce qu'il consomme.
 */
const CreditCard = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const [balance, setBalance] = useState('');
  const { credit } = view;
  const amount = Number(balance.replace(',', '.'));
  const valid = balance.trim() !== '' && Number.isFinite(amount) && amount >= 0;

  const save = () => update.mutate({ creditBalance: amount }, { onSuccess: () => setBalance('') });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crédits</CardTitle>
        <CardDescription>
          Anthropic ne donne pas accès au solde par API : relève-le dans la{' '}
          <a
            href="https://platform.claude.com/settings/billing"
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            Console
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
        {credit.remainingCents !== null ? (
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Assistant IA</h2>
        <p className="text-sm text-muted-foreground">Une clé, un modèle, pour tout le studio.</p>
      </div>
      {data ? (
        <>
          <Form view={data} />
          {data.configured && <CreditCard view={data} />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}
    </div>
  );
};
