import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type {
  InstagramAccount,
  InstagramStory,
} from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount } from '../../../domain/instagram/entities/Instagram.ts';
import { Card } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

export interface StoriesCalendarProps {
  stories: InstagramStory[];
  from: string;
  to: string;
  accounts: InstagramAccount[];
}

/** Les jours d'une période, du plus ancien au plus récent. */
const daysOf = (from: string, to: string): string[] => {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

/** Intensité d'une case : cinq paliers suffisent, l'œil n'en distingue pas plus. */
const level = (count: number, max: number): number => {
  if (count === 0) return 0;
  if (max <= 1) return 4;
  return Math.min(4, Math.ceil((count / max) * 4));
};

/**
 * Le rythme de publication, une case par jour.
 *
 * Un calendrier plutôt qu'une courbe : la question qu'on se pose devant ses stories est
 * « est-ce que je tiens le rythme », et un trou de trois jours se voit d'un coup d'œil
 * sur une grille là qu'il faut le chercher sur une ligne brisée.
 *
 * Les jours sont **regroupés par semaine, lundi en haut** — même convention que le reste
 * de l'outil. Un jour sans story reste dessiné, en creux : c'est précisément lui qu'on
 * vient voir.
 */
export const StoriesCalendar = ({ stories, from, to, accounts }: StoriesCalendarProps) => {
  const [selected, setSelected] = useState<string | null>(null);

  const { days, byDate, max } = useMemo(() => {
    const map = new Map<string, InstagramStory[]>();
    for (const story of stories) {
      const list = map.get(story.date) ?? [];
      list.push(story);
      map.set(story.date, list);
    }
    const counts = [...map.values()].map((list) => list.length);
    return {
      days: daysOf(from, to),
      byDate: map,
      max: counts.length > 0 ? Math.max(...counts) : 0,
    };
  }, [stories, from, to]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const selectedStories = selected ? (byDate.get(selected) ?? []) : [];

  if (days.length > 400) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Période trop longue pour le calendrier. Choisis une fenêtre d’un an au maximum.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-4">
        <div className="flex gap-1">
          {/* Les jours sont empilés par colonne de semaine : sept lignes, une par jour. */}
          {chunk(days, 7).map((week) => (
            <div key={week[0]} className="flex flex-col gap-1">
              {week.map((date) => {
                const count = byDate.get(date)?.length ?? 0;
                const intensity = level(count, max);
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelected(count > 0 ? date : null)}
                    title={`${date} — ${count} story(s)`}
                    className={cn(
                      'h-4 w-4 rounded-sm border transition-transform hover:scale-110',
                      count === 0
                        ? 'border-border bg-muted/40'
                        : 'border-transparent cursor-pointer',
                      selected === date && 'ring-2 ring-offset-1 ring-[#e1306c]',
                    )}
                    style={
                      intensity > 0
                        ? { backgroundColor: `rgba(225, 48, 108, ${0.25 + intensity * 0.19})` }
                        : undefined
                    }
                  >
                    <span className="sr-only">
                      {date} : {count} story(s)
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Moins</span>
          {[0, 1, 2, 3, 4].map((intensity) => (
            <span
              key={intensity}
              className={cn('h-3 w-3 rounded-sm', intensity === 0 && 'border border-border')}
              style={
                intensity > 0
                  ? { backgroundColor: `rgba(225, 48, 108, ${0.25 + intensity * 0.19})` }
                  : { background: 'var(--muted)' }
              }
            />
          ))}
          <span>Plus</span>
          {max > 0 && <span className="ml-2">Jusqu’à {max} story(s) par jour</span>}
        </div>
      </Card>

      {selected && selectedStories.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">
            {selected} — {selectedStories.length} story(s)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {selectedStories.map((story) => {
              const account = accountById.get(story.accountId);
              return (
                <div
                  key={story.id}
                  className="flex items-center gap-2 rounded-md border border-border p-2"
                >
                  {story.thumbnailUrl ? (
                    <img
                      src={story.thumbnailUrl}
                      alt=""
                      className="h-12 w-9 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="h-12 w-9 shrink-0 rounded"
                      style={{ backgroundColor: account?.color ?? '#e1306c' }}
                      aria-hidden
                    />
                  )}

                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate font-medium">{story.postedAt.slice(11, 16)}</p>
                    {/* `insightsAt` à null : Meta refuse les statistiques d'une story vue
                        par moins de cinq comptes. On affiche « — », jamais un zéro faux. */}
                    <p className="truncate text-muted-foreground">
                      {story.insightsAt === null
                        ? 'Pas de statistiques'
                        : `${formatCount(story.views)} vues · ${formatCount(story.reach)} comptes`}
                    </p>
                  </div>

                  {story.permalink && (
                    <a
                      href={story.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="Ouvrir sur Instagram"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

const chunk = <T,>(list: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
};
