import { useState } from 'react';
import { CircleDashed, Minus, Plus } from 'lucide-react';
import {
  useSetStoryCount,
  useStoryCount,
} from '../../../application/instagram/usecases/useInstagram.ts';
import { localToday, shiftDate } from '../../../application/planning/usecases/usePlanning.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

/**
 * « J'ai fait x stories aujourd'hui » — la saisie manuelle des stories, en tête de l'écran
 * Instagram.
 *
 * Le profil public ne dit rien des stories : sans cette saisie, le rythme de stories
 * n'existe nulle part. Elle doit donc coûter **un clic** : « + » après chaque story, et
 * c'est enregistré (pas de bouton de validation). « − » rattrape un clic de trop.
 *
 * On oublie souvent de noter le soir même : la bascule **Hier** corrige la veille sans
 * passer par un formulaire de date. Le jour vient du navigateur, jamais du serveur.
 */
export const StoryCounter = () => {
  const today = localToday();
  const [dayOffset, setDayOffset] = useState<0 | -1>(0);
  const date = dayOffset === 0 ? today : shiftDate(today, -1);

  const { data } = useStoryCount(date);
  const setCount = useSetStoryCount();
  const count = data?.count ?? 0;
  const change = (next: number) => setCount.mutate({ date, count: Math.max(0, next) });

  // Orange seulement pour aujourd'hui : c'est ce qui allume la pastille du menu.
  const missing = dayOffset === 0 && data !== undefined && count === 0;

  return (
    <Card
      className={cn(
        'flex flex-col justify-between gap-3 p-4',
        missing && 'border-[var(--expense)]/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Stories</h2>
          <p
            className={cn(
              'text-xs text-muted-foreground',
              missing && 'font-medium text-[var(--expense)]',
            )}
          >
            {missing
              ? 'Pas encore de story aujourd’hui'
              : count === 0
                ? 'Aucune story déclarée'
                : `${count} stor${count > 1 ? 'ies' : 'y'} ${dayOffset === 0 ? 'aujourd’hui' : 'hier'}`}
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {([0, -1] as const).map((offset) => (
            <button
              key={offset}
              type="button"
              onClick={() => setDayOffset(offset)}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                dayOffset === offset
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {offset === 0 ? 'Aujourd’hui' : 'Hier'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={count === 0}
          onClick={() => change(count - 1)}
          aria-label="Une story de moins"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-[2.5ch] text-center text-3xl font-semibold tabular">
          {data === undefined ? <CircleDashed className="mx-auto h-6 w-6 animate-spin" /> : count}
        </span>
        <Button className="h-10 flex-1" onClick={() => change(count + 1)}>
          <Plus className="h-4 w-4" />
          J’ai fait une story
        </Button>
      </div>
    </Card>
  );
};
