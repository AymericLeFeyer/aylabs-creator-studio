import { useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  useCreateStep,
  useCreateStepTodo,
  useDeleteStep,
  useDeleteStepTodo,
  useProductionSteps,
  useReorderStepTodos,
  useReorderSteps,
  useStepTodos,
  useUpdateStep,
  useUpdateStepTodo,
} from '../../application/production/usecases/useProductions.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * La durée moyenne, en minutes.
 *
 * Vide vaut `null` et **non zéro** : « je ne sais pas » et « ça ne prend pas de temps »
 * sont deux réponses différentes, et seule la première fait retomber la tâche sur la
 * durée de son étape. Le champ est non contrôlé et validé à la sortie, comme le reste de
 * l'écran — un `onChange` branché sur la mutation enverrait une requête par chiffre tapé.
 */
const DurationInput = ({
  value,
  label,
  placeholder = 'min',
  onCommit,
}: {
  value: number | null;
  label: string;
  placeholder?: string;
  onCommit: (minutes: number | null) => void;
}) => (
  <Input
    type="number"
    min={5}
    step={5}
    defaultValue={value ?? ''}
    placeholder={placeholder}
    aria-label={label}
    title={label}
    onBlur={(event) => {
      const raw = event.target.value.trim();
      const next = raw === '' ? null : Math.round(Number(raw));
      if (next !== null && (!Number.isFinite(next) || next < 5)) return;
      if (next !== value) onCommit(next);
    }}
    className="h-7 w-16 shrink-0 px-1.5 text-center text-xs"
  />
);

/**
 * Le référentiel des étapes **et de leurs tâches habituelles**.
 *
 * L'ordre défini ici n'est qu'un **ordre d'affichage** : les cases se cochent dans le
 * sens qu'on veut. Étapes et tâches sont des lignes en base et non des colonnes — en
 * ajouter demande zéro migration.
 *
 * Une carte par étape plutôt qu'un tableau : chaque étape porte maintenant sa liste de
 * tâches, et une sous-liste dans une cellule de tableau devient illisible dès la
 * deuxième ligne.
 *
 * Les champs sont **non contrôlés, validés à la sortie** (`defaultValue` + `onBlur`) :
 * un `onChange` branché sur la mutation enverrait une requête par lettre tapée.
 */
