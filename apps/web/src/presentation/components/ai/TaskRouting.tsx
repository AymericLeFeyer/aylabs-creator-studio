import { Lock } from 'lucide-react';
import { useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import {
  AI_PROVIDERS,
  type AiProvider,
  type AiSettingsView,
  type AiTask,
  type AiTaskView,
} from '../../../domain/ai/entities/Ai.ts';
import { Badge } from '../ui/badge.tsx';
import { Card, CardContent } from '../ui/card.tsx';
import { Segmented } from './Segmented.tsx';

type Choice = 'default' | AiProvider;

const TaskRow = ({
  task,
  view,
  disabled,
  onChange,
}: {
  task: AiTaskView;
  view: AiSettingsView;
  disabled: boolean;
  onChange: (task: AiTask, choice: Choice) => void;
}) => {
  const enabled = view.providers.filter((provider) => provider.enabled);
  const chosen = task.provider;
  const unavailable = chosen !== null && chosen !== task.effectiveProvider;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-medium">{task.label}</p>
        <p className="text-xs text-muted-foreground">{task.description}</p>
        {task.effectiveProvider === null ? (
          <p className="mt-0.5 text-xs text-destructive">
            Aucun fournisseur utilisable : active-en un et renseigne sa clé.
          </p>
        ) : (
          unavailable &&
          !task.fixedProvider && (
            <p className="mt-0.5 text-xs text-[var(--expense)]">
              {AI_PROVIDERS[chosen].short} est indisponible :{' '}
              {AI_PROVIDERS[task.effectiveProvider].short} répond à sa place.
            </p>
          )
        )}
      </div>
      {task.fixedProvider ? (
        <Badge variant="secondary" className="gap-1.5">
          <Lock className="h-3 w-3" />
          {AI_PROVIDERS[task.fixedProvider].short} uniquement
        </Badge>
      ) : (
        <Segmented<Choice>
          label={task.label}
          value={
            chosen && enabled.some((provider) => provider.provider === chosen) ? chosen : 'default'
          }
          disabled={disabled}
          onChange={(choice) => onChange(task.task, choice)}
          options={[
            { value: 'default', label: 'Défaut' },
            ...enabled.map((provider) => ({
              value: provider.provider as Choice,
              label: AI_PROVIDERS[provider.provider].short,
              disabled: !provider.configured,
              title: provider.configured ? undefined : 'Pas de clé',
            })),
          ]}
        />
      )}
    </li>
  );
};

/** Quel fournisseur fait quoi : un par défaut, et un choix par tâche. */
export const TaskRouting = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const enabled = view.providers.filter((provider) => provider.enabled);
  const groups = [...new Set(view.tasks.map((task) => task.group))];
  const setRoute = (task: AiTask, choice: Choice) =>
    update.mutate({ routes: { [task]: choice === 'default' ? null : choice } });

  if (enabled.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Aucun fournisseur n’est activé : les boutons d’IA sont masqués dans tout le studio.
          Active-en un ci-dessus pour choisir qui fait quoi.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-5">
        <div>
          <h3 className="font-semibold">Qui fait quoi</h3>
          <p className="text-sm text-muted-foreground">
            Le fournisseur par défaut répond à toute tâche qui n’a pas de choix à elle.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Fournisseur par défaut</p>
            <p className="text-xs text-muted-foreground">Pour toutes les tâches « Défaut ».</p>
          </div>
          {enabled.length > 1 ? (
            <Segmented<AiProvider>
              label="Fournisseur par défaut"
              value={view.defaultProvider}
              disabled={update.isPending}
              onChange={(defaultProvider) => update.mutate({ defaultProvider })}
              options={enabled.map((provider) => ({
                value: provider.provider,
                label: AI_PROVIDERS[provider.provider].short,
              }))}
            />
          ) : (
            <Badge variant="outline">{AI_PROVIDERS[enabled[0]!.provider].short}</Badge>
          )}
        </div>

        {groups.map((group) => (
          <section key={group}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h4>
            <ul className="divide-y">
              {view.tasks
                .filter((task) => task.group === group)
                .map((task) => (
                  <TaskRow
                    key={task.task}
                    task={task}
                    view={view}
                    disabled={update.isPending}
                    onChange={setRoute}
                  />
                ))}
            </ul>
          </section>
        ))}
        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      </CardContent>
    </Card>
  );
};
