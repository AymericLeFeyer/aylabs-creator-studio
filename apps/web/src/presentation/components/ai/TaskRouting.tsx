import { useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import {
  AI_PROVIDERS,
  type AiProvider,
  type AiSettingsView,
  type AiTask,
} from '../../../domain/ai/entities/Ai.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';

const DEFAULT_VALUE = '__default__';

/** Quel fournisseur fait quoi : un par défaut, et un choix par tâche. */
export const TaskRouting = ({ view }: { view: AiSettingsView }) => {
  const update = useUpdateAiSettings();
  const ready = view.providers.filter((provider) => provider.configured);
  const groups = [...new Set(view.tasks.map((task) => task.group))];
  const setRoute = (task: AiTask, value: string) =>
    update.mutate({ routes: { [task]: value === DEFAULT_VALUE ? null : (value as AiProvider) } });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qui fait quoi</CardTitle>
        <CardDescription>
          Le fournisseur par défaut répond à toutes les tâches, sauf celles à qui tu en as confié un
          autre. Un fournisseur sans clé ne peut pas être choisi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Fournisseur par défaut</p>
            <p className="text-xs text-muted-foreground">Pour toute tâche sans choix à elle.</p>
          </div>
          <Select
            value={view.defaultProvider}
            onValueChange={(defaultProvider: AiProvider) => update.mutate({ defaultProvider })}
            disabled={update.isPending}
          >
            <SelectTrigger className="w-60 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.providers.map((provider) => (
                <SelectItem key={provider.provider} value={provider.provider}>
                  {AI_PROVIDERS[provider.provider].label}
                  {provider.configured ? '' : ' (pas de clé)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {groups.map((group) => (
          <section key={group} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h4>
            <ul className="divide-y">
              {view.tasks
                .filter((task) => task.group === group)
                .map((task) => {
                  const overridden =
                    task.provider !== null && task.provider !== task.effectiveProvider;
                  return (
                    <li
                      key={task.task}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{task.label}</p>
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                        {overridden && (
                          <p className="text-xs text-[var(--expense)]">
                            {AI_PROVIDERS[task.provider!].label} n’a plus de clé : c’est{' '}
                            {AI_PROVIDERS[task.effectiveProvider].label} qui répond.
                          </p>
                        )}
                      </div>
                      <Select
                        value={task.provider ?? DEFAULT_VALUE}
                        onValueChange={(value) => setRoute(task.task, value)}
                        disabled={update.isPending || ready.length === 0}
                      >
                        <SelectTrigger className="w-60 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_VALUE}>
                            Par défaut ({AI_PROVIDERS[view.defaultProvider].label})
                          </SelectItem>
                          {view.providers.map((provider) => (
                            <SelectItem
                              key={provider.provider}
                              value={provider.provider}
                              disabled={!provider.configured}
                            >
                              {AI_PROVIDERS[provider.provider].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      </CardContent>
    </Card>
  );
};
