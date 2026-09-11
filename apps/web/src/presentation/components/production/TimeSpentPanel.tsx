import { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  useCreateSlot,
  useCreateTimeEntry,
  useDeleteSlot,
  useDeleteTimeEntry,
  useProductionSlots,
  useTimeEntries,
  useUpdateSlot,
  useUpdateTimeEntry,
} from '../../../application/production/usecases/useProductions.ts';
import {
  localStartOf,
  localToday,
  useSlotFromTimeEntry,
} from '../../../application/planning/usecases/usePlanning.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { slotMinutes } from '../../../domain/production/entities/ProductionSlot.ts';
import type { TimeEntry } from '../../../domain/production/entities/TimeEntry.ts';
import { entryMinutes, formatDuration } from '../../../domain/production/entities/TimeEntry.ts';
import { todosOfStep } from '../../../domain/production/entities/StepTodo.ts';
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
import { ApproveSlotDialog } from '../planning/ApproveSlotDialog.tsx';
import { cn } from '../../../shared/cn.ts';

interface TimeSpentPanelProps {
  production: Production;
  steps: ProductionStep[];
  onStartTimer: () => void;
}

/**
 * Une ligne du panneau. **Tout est du temps passé** ; seule sa nature change :
 *
 * - `planned` — un créneau pas encore validé : du temps passé **prévisionnel**. Passé sa
 *   date, il attend d'être validé (et affiné : on a rarement travaillé le temps prévu).
 * - `real` — une session de travail : chronométrée, saisie ou validée. Elle a son créneau
 *   dans le planning, posé tout seul.
 * - `legacy` — un créneau coché « fait » avant que valider ne crée une session. Il n'est
 *   compté dans aucun total, et la ligne le dit.
 */
type Row =
  | { kind: 'planned'; key: string; date: string; time: string | null; slot: ProductionSlot }
  | { kind: 'real'; key: string; date: string; time: string; entry: TimeEntry }
  | { kind: 'legacy'; key: string; date: string; time: string | null; slot: ProductionSlot };

