import { useMemo, useState } from 'react';
import { LineChart, Trash2 } from 'lucide-react';
import {
  useCreateGoal,
  useDeleteGoal,
  useGoalCatalog,
  useGoalPreview,
  useUpdateGoal,
} from '../../../application/goal/usecases/useGoals.ts';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';
import { goalTitle, type GoalCategory, type GoalView } from '../../../domain/goal/entities/Goal.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { fromSelectValue, NONE, toSelectValue } from '../forms/selectNone.ts';
import { formatGoalValue, fromFieldValue, roundForecast, toFieldValue } from './goalFormat.ts';

interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalView | null;
}

interface FormState {
  title: string;
  category: GoalCategory | '';
  metric: string;
  entityId: string | null;
  startDate: string;
  endDate: string;
  startValue: string;
  targetValue: string;
  /** La valeur de départ a été tapée à la main : l'aperçu ne l'écrase plus. */
  startTouched: boolean;
}

/** L'échéance proposée par défaut : trois mois, l'horizon d'un objectif qu'on peut piloter. */
const defaultEnd = (start: string) => {
  const date = new Date(`${start}T12:00:00`);
  date.setMonth(date.getMonth() + 3);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Création et édition d'un objectif, dans l'ordre où on le pense : la **catégorie**, la
 * **propriété** suivie (et sa chaîne ou son compte), la **date de départ** — dont la
 * valeur se relève toute seule —, l'**échéance**, puis la **cible**.
 *
 * Le bouton graphique à côté de la cible pose la **prévision** : où mène le rythme des 90
 * derniers jours à l'échéance, arrondi. Ce n'est qu'un point de départ, qu'on corrige
 * ensuite — viser exactement la tendance, c'est ne rien viser.
 */
export const GoalDialog = ({ open, onOpenChange, goal }: GoalDialogProps) => {
  const { data: catalog } = useGoalCatalog(open);
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  // Réinitialisé pendant le rendu à chaque ouverture, comme les autres formulaires.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${goal?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    const today = localToday();
    setForm(
      goal
        ? {
            title: goal.title,
            category: goal.category,
            metric: goal.metric,
            entityId: goal.entityId,
            startDate: goal.startDate,
            endDate: goal.endDate,
            startValue: toFieldValue(goal.startValue, goal.unit),
            targetValue: toFieldValue(goal.targetValue, goal.unit),
            startTouched: true,
          }
        : {
            title: '',
            category: '',
            metric: '',
            entityId: null,
            startDate: today,
            endDate: defaultEnd(today),
            startValue: '',
            targetValue: '',
            startTouched: false,
          },
    );
  }

  const metric = catalog?.metrics.find((item) => item.id === form?.metric) ?? null;
  const entities = metric?.entity ? (catalog?.entities[metric.entity] ?? []) : [];
  const metrics = useMemo(
    () => catalog?.metrics.filter((item) => item.category === form?.category) ?? [],
    [catalog, form?.category],
  );
  const entityReady = !metric?.entity || metric.entityOptional || Boolean(form?.entityId);

  const { data: preview, isFetching } = useGoalPreview(
    form && metric && entityReady && form.startDate
      ? {
          metric: metric.id,
          entityId: form.entityId ?? undefined,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
        }
      : null,
  );

  // La valeur de départ se renseigne d'elle-même tant qu'on ne l'a pas tapée. Dérivée
  // pendant le rendu, sans effet : on compare à la dernière valeur appliquée.
  const [appliedStart, setAppliedStart] = useState<string | null>(null);
  if (form && metric && !form.startTouched && preview && !isFetching) {
    const next = preview.startValue === null ? '' : toFieldValue(preview.startValue, metric.unit);
    const marker = `${metric.id}|${form.entityId}|${form.startDate}|${next}`;
    if (marker !== appliedStart) {
      setAppliedStart(marker);
      if (form.startValue !== next) setForm({ ...form, startValue: next });
    }
  }

  if (!form) return null;
  const set = (patch: Partial<FormState>) =>
    setForm((current) => current && { ...current, ...patch });

  const selectCategory = (category: GoalCategory) => {
    const first = catalog?.metrics.find((item) => item.category === category);
    selectMetric(first?.id ?? '', category);
  };
  const selectMetric = (metricId: string, category = form.category) => {
    const next = catalog?.metrics.find((item) => item.id === metricId);
    const list = next?.entity ? (catalog?.entities[next.entity] ?? []) : [];
    const keep = list.some((entity) => entity.id === form.entityId);
    set({
      category,
      metric: metricId,
      entityId: !next?.entity
        ? null
        : keep
          ? form.entityId
          : next.entityOptional
            ? null
            : (list[0]?.id ?? null),
      startTouched: false,
    });
  };

  const applyForecast = () => {
    if (!metric || preview?.projected == null) return;
    set({ targetValue: toFieldValue(roundForecast(preview.projected, metric.unit), metric.unit) });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!metric) return setError('Choisis la propriété suivie');
    const startValue = fromFieldValue(form.startValue, metric.unit);
    const targetValue = fromFieldValue(form.targetValue, metric.unit);
    if (startValue === null) return setError('La valeur de départ doit être un nombre');
    if (targetValue === null) return setError('La valeur cible doit être un nombre');
    if (form.endDate <= form.startDate) return setError("L'échéance doit suivre la date de départ");
    const payload = {
      title: form.title.trim(),
      metric: metric.id,
      entityId: form.entityId,
      startDate: form.startDate,
      endDate: form.endDate,
      startValue,
      targetValue,
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;
  const unitSuffix = metric?.unit === 'cents' ? '€' : metric?.unit === 'hours' ? 'h' : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? "Modifier l'objectif" : 'Nouvel objectif'}</DialogTitle>
          <DialogDescription>
            Une propriété à suivre, une période, une cible. La progression se recalcule à chaque
            collecte.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select
                value={form.category || undefined}
                onValueChange={(value) => selectCategory(value as GoalCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {catalog?.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Propriété</Label>
              <Select
                value={form.metric || undefined}
                onValueChange={(value) => selectMetric(value)}
                disabled={!form.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {metrics.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {metric && <p className="-mt-2 text-xs text-muted-foreground">{metric.description}</p>}

          {metric?.entity && (
            <div className="space-y-1.5">
              <Label>{metric.entity === 'youtube' ? 'Chaîne' : 'Compte'}</Label>
              {entities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun{metric.entity === 'youtube' ? 'e chaîne' : ' compte'} connecté
                  {metric.entity === 'youtube' ? 'e' : ''} pour l'instant.
                </p>
              ) : (
                <Select
                  value={
                    metric.entityOptional
                      ? toSelectValue(form.entityId)
                      : (form.entityId ?? undefined)
                  }
                  onValueChange={(value) =>
                    set({ entityId: fromSelectValue(value), startTouched: false })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {metric.entityOptional && (
                      <SelectItem value={NONE}>Toutes les chaînes</SelectItem>
                    )}
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Début du suivi</Label>
              <Input
                id="goal-start"
                type="date"
                value={form.startDate}
                max={localToday()}
                onChange={(event) => set({ startDate: event.target.value, startTouched: false })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-start-value">
                Valeur au départ{unitSuffix && ` (${unitSuffix})`}
              </Label>
              <Input
                id="goal-start-value"
                inputMode="decimal"
                value={form.startValue}
                placeholder={metric ? (isFetching ? 'Relevé…' : 'Aucun relevé') : ''}
                onChange={(event) => set({ startValue: event.target.value, startTouched: true })}
                disabled={!metric}
              />
            </div>
          </div>
          {metric && preview && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {preview.startValue === null
                ? "Aucun relevé à cette date : l'historique commence plus tard. Saisis la valeur à la main."
                : 'Relevée automatiquement dans l’historique.'}
              {preview.current !== null &&
                preview.currentDate &&
                ` Aujourd'hui : ${formatGoalValue(preview.current, metric.unit)} (${formatDate(preview.currentDate)}).`}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-end">Échéance</Label>
              <Input
                id="goal-end"
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(event) => set({ endDate: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Valeur cible{unitSuffix && ` (${unitSuffix})`}</Label>
              <div className="flex gap-2">
                <Input
                  id="goal-target"
                  inputMode="decimal"
                  value={form.targetValue}
                  onChange={(event) => set({ targetValue: event.target.value })}
                  disabled={!metric}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title={
                    preview?.projected != null && metric
                      ? `Prévision au rythme récent : ${formatGoalValue(preview.projected, metric.unit)}`
                      : 'Pas assez d’historique pour une prévision'
                  }
                  disabled={!metric || preview?.projected == null}
                  onClick={applyForecast}
                >
                  <LineChart className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {metric && preview?.projected != null && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Au rythme des 90 derniers jours
              {preview.dailyRate !== null &&
                ` (${formatGoalValue(preview.dailyRate, metric.unit)} par jour)`}
              , tu serais vers {formatGoalValue(preview.projected, metric.unit)} le{' '}
              {formatDate(form.endDate)}. Le bouton graphique pose cette prévision, arrondie.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Nom (facultatif)</Label>
            <Input
              id="goal-title"
              value={form.title}
              maxLength={120}
              placeholder={
                metric
                  ? goal
                    ? goalTitle({ ...goal, title: '' })
                    : metric.label
                  : '10 000 abonnés avant Noël'
              }
              onChange={(event) => set({ title: event.target.value })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            {goal && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (!window.confirm(`Supprimer l'objectif « ${goalTitle(goal)} » ?`)) return;
                  remove.mutate(goal.id, { onSuccess: () => onOpenChange(false) });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || !metric || !entityReady}>
              {pending ? 'Enregistrement…' : goal ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
