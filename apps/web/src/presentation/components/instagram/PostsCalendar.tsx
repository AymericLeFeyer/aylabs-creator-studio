import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type {
  InstagramMedia,
  InstagramSeriesPoint,
} from '../../../domain/instagram/entities/Instagram.ts';
import { MEDIA_TYPE_LABELS } from '../../../domain/instagram/entities/Instagram.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

export interface PostsCalendarProps {
  /** Série **au jour** : `posts` compte aussi les parutions déduites du compteur du profil. */
  series: InstagramSeriesPoint[];
  media: InstagramMedia[];
  from: string;
  to: string;
}

const WEEKDAYS = ['L', '', 'M', '', 'V', '', 'D'];
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** Au-delà, une grille de cases de 12 px ne tient plus sur un écran. */
const MAX_DAYS = 400;

const shift = (date: string, days: number): string => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

/** 0 = lundi, même convention que `bucketStart` et le planning. */
const weekday = (date: string): number => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Quatre paliers au-dessus de zéro : l'œil n'en distingue pas davantage. */
const OPACITY = [0, 0.35, 0.55, 0.78, 1];
const levelOf = (count: number): number => Math.min(4, count);

/**
 * Les publications de la période, **une case par jour**, façon graphe de contributions
 * GitHub : une colonne par semaine, lundi en haut.
 *
 * Une grille plutôt qu'un histogramme : la question est « est-ce que je tiens le
 * rythme », et un trou de dix jours se voit d'un coup d'œil sur une grille là qu'il faut
 * le chercher sur une rangée de barres à zéro. Les jours hors période restent en creux,
 * sans bordure, pour que la première et la dernière semaine ne se lisent pas comme vides.
 *
 * Cliquer une case liste ses publications (celles qui sont archivées ; une parution
 * seulement déduite du compteur du profil n'a ni titre ni lien).
 */
export const PostsCalendar = ({ series, media, from, to }: PostsCalendarProps) => {
  const [selected, setSelected] = useState<string | null>(null);

  const { weeks, counts, total, activeDays } = useMemo(() => {
    const byDate = new Map(series.map((point) => [point.date, point.posts]));
    // Du lundi de la première semaine au dimanche de la dernière.
    const start = shift(from, -weekday(from));
    const end = shift(to, 6 - weekday(to));
    const columns: string[][] = [];
    for (let day = start, guard = 0; day <= end && guard < 800; day = shift(day, 1), guard++) {
      if (weekday(day) === 0) columns.push([]);
      columns.at(-1)!.push(day);
    }
    const values = [...byDate.values()];
    return {
      weeks: columns,
      counts: byDate,
      total: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter((value) => value > 0).length,
    };
  }, [series, from, to]);

  const selectedMedia = selected ? media.filter((item) => item.date === selected) : [];

  if (weeks.length * 7 > MAX_DAYS) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Période trop longue pour le calendrier : choisis une fenêtre d’un an au maximum.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{total}</span> publication(s) · {activeDays}{' '}
        jour(s) avec au moins une
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          {/* Initiales des jours, une ligne sur deux comme sur GitHub. */}
          <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[9px] leading-3 text-muted-foreground">
            {WEEKDAYS.map((label, index) => (
              <span key={index} className="h-3">
                {label}
              </span>
            ))}
          </div>

          {weeks.map((week, index) => {
            // Le mois s'écrit au-dessus de la semaine qui contient son 1er (et de la première).
            const firstOfMonth = week.find((day) => day.endsWith('-01'));
            const label = index === 0 ? week[0]! : firstOfMonth && index > 1 ? firstOfMonth : null;
            return (
              <div key={week[0]} className="flex flex-col gap-[3px]">
                <span className="h-3 whitespace-nowrap text-[9px] leading-3 text-muted-foreground">
                  {label ? MONTHS[Number(label.slice(5, 7)) - 1] : ''}
                </span>
                {week.map((day) => {
                  const inRange = day >= from && day <= to;
                  const count = counts.get(day) ?? 0;
                  const level = levelOf(count);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!inRange}
                      onClick={() => setSelected(count > 0 && selected !== day ? day : null)}
                      title={inRange ? `${formatDate(day)} — ${count} publication(s)` : undefined}
                      className={cn(
                        'h-3 w-3 rounded-[3px]',
                        !inRange && 'invisible',
                        inRange && level === 0 && 'bg-muted',
                        count > 0 && 'cursor-pointer hover:ring-1 hover:ring-foreground/40',
                        selected === day && 'ring-2 ring-[#833ab4] ring-offset-1',
                      )}
                      style={
                        level > 0
                          ? { backgroundColor: `rgba(131, 58, 180, ${OPACITY[level]})` }
                          : undefined
                      }
                    >
                      <span className="sr-only">
                        {day} : {count} publication(s)
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Moins</span>
        {OPACITY.map((opacity, level) => (
          <span
            key={level}
            className={cn('h-3 w-3 rounded-[3px]', level === 0 && 'bg-muted')}
            style={level > 0 ? { backgroundColor: `rgba(131, 58, 180, ${opacity})` } : undefined}
          />
        ))}
        <span>Plus</span>
      </div>

      {selected && (
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{formatDate(selected)}</p>
          {selectedMedia.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Parution déduite du nombre de publications du profil : elle n’est pas suivie
              individuellement.
            </p>
          ) : (
            selectedMedia.map((item) => (
              <div key={item.id} className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {item.caption?.split('\n')[0] || '(sans légende)'}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {MEDIA_TYPE_LABELS[item.mediaType ?? ''] ?? ''}
                  </span>
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="Ouvrir sur Instagram"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                {/* Portée et enregistrements : uniquement mesurés par l'API Graph, absents
                    d'une publication seulement déduite du compteur du profil public. */}
                {item.statsAt && (
                  <p className="text-xs text-muted-foreground">
                    {item.views !== null && <>{item.views} vues · </>}
                    {item.reach !== null && <>{item.reach} portée · </>}
                    {item.likes ?? 0} j’aime · {item.comments ?? 0} commentaires
                    {item.saved !== null && <> · {item.saved} enregistrements</>}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
