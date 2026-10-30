import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Loader2,
  X,
} from 'lucide-react';
import { useUpdateProduction } from '../../../application/production/usecases/useProductions.ts';
import type {
  MailDateCheck,
  MailDateIncoherence,
  MailDateTask,
} from '../../../domain/mail/entities/Mail.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

const STATUS: Record<MailDateTask['status'], { label: string; tone: string }> = {
  created: { label: 'tâche créée', tone: 'text-[var(--positive)]' },
  exists: { label: 'déjà posée', tone: 'text-muted-foreground' },
  past: { label: 'date dépassée', tone: 'text-[var(--negative)]' },
  not_connected: { label: 'Todo non connecté', tone: 'text-muted-foreground' },
  error: { label: 'échec', tone: 'text-destructive' },
};

const FIELD_LABELS: Record<NonNullable<MailDateIncoherence['field']>, string> = {
  plannedDate: 'la sortie',
  startDate: 'le début du travail',
};

/**
 * Le résultat de « Vérifier les dates » : ce que l'IA a lu d'urgent, les tâches posées dans
 * Todo, et les incohérences avec la vidéo rattachée.
 *
 * **Une incohérence n'est jamais corrigée d'office** : l'IA propose une date, le bouton
 * l'applique à la vidéo. C'est l'utilisateur qui décide si la sortie bouge ou si c'est la
 * marque qu'il faut recadrer.
 */
export const MailDateCheckPanel = ({
  check,
  onClose,
}: {
  check: MailDateCheck;
  onClose: () => void;
}) => {
  const updateProduction = useUpdateProduction();
  const created = check.tasks.filter((task) => task.status === 'created').length;

  return (
    <Card
      className={cn(
        'space-y-3 border-l-4 p-4',
        check.urgent ? 'border-l-[var(--negative)]' : 'border-l-[var(--positive)]',
      )}
    >
      <div className="flex items-start gap-2">
        {check.urgent ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
        ) : (
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
        )}
        <p className="flex-1 text-sm font-medium">
          {check.summary || (check.urgent ? 'Quelque chose d’urgent.' : 'Rien d’urgent.')}
        </p>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fermer">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {check.tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune échéance qui t’engage dans ce fil.</p>
      ) : (
        <ul className="space-y-1.5">
          {check.tasks.map((task, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              {task.kind === 'start' ? (
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : task.status === 'past' ? (
                <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn(task.urgent && task.kind === 'deadline' && 'font-medium')}>
                  {formatDate(task.dueDate)} — {task.title}
                  {task.urgent && task.kind === 'deadline' && (
                    <span className="ml-1.5 text-xs text-[var(--negative)]">urgent</span>
                  )}
                </p>
                {task.quote && task.kind === 'deadline' && (
                  <p className="truncate text-xs text-muted-foreground">« {task.quote} »</p>
                )}
              </div>
              <span className={cn('shrink-0 text-xs', STATUS[task.status].tone)}>
                {STATUS[task.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}
      {check.tasks.some((task) => task.error) && (
        <p className="text-xs text-destructive">{check.tasks.find((task) => task.error)?.error}</p>
      )}
      {!check.todoConnected && check.tasks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Connecte l’app Todo (Paramètres → Applications externes) pour que ces échéances deviennent
          des tâches.
        </p>
      )}
      {created > 0 && (
        <p className="text-xs text-muted-foreground">
          {created} tâche{created > 1 ? 's' : ''} ajoutée{created > 1 ? 's' : ''} dans Todo —
          visible{created > 1 ? 's' : ''} dans le planning.
        </p>
      )}

      {check.incoherences.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            À vérifier
          </p>
          {check.incoherences.map((incoherence, index) => (
            <div key={index} className="space-y-1.5 rounded-md bg-muted/50 p-2.5 text-sm">
              <p>{incoherence.message}</p>
              {incoherence.field && incoherence.suggestedDate && check.productionId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateProduction.isPending || updateProduction.isSuccess}
                  onClick={() =>
                    updateProduction.mutate({
                      id: check.productionId!,
                      input: { [incoherence.field!]: incoherence.suggestedDate },
                    })
                  }
                >
                  {updateProduction.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Mettre {FIELD_LABELS[incoherence.field]} au{' '}
                  {formatDate(incoherence.suggestedDate)}
                </Button>
              )}
            </div>
          ))}
          {updateProduction.isSuccess && (
            <p className="text-xs text-[var(--positive)]">Vidéo mise à jour.</p>
          )}
          {updateProduction.error && (
            <p className="text-xs text-destructive">{updateProduction.error.message}</p>
          )}
        </div>
      )}
    </Card>
  );
};