/** `HH:MM` + minutes, borné à la journée. */
const addMinutes = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(24 * 60, (hours ?? 0) * 60 + (mins ?? 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

type Mode = 'real' | 'planned';

interface FormState {
  mode: Mode;
  date: string;
  startTime: string;
  minutes: string;
  stepId: string;
  todoId: string;
  notes: string;
}

/**
 * Le temps passé sur une vidéo, **prévu et réel dans une seule liste**.
 *
 * C'étaient deux cartes — « Créneaux de travail » et « Temps passé » — qui disaient deux
 * fois la même chose : un créneau n'est que du temps passé qu'on n'a pas encore vécu. Les
 * séparer obligeait à poser un créneau, puis à saisir la session, puis à cliquer « en
 * faire un créneau » pour qu'elle apparaisse dans le planning. Désormais :
 *
 * - **ajouter du temps réel le pose tout seul dans le planning** (et l'agenda) ;
 * - **un créneau prévu se valide** d'un bouton, qui demande la durée réellement passée —
 *   c'est l'approbation du planning, avec sa question « as-tu terminé ? » quand le
 *   créneau vient de la pile ;
 * - corriger ou supprimer une session corrige ou supprime son créneau avec elle.
 *
 * Le total par étape vient avant la liste : c'est la question qu'on se pose en ouvrant
 * l'onglet, la liste n'en est que la justification. Il distingue le réel du prévu — les
 * additionner ferait passer une estimation pour du travail fait.
 */
export const TimeSpentPanel = ({ production, steps, onStartTimer }: TimeSpentPanelProps) => {
  const { data: entries = [] } = useTimeEntries({ productionIds: [production.id] });
  const { data: slots = [] } = useProductionSlots({ productionIds: [production.id] });

  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const removeEntry = useDeleteTimeEntry();
  const createSlot = useCreateSlot();
  const updateSlot = useUpdateSlot();
  const removeSlot = useDeleteSlot();
  const toSlot = useSlotFromTimeEntry();

  const [approving, setApproving] = useState<ProductionSlot | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Ce qu'on corrige : une session, un créneau prévu, ou rien (création). */
  const [editing, setEditing] = useState<
    { kind: 'entry'; entry: TimeEntry } | { kind: 'slot'; slot: ProductionSlot } | null
  >(null);
  const [form, setForm] = useState<FormState>({
    mode: 'real',
    date: localToday(),
    startTime: '',
    minutes: '60',
    stepId: NONE,
    todoId: NONE,
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const today = localToday();

  const { rows, realByStep, plannedByStep, realTotal, plannedTotal } = useMemo(() => {
    const entryIds = new Set(entries.map((entry) => entry.id));
    const list: Row[] = [];
    const real = new Map<string, number>();
    const planned = new Map<string, number>();
    let realSum = 0;
    let plannedSum = 0;

    for (const entry of entries) {
      const local = localStartOf(entry.startedAt);
      const minutes = entryMinutes(entry);
      realSum += minutes;
      real.set(entry.stepId ?? NONE, (real.get(entry.stepId ?? NONE) ?? 0) + minutes);
      list.push({
        kind: 'real',
        key: `e-${entry.id}`,
        date: local.startDate,
        time: local.startTime,
        entry,
      });
    }

    for (const slot of slots) {
      // Le créneau d'une session est la même heure vue depuis le planning : la session
      // la représente déjà, la lister deux fois doublerait le temps affiché.
      if (slot.timeEntryId && entryIds.has(slot.timeEntryId)) continue;
      if (slot.done) {
        list.push({
          kind: 'legacy',
          key: `s-${slot.id}`,
          date: slot.date,
          time: slot.startTime,
          slot,
        });
        continue;
      }
      const minutes = slotMinutes(slot);
      plannedSum += minutes;
      planned.set(slot.stepId ?? NONE, (planned.get(slot.stepId ?? NONE) ?? 0) + minutes);
      list.push({
        kind: 'planned',
        key: `s-${slot.id}`,
        date: slot.date,
        time: slot.startTime,
        slot,
      });
    }

    // Du plus récent au plus ancien : le prévu à venir ouvre la liste, le vécu suit.
    list.sort((a, b) =>
      `${b.date} ${b.time ?? '00:00'}`.localeCompare(`${a.date} ${a.time ?? '00:00'}`),
    );

    return {
      rows: list,
      realByStep: real,
      plannedByStep: planned,
      realTotal: realSum,
      plannedTotal: plannedSum,
    };
  }, [entries, slots]);

  const stepById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);
  const selectedStepId = fromSelectValue(form.stepId);
  const stepTodos = selectedStepId ? todosOfStep(production.todos, selectedStepId) : [];

  const openCreate = () => {
    setEditing(null);
    setError(null);
    const now = new Date();
    setForm({
      mode: 'real',
      date: localToday(),
      // Par défaut, « j'ai travaillé l'heure qui vient de s'écouler ».
      startTime: `${String(Math.max(0, now.getHours() - 1)).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}`,
      minutes: '60',
      stepId: NONE,
      todoId: NONE,
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEditEntry = (entry: TimeEntry) => {
    const local = localStartOf(entry.startedAt);
    setEditing({ kind: 'entry', entry });
    setError(null);
    setForm({
      mode: 'real',
      date: local.startDate,
      startTime: local.startTime,
      minutes: String(entryMinutes(entry)),
      stepId: toSelectValue(entry.stepId),
      todoId: toSelectValue(entry.todoId),
      notes: entry.notes ?? '',
    });
    setDialogOpen(true);
  };

  const openEditSlot = (slot: ProductionSlot) => {
    setEditing({ kind: 'slot', slot });
    setError(null);
    const todo = production.todos.find(
      (candidate) => candidate.stepId === slot.stepId && candidate.label === slot.label,
    );
    setForm({
      mode: 'planned',
      date: slot.date,
      startTime: slot.startTime ?? '',
      minutes: String(slotMinutes(slot) || 60),
      stepId: toSelectValue(slot.stepId),
      todoId: toSelectValue(todo?.id ?? null),
      notes: slot.notes ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    const minutes = Math.round(Number(form.minutes));
    if (!form.date) return setError('La date est obligatoire.');
    if (form.mode === 'real' && !form.startTime) {
      return setError('Indique l’heure de début : c’est elle qui place ce temps dans le planning.');
    }
    if ((form.mode === 'real' || form.startTime) && (!Number.isFinite(minutes) || minutes < 1)) {
      return setError('La durée doit faire au moins une minute.');
    }

    const stepId = fromSelectValue(form.stepId);
    const todoId = fromSelectValue(form.todoId);
    const notes = form.notes.trim() || null;
    const todoLabel = todoId
      ? (production.todos.find((todo) => todo.id === todoId)?.label ?? '')
      : '';

    try {
      if (form.mode === 'real') {
        const payload = {
          startedAt: new Date(`${form.date}T${form.startTime}`).toISOString(),
          minutes,
          stepId,
          todoId,
          notes,
          // L'heure locale voyage avec : c'est elle qui pose le créneau dans le planning.
          date: form.date,
          startTime: form.startTime,
        };
        if (editing?.kind === 'entry') {
          await updateEntry.mutateAsync({ id: editing.entry.id, input: payload });
        } else {
          await createEntry.mutateAsync({ productionId: production.id, ...payload });
        }
      } else {
        const payload = {
          stepId,
          date: form.date,
          // Sans heure, c'est « samedi » : un créneau valable, sans durée comptée.
          startTime: form.startTime || null,
          endTime: form.startTime ? addMinutes(form.startTime, minutes) : null,
          notes,
          ...(editing?.kind !== 'slot' ||
          stepId !== editing.slot.stepId ||
          todoLabel !== editing.slot.label
            ? { label: todoLabel }
            : {}),
        };
        if (editing?.kind === 'slot') {
          // Corriger à la main un créneau le rend immobile : le prochain replan n'a pas à
          // défaire ce qu'on vient de choisir.
          await updateSlot.mutateAsync({
            id: editing.slot.id,
            input: { ...payload, origin: 'manual' },
          });
        } else {
          await createSlot.mutateAsync({ productionId: production.id, ...payload });
        }
      }
      setDialogOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Enregistrement impossible');
    }
  };

  const pending =
    createEntry.isPending || updateEntry.isPending || createSlot.isPending || updateSlot.isPending;

  const stepChip = (name: string | null, color: string | null, dashed = false) =>
    name ? (
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
          dashed ? 'border border-dashed' : 'text-white',
        )}
        style={
          dashed
            ? { borderColor: color ?? undefined, color: color ?? undefined }
            : { backgroundColor: color ?? 'var(--muted-foreground)' }
        }
      >
        {name}
      </span>
    ) : (
      <span className="shrink-0 text-[11px] text-muted-foreground">Sans étape</span>
    );

  return (
    <>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="flex flex-wrap items-center gap-x-2 text-sm">
            <Timer className="h-4 w-4" />
            Temps passé
            <span className="text-xs font-normal text-muted-foreground">
              · {formatDuration(realTotal)} réalisé
              {plannedTotal > 0 && ` · ${formatDuration(plannedTotal)} prévu`}
            </span>
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
          {(realTotal > 0 || plannedTotal > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {[...steps.map((step) => step.id), NONE].map((stepId) => {
                const done = realByStep.get(stepId) ?? 0;
                const planned = plannedByStep.get(stepId) ?? 0;
                if (done === 0 && planned === 0) return null;
                const step = stepById.get(stepId);
                return (
                  <span
                    key={stepId}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      step
                        ? 'text-white'
                        : 'border border-dashed border-border text-muted-foreground',
                    )}
                    style={step ? { backgroundColor: step.color } : undefined}
                  >
                    {step?.name ?? 'Sans étape'} · {formatDuration(done)}
                    {planned > 0 && (
                      <span className="opacity-75"> (+{formatDuration(planned)} prévu)</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun temps pour l'instant. Démarre le chronomètre, saisis une session passée, ou
              prévois un moment de travail.
            </p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row) => {
                if (row.kind === 'real') {
                  const { entry } = row;
                  const running = entry.endedAt === null;
                  const withoutSlot = !running && entry.slotId === null;
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm',
                        running && 'border-[var(--positive)]/50 bg-[var(--positive)]/5',
                      )}
                    >
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-[var(--positive)]"
                        aria-label="Réalisé"
                      />
                      <span className="w-28 shrink-0 tabular text-muted-foreground">
                        {formatDate(row.date)} · {row.time}
                      </span>
                      {stepChip(entry.stepName, entry.stepColor)}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {[entry.todoLabel, entry.notes].filter(Boolean).join(' · ')}
                      </span>
                      <span className="shrink-0 tabular font-medium">
                        {running ? 'en cours…' : formatDuration(entryMinutes(entry))}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {/* Une session d'avant la pose automatique n'a pas de créneau :
                            elle se rattrape d'un clic. Les nouvelles l'ont d'office. */}
                        {withoutSlot && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={toSlot.isPending}
                            title="Poser dans le planning"
                            onClick={() => {
                              const local = localStartOf(entry.startedAt);
                              toSlot.mutate({
                                timeEntryId: entry.id,
                                date: local.startDate,
                                startTime: local.startTime,
                              });
                            }}
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            <span className="sr-only">Poser dans le planning</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditEntry(entry)}
                          // Une session en cours n'a pas de durée à corriger : elle court.
                          disabled={running}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Modifier</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeEntry.mutate(entry.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          <span className="sr-only">Supprimer</span>
                        </Button>
                      </div>
                    </div>
                  );
                }

                const { slot } = row;
                const planned = row.kind === 'planned';
                const overdue = planned && slot.date < today;
                const range = slot.startTime
                  ? `${slot.startTime}${slot.endTime ? `–${slot.endTime}` : ''}`
                  : 'sans horaire';
                return (
                  <div
                    key={row.key}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm',
                      planned ? 'border-dashed border-border bg-muted/30' : 'border-border',
                      overdue && 'border-[var(--expense)]/60',
                    )}
                  >
                    {planned ? (
                      <CircleDashed
                        className={cn(
                          'h-4 w-4 shrink-0',
                          overdue ? 'text-[var(--expense)]' : 'text-muted-foreground',
                        )}
                        aria-label="Prévu"
                      />
                    ) : (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-label="Fait"
                      />
                    )}
                    <span className="w-28 shrink-0 tabular text-muted-foreground">
                      {formatDate(slot.date)} · {range}
                    </span>
                    {stepChip(slot.stepName, slot.stepColor, planned)}
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {planned
                        ? [overdue ? 'à valider' : 'prévu', slot.label, slot.notes]
                            .filter(Boolean)
                            .join(' · ')
                        : [slot.label, 'fait, non chronométré'].filter(Boolean).join(' · ')}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 tabular',
                        planned ? 'text-muted-foreground' : 'font-medium',
                      )}
                    >
                      {slotMinutes(slot) > 0 ? formatDuration(slotMinutes(slot)) : '—'}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      {planned && (
                        <Button
                          variant={overdue ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setApproving(slot)}
                          title="Valider le temps réellement passé"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Valider
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditSlot(slot)}
                        disabled={!planned}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeSlot.mutate(slot.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ApproveSlotDialog slot={approving} onOpenChange={() => setApproving(null)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.kind === 'entry'
                ? 'Modifier le temps passé'
                : editing?.kind === 'slot'
                  ? 'Modifier le temps prévu'
                  : 'Ajouter du temps'}
            </DialogTitle>
            <DialogDescription>
              {form.mode === 'real'
                ? 'Du temps déjà passé. Il compte dans les totaux et se pose tout seul dans le planning.'
                : 'Du temps que tu prévois. Il apparaît dans le planning, et se valide une fois fait.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Réalisé ou prévu : seulement à la création. Une session ne redevient pas
                une prévision, et un prévu devient réel en le validant. */}
            {editing === null && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
                {(
                  [
                    ['real', 'Déjà fait'],
                    ['planned', 'Prévu'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, mode }))}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 font-medium transition-colors',
                      form.mode === mode
                        ? 'bg-background text-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="time-date">Jour</Label>
                <Input
                  id="time-date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time-start">
                  Début{form.mode === 'planned' && ' (facultatif)'}
                </Label>
                <Input
                  id="time-start"
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="time-minutes">Durée (minutes)</Label>
              <Input
                id="time-minutes"
                type="number"
                min={1}
                step={5}
                value={form.minutes}
                disabled={form.mode === 'planned' && !form.startTime}
                onChange={(event) => setForm({ ...form, minutes: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Étape</Label>
              <Select
                value={form.stepId}
                // Une tâche de montage n'a aucun sens sous « écriture ».
                onValueChange={(value) => setForm({ ...form, stepId: value, todoId: NONE })}
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
            {stepTodos.length > 0 && (
              <div className="space-y-1.5">
                <Label>Sous-étape</Label>
                <Select
                  value={form.todoId}
                  onValueChange={(value) => setForm({ ...form, todoId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Toute l’étape</SelectItem>
                    {stepTodos.map((todo) => (
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
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Facultatif"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void submit()} disabled={pending}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
