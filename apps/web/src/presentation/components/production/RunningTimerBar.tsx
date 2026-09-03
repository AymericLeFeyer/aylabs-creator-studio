import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Square, Timer } from 'lucide-react';
import {
  useRunningTimer,
  useStopTimer,
} from '../../../application/production/usecases/useProductions.ts';
import { formatStopwatch } from '../../../domain/production/entities/TimeEntry.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le bandeau du chronomètre en cours.
 *
 * Il vit dans la coquille de l'application et non sur l'écran de production : on démarre
 * une session en attaquant une vidéo, puis on part consulter ses revenus ou son planning
 * — et c'est précisément là qu'on oublie de l'arrêter. Un bandeau visible partout est ce
 * qui empêche une session de courir toute la nuit.
 *
 * La durée est recalculée **en local à la seconde** à partir de l'heure de début : le
 * serveur n'est interrogé qu'une fois par minute (`useRunningTimer`), ce qui suffit à
 * détecter un arrêt fait depuis un autre onglet sans marteler l'API pour animer un
 * compteur.
 */
export const RunningTimerBar = () => {
  const { data: running } = useRunningTimer();
  const stop = useStopTimer();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  const elapsed = now - Date.parse(running.startedAt);

  return (
    <div className="border-t border-[var(--positive)]/30 bg-[var(--positive)]/10">
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm sm:px-5">
        <Timer className="h-4 w-4 shrink-0 text-[var(--positive)]" aria-hidden />

        <span className="tabular text-base font-semibold text-[var(--positive)]">
          {formatStopwatch(elapsed)}
        </span>

        <Link
          to={`/production/${running.productionId}`}
          className="min-w-0 truncate font-medium hover:underline"
        >
          {running.productionTitle}
        </Link>

        {running.stepName && (
          <span
            className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white')}
            style={{ backgroundColor: running.stepColor ?? 'var(--muted-foreground)' }}
          >
            {running.stepName}
          </span>
        )}

        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => stop.mutate(running.id)}
          disabled={stop.isPending}
        >
          <Square className="h-3.5 w-3.5" />
          Arrêter
        </Button>
      </div>
    </div>
  );
};
