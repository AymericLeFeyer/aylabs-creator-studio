import { useMemo, useState } from 'react';
import { CalendarPlus, CalendarCheck, Pencil, Play, Plus, Timer, Trash2 } from 'lucide-react';
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntries,
  useUpdateTimeEntry,
} from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import type { TimeEntry } from '../../../domain/production/entities/TimeEntry.ts';
import { entryMinutes, formatDuration } from '../../../domain/production/entities/TimeEntry.ts';
import { todosOfStep } from '../../../domain/production/entities/StepTodo.ts';
import { useSlotFromTimeEntry } from '../../../application/planning/usecases/usePlanning.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { NONE, fromSelectValue, toSelectValue } from '../forms/selectNone.ts';
import { cn } from '../../../shared/cn.ts';

interface TimeEntriesPanelProps {
  production: Production;
  steps: ProductionStep[];
  onStartTimer: () => void;
}

/** Le champ heure d'un `datetime-local`, à partir d'un horodatage ISO. */
const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/** Le jour local d'un horodatage ISO. Le serveur est en UTC : il ne peut pas le déduire. */
const toLocalDate = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** L'heure locale `HH:MM` d'un horodatage ISO, pour la même raison. */
const toLocalTime = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Le temps passé sur une vidéo : ce que le chronomètre a enregistré, et ce qu'on ajoute
 * à la main quand on a oublié de le lancer.
 *
 * L'oubli est la règle, pas l'exception : c'est précisément pour ça que la saisie
 * manuelle est un bouton de premier plan et non une case cachée. Un suivi du temps qui
 * ne se rattrape pas se remplit trois jours puis se vide.
 *
 * Le total par étape est le vrai enseignement — « le montage me prend deux fois plus que
 * je ne le crois » ne se lit pas dans une liste de sessions.
 */
