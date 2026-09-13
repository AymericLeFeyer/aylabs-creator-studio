import { useState } from 'react';
import {
  usePlanningSettings,
  useUpdatePlanningSettings,
} from '../../../application/planning/usecases/usePlanning.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

/** Placeholder du champ de clé, selon d'où vient celle qui est en service. */
const KEY_PLACEHOLDERS = {
  env: 'Fournie par TODO_API_KEY',
  app: '•••••••• (enregistrée)',
  unreadable: 'Illisible (SECRETS_KEY a changé) : ressaisis-la',
  none: 'Facultative si Todo tourne sans mot de passe',
} as const;

/**
 * La connexion à l'app Todo.
 *
 * Une adresse, une clé API facultative — une instance sans `APP_PASSWORD` répond sans —, et
 * un filtre par tags pour ne voir que ce qui concerne le travail. La clé est **chiffrée**
 * avant d'être rangée et ne redescend jamais : le champ reste vide et n'écrase rien tant
 * qu'on n'y tape pas quelque chose, comme le jeton de l'agenda.
 */
export const TodoConnectionCard = () => {
  const { data: settings } = usePlanningSettings();
  const update = useUpdatePlanningSettings();
  const todo = settings?.todo;

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [tags, setTags] = useState<string | null>(null);

  const url = baseUrl ?? todo?.baseUrl ?? '';
  const tagText = tags ?? (todo?.tags ?? []).join(', ');
  const keyFromEnv = todo?.keySource === 'env';

  const save = () => {
    const trimmed = url.trim();
    update.mutate(
      {
        ...(todo?.baseUrlFromEnv
          ? {}
          : {
              // Le `https://` manquant est complété, comme pour Home Assistant.
              todoBaseUrl: trimmed
                ? /^https?:\/\//.test(trimmed)
                  ? trimmed
                  : `https://${trimmed}`
                : null,
            }),
        ...(apiKey ? { todoApiKey: apiKey } : {}),
        todoTags: tagText
          .split(',')
          .map((tag) => tag.trim().replace(/^#/, ''))
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          setApiKey('');
          setBaseUrl(null);
          setTags(null);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Todo</CardTitle>
        <CardDescription>
          Tes tâches s’affichent sous chaque jour du planning. Coche-les sur place, ou glisse-les
          dans la journée pour leur réserver une heure — le planning ne posera rien par-dessus.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="todo-url">Adresse de l’app</Label>
          <Input
            id="todo-url"
            placeholder="https://todo.mondomaine.fr"
            value={url}
            disabled={todo?.baseUrlFromEnv}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
          {todo?.baseUrlFromEnv && (
            <p className="text-xs text-muted-foreground">Fournie par TODO_BASE_URL.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="todo-key">Clé API</Label>
          <Input
            id="todo-key"
            type="password"
            autoComplete="off"
            disabled={keyFromEnv}
            placeholder={KEY_PLACEHOLDERS[todo?.keySource ?? 'none']}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Todo → Réglages → Clés API. Laisse vide pour conserver celle qui est enregistrée.
          </p>
          {todo && !todo.secretsKeyConfigured && !keyFromEnv && (
            <p className="text-xs text-[var(--negative)]">
              SECRETS_KEY absente : la clé ne peut pas être enregistrée depuis l’écran. Renseigne
              SECRETS_KEY, ou passe la clé par TODO_API_KEY.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="todo-tags">Tags à afficher</Label>
          <Input
            id="todo-tags"
            placeholder="aylabs, montage"
            value={tagText}
            onChange={(event) => setTags(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Séparés par des virgules. Vide : toutes tes tâches datées.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {todo?.baseUrl && !todo.baseUrlFromEnv && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update.mutate({
                  todoBaseUrl: null,
                  ...(keyFromEnv ? {} : { todoApiKey: '' }),
                })
              }
              title="Ne plus afficher les tâches Todo"
            >
              Déconnecter
            </Button>
          )}
        </div>

        {update.error && (
          <p className="text-sm text-destructive">
            {update.error instanceof Error ? update.error.message : 'Enregistrement impossible'}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
