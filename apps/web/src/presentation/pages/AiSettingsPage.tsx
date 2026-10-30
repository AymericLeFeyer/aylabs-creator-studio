import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAiSettings, useUpdateAiSettings } from '../../application/ai/usecases/useAi.ts';
import { AI_MODELS, type AiSettingsView } from '../../domain/ai/entities/Ai.ts';
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
          par ce qui viendra ensuite. L’IA ne fait que proposer :{' '}
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

/** Paramètres → API → Assistant IA. */
export const AiSettingsPage = () => {
  const { data } = useAiSettings();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Assistant IA</h2>
        <p className="text-sm text-muted-foreground">Une clé, un modèle, pour tout le studio.</p>
      </div>
      {data ? <Form view={data} /> : <p className="text-sm text-muted-foreground">Chargement…</p>}
    </div>
  );
};
