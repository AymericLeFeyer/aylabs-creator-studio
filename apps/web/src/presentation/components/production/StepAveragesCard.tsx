import { Hourglass } from 'lucide-react';
import type { StepTimeAverage } from '../../../domain/production/entities/ProductionOverview.ts';
import { formatDuration } from '../../../domain/production/entities/TimeEntry.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';

interface StepAveragesCardProps {
  averages: StepTimeAverage[];
  video: { minutes: number; videos: number } | null;
  /** « Une vidéo publiée » / « Un short publié » : la moyenne est bornée au format. */
  publishedLabel: string;
}

/**
 * Combien de temps prend chaque grande étape, en moyenne, sur une vidéo.
 *
 * Les étapes seulement, pas les tâches : la question est « où part mon temps », et à la
 * maille des sous-étapes la carte deviendrait un tableau qu'on ne lit plus. Le détail
 * reste sur chaque fiche.
 *
 * Les barres sont proportionnelles à l'étape la plus longue et non au total : c'est une
 * comparaison entre étapes, pas une répartition — même parti pris que `RankingBars`.
 */
export const StepAveragesCard = ({ averages, video, publishedLabel }: StepAveragesCardProps) => {
  const max = Math.max(1, ...averages.map((average) => average.averageMinutes));

  return (
    <Card className="h-fit">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Hourglass className="h-4 w-4" />
          Temps moyen par étape
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {video
            ? `${publishedLabel} prend ${formatDuration(video.minutes)} au total, en moyenne sur ${video.videos}.`
            : 'Temps chronométré, sur les étapes terminées.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {averages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pas encore assez de temps mesuré : une étape compte dès qu'elle est terminée sur une
            vidéo où du temps a été enregistré.
          </p>
        ) : (
          averages.map((average) => (
            <div key={average.stepId} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{average.stepName}</span>
                <span
                  className="shrink-0 tabular font-medium"
                  title={`Moyenne sur ${average.videos} vidéo(s) où l'étape est terminée`}
                >
                  {formatDuration(average.averageMinutes)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    · {average.videos}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(average.averageMinutes / max) * 100}%`,
                    backgroundColor: average.stepColor,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