export const StepsPage = () => {
  const { data: steps = [] } = useProductionSteps(true);
  const { data: todos = [] } = useStepTodos(true);

  const create = useCreateStep();
  const update = useUpdateStep();
  const remove = useDeleteStep();
  const createTodo = useCreateStepTodo();
  const updateTodo = useUpdateStepTodo();
  const removeTodo = useDeleteStepTodo();
  const reorderSteps = useReorderSteps();
  const reorderTodos = useReorderStepTodos();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#64748b', defaultMinutes: '' });
  const [error, setError] = useState<string | null>(null);
  /** Le brouillon de nouvelle tâche, par étape : on en ajoute souvent deux d'affilée. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const minutes = Number(form.defaultMinutes);
      await create.mutateAsync({
        name: form.name.trim(),
        color: form.color,
        defaultMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
      });
      setForm({ name: '', color: '#64748b', defaultMinutes: '' });
      setDialogOpen(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  /**
   * Déplace un élément d'un cran et **réécrit toute la liste**.
   *
   * L'ancienne version échangeait les deux `sortOrder` concernés. Ça ne marchait que si
   * les rangs étaient distincts — or rien ne le garantit : une étape créée à la main prend
   * `MAX + 1`, et deux rangs égaux se seraient échangés sans que rien ne bouge. Réécrire
   * la suite entière repart d'un ordre propre à chaque fois.
   */
  const moved = <T extends { id: string }>(
    list: T[],
    index: number,
    direction: -1 | 1,
  ): string[] => {
    const next = [...list];
    const target = index + direction;
    if (target < 0 || target >= next.length) return [];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next.map((item) => item.id);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const ids = moved(steps, index, direction);
    if (ids.length > 0) reorderSteps.mutate(ids);
  };

  /**
   * Les tâches se réordonnent **dans leur étape**, mais l'API réécrit une suite globale :
   * on lui envoie donc l'ordre de toutes les tâches, celles des autres étapes inchangées.
   * Un rang par étape n'aurait servi à rien — le tri les regroupe déjà par étape.
   */
  const moveTodo = (stepId: string, index: number, direction: -1 | 1) => {
    const inStep = todos.filter((todo) => todo.stepId === stepId);
    const reordered = moved(inStep, index, direction);
    if (reordered.length === 0) return;

    const rest = todos.filter((todo) => todo.stepId !== stepId).map((todo) => todo.id);
    reorderTodos.mutate([...reordered, ...rest]);
  };

  const addTodo = (stepId: string) => {
    const label = (drafts[stepId] ?? '').trim();
    if (!label) return;
    createTodo.mutate({ stepId, label });
    setDrafts((current) => ({ ...current, [stepId]: '' }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Étapes et tâches</h2>
          <p className="text-sm text-muted-foreground">
            Les étapes sont les pastilles d'une vidéo ; les tâches sont ce qu'il y a dedans. Une
            tâche pèse autant qu'une étape dans l'avancement affiché. La durée moyenne dit au
            planning quelle place réserver — vide, la tâche reprend celle de son étape.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle étape
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {steps.map((step, index) => {
          const stepTodos = todos.filter((todo) => todo.stepId === step.id);

          return (
            <Card key={step.id} className={cn('space-y-3 p-4', step.isArchived && 'opacity-60')}>
              <div className="flex items-center gap-2">
                <Input
                  key={`${step.id}-color`}
                  type="color"
                  defaultValue={step.color}
                  onBlur={(event) => {
                    if (event.target.value !== step.color) {
                      update.mutate({ id: step.id, input: { color: event.target.value } });
                    }
                  }}
                  className="h-8 w-10 shrink-0 p-1"
                  aria-label={`Couleur de ${step.name}`}
                />
                <Input
                  key={`${step.id}-name`}
                  defaultValue={step.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== step.name) {
                      update.mutate({ id: step.id, input: { name } });
                    }
                  }}
                  className="h-8 min-w-0 flex-1 font-medium"
                />
                <DurationInput
                  key={`${step.id}-minutes`}
                  value={step.defaultMinutes}
                  label={`Durée moyenne de ${step.name}`}
                  onCommit={(defaultMinutes) =>
                    update.mutate({ id: step.id, input: { defaultMinutes } })
                  }
                />
                {step.isArchived && <Badge variant="outline">Archivée</Badge>}

                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                    title="Monter"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span className="sr-only">Monter</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                    title="Descendre"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span className="sr-only">Descendre</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={step.isArchived ? 'Réactiver' : 'Archiver'}
                    onClick={() =>
                      update.mutate({ id: step.id, input: { isArchived: !step.isArchived } })
                    }
                  >
                    {step.isArchived ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">{step.isArchived ? 'Réactiver' : 'Archiver'}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      // Supprimer efface la case sur toutes les vidéos qui l'avaient
                      // cochée : l'archivage la retire de la vue sans perdre l'historique.
                      if (
                        window.confirm(
                          `Supprimer « ${step.name} » ? Elle disparaîtra de toutes les vidéos, avec ses tâches.`,
                        )
                      ) {
                        remove.mutate(step.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span className="sr-only">Supprimer</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1 border-t border-border pt-2">
                {stepTodos.length === 0 && (
                  <p className="px-1 py-1 text-xs text-muted-foreground">
                    Aucune tâche. Sans tâche, l'étape se coche d'un clic comme avant.
                  </p>
                )}

                {stepTodos.map((todo, todoIndex) => (
                  <div key={todo.id} className="group flex items-center gap-1.5">
                    {/* Deux flèches plutôt qu'un glisser-déposer : une liste de cinq
                        lignes ne justifie pas une dépendance, et le clavier y accède. */}
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        className="h-3 text-muted-foreground transition-opacity hover:text-foreground disabled:opacity-20"
                        disabled={todoIndex === 0}
                        onClick={() => moveTodo(step.id, todoIndex, -1)}
                        title="Monter"
                      >
                        <ChevronUp className="h-3 w-3" />
                        <span className="sr-only">Monter {todo.label}</span>
                      </button>
                      <button
                        type="button"
                        className="h-3 text-muted-foreground transition-opacity hover:text-foreground disabled:opacity-20"
                        disabled={todoIndex === stepTodos.length - 1}
                        onClick={() => moveTodo(step.id, todoIndex, 1)}
                        title="Descendre"
                      >
                        <ChevronDown className="h-3 w-3" />
                        <span className="sr-only">Descendre {todo.label}</span>
                      </button>
                    </div>
                    <Input
                      key={`${todo.id}-label`}
                      defaultValue={todo.label}
                      onBlur={(event) => {
                        const label = event.target.value.trim();
                        if (label && label !== todo.label) {
                          updateTodo.mutate({ id: todo.id, input: { label } });
                        }
                      }}
                      className={cn(
                        'h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm hover:border-border focus:border-border',
                        todo.isArchived && 'text-muted-foreground line-through',
                      )}
                    />
                    <DurationInput
                      key={`${todo.id}-minutes`}
                      value={todo.defaultMinutes}
                      label={`Durée moyenne de ${todo.label}`}
                      placeholder={
                        step.defaultMinutes !== null ? String(step.defaultMinutes) : 'min'
                      }
                      onCommit={(defaultMinutes) =>
                        updateTodo.mutate({ id: todo.id, input: { defaultMinutes } })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      title={todo.isArchived ? 'Réactiver' : 'Archiver'}
                      onClick={() =>
                        updateTodo.mutate({ id: todo.id, input: { isArchived: !todo.isArchived } })
                      }
                    >
                      {todo.isArchived ? (
                        <ArchiveRestore className="h-3 w-3" />
                      ) : (
                        <Archive className="h-3 w-3" />
                      )}
                      <span className="sr-only">{todo.isArchived ? 'Réactiver' : 'Archiver'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer « ${todo.label} » ? Elle disparaîtra de toutes les vidéos.`,
                          )
                        ) {
                          removeTodo.mutate(todo.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-1.5 pt-1">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <Input
                    value={drafts[step.id] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [step.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTodo(step.id);
                      }
                    }}
                    onBlur={() => addTodo(step.id)}
                    placeholder="Ajouter une tâche habituelle…"
                    className="h-7 border-dashed px-1 text-sm"
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle étape</DialogTitle>
            <DialogDescription>
              Elle apparaîtra comme une case sur toutes les vidéos, y compris celles déjà en cours.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="step-name">Nom</Label>
                <Input
                  id="step-name"
                  placeholder="Sous-titres, SEO, vignette alternative…"
                  value={form.name}
                  onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                  required
                />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="step-minutes">Durée (min)</Label>
                  <Input
                    id="step-minutes"
                    type="number"
                    min={5}
                    placeholder="60"
                    className="h-9 w-24"
                    value={form.defaultMinutes}
                    onChange={(event) =>
                      setForm((f) => ({ ...f, defaultMinutes: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="step-color">Couleur</Label>
                  <Input
                    id="step-color"
                    type="color"
                    className="h-9 w-20 p-1"
                    value={form.color}
                    onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Création…' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