export const TimeEntriesPanel = ({ production, steps, onStartTimer }: TimeEntriesPanelProps) => {
  const { data: entries = [] } = useTimeEntries({ productionIds: [production.id] });
  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  const toSlot = useSlotFromTimeEntry();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [startedAt, setStartedAt] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [stepId, setStepId] = useState<string>(NONE);
  const [todoId, setTodoId] = useState<string>(NONE);
  const [notes, setNotes] = useState('');

  const totals = useMemo(() => {
    const byStep = new Map<string, number>();
    let total = 0;
    for (const entry of entries) {
      const value = entryMinutes(entry);
      total += value;
      byStep.set(entry.stepId ?? NONE, (byStep.get(entry.stepId ?? NONE) ?? 0) + value);
    }
    return { total, byStep };
  }, [entries]);

  const openCreate = () => {
    setEditing(null);
    setStartedAt(toLocalInput(new Date().toISOString()));
    setMinutes('60');
    setStepId(NONE);
    setTodoId(NONE);
    setNotes('');
    setDialogOpen(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditing(entry);
    setStartedAt(toLocalInput(entry.startedAt));
    setMinutes(String(entryMinutes(entry)));
    setStepId(toSelectValue(entry.stepId));
    setTodoId(toSelectValue(entry.todoId));
    setNotes(entry.notes ?? '');
    setDialogOpen(true);
  };

  const submit = () => {
    const parsed = Number(minutes);
    if (!startedAt || !Number.isFinite(parsed) || parsed < 1) return;

    const payload = {
      startedAt: new Date(startedAt).toISOString(),
      minutes: Math.round(parsed),
      stepId: fromSelectValue(stepId),
      todoId: fromSelectValue(todoId),
      notes: notes.trim() || null,
    };

    if (editing) {
      update.mutate({ id: editing.id, input: payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create.mutate(
        { productionId: production.id, ...payload },
        { onSuccess: () => setDialogOpen(false) },
      );
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4" />
            Temps passé
            {totals.total > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                · {formatDuration(totals.total)} au total
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onStartTimer}>
              <Play className="h-4 w-4" />
              Démarrer
            </Button>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Le total par étape avant le détail : c'est la question qu'on se pose en
              ouvrant cet onglet, la liste des sessions n'en est que la justification. */}
          {totals.total > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {steps.map((step) => {
                const value = totals.byStep.get(step.id) ?? 0;
                if (value === 0) return null;
                return (
                  <span
                    key={step.id}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: step.color }}
                  >
                    {step.name} · {formatDuration(value)}
                  </span>
                );
              })}
              {(totals.byStep.get(NONE) ?? 0) > 0 && (
                <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Sans étape · {formatDuration(totals.byStep.get(NONE)!)}
                </span>
              )}
            </div>
          )}

          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun temps enregistré. Démarre le chronomètre, ou saisis une session passée.
            </p>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm',
                    entry.endedAt === null && 'border-[var(--positive)]/50 bg-[var(--positive)]/5',
                  )}
                >
                  <span className="w-24 shrink-0 tabular text-muted-foreground">
                    {formatDate(entry.date)}
                  </span>

                  {entry.stepName ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: entry.stepColor ?? 'var(--muted-foreground)' }}
                    >
                      {entry.stepName}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">Sans étape</span>
                  )}

                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {[entry.todoLabel, entry.notes].filter(Boolean).join(' · ')}
                  </span>

                  <span className="shrink-0 tabular font-medium">
                    {entry.endedAt === null ? 'en cours…' : formatDuration(entryMinutes(entry))}
                  </span>

                  <div className="flex shrink-0 gap-1">
                    {/* Matérialiser la session dans le planning. Elle n'y figure pas
                        toute seule : on a chronométré deux heures de montage sans qu'aucun
                        créneau ne les attende, et rien n'en garde trace dans l'agenda.
                        Une fois posé, le créneau est approuvé — donc immobile. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={entry.endedAt === null || entry.slotId !== null || toSlot.isPending}
                      title={
                        entry.endedAt === null
                          ? 'Session en cours : arrête le chronomètre d’abord'
                          : entry.slotId !== null
                            ? 'Déjà dans le planning'
                            : 'En faire un créneau dans le planning'
                      }
                      onClick={() =>
                        toSlot.mutate({
                          timeEntryId: entry.id,
                          date: toLocalDate(entry.startedAt),
                          startTime: toLocalTime(entry.startedAt),
                        })
                      }
                    >
                      {entry.slotId !== null ? (
                        <CalendarCheck className="h-3.5 w-3.5 text-[var(--positive)]" />
                      ) : (
                        <CalendarPlus className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">En faire un créneau</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(entry)}
                      // Une session en cours n'a pas de durée à corriger : elle court.
                      disabled={entry.endedAt === null}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Modifier</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => remove.mutate(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la session' : 'Ajouter du temps'}</DialogTitle>
            <DialogDescription>
              Un début et une durée. La fin s'en déduit — c'est la durée qui compte dans les totaux.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="time-started">Début</Label>
              <Input
                id="time-started"
                type="datetime-local"
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="time-minutes">Durée (minutes)</Label>
              <Input
                id="time-minutes"
                type="number"
                min={1}
                step={5}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Étape</Label>
              <Select
                value={stepId}
                onValueChange={(value) => {
                  // Une tâche de montage n'a aucun sens sous « écriture ».
                  setStepId(value);
                  setTodoId(NONE);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sans étape</SelectItem>
                  {steps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* La sous-étape n'apparaît que si l'étape en a : une liste vide ferait
                croire qu'il manque quelque chose à configurer. */}
            {fromSelectValue(stepId) !== null &&
              todosOfStep(production.todos, fromSelectValue(stepId)!).length > 0 && (
                <div className="space-y-1.5">
                  <Label>Sous-étape</Label>
                  <Select value={todoId} onValueChange={setTodoId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Toute l’étape</SelectItem>
                      {todosOfStep(production.todos, fromSelectValue(stepId)!).map((todo) => (
                        <SelectItem key={todo.id} value={todo.id}>
                          {todo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            <div className="space-y-1.5">
              <Label htmlFor="time-notes">Note</Label>
              <Input
                id="time-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Facultatif"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
