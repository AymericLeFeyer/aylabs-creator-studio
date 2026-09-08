import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Radio } from 'lucide-react';
import type { Video } from '../../../domain/video/entities/Video.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
import { formatDate } from '../../../shared/format.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { Card } from '../ui/card.tsx';

/**
 * Les dernières sorties, une à la fois, en pleine largeur.
 *
 * Elles **ignorent la période** de la barre de filtres : « ma dernière vidéo marche
 * comment » ne se pose pas dans une fenêtre de temps, et une période de sept jours
 * viderait le bloc précisément quand on vient le lire. Les chiffres sont des cumuls
 * depuis la sortie, relevés par la collecte — ils ne s'additionnent pas avec les totaux
 * de la période affichés juste au-dessus, qui comptent aussi les vidéos plus anciennes.
 *
 * **Trois sorties et pas une seule**, parce qu'une vidéo ne se juge pas dans l'absolu :
 * 12 000 vues ne veulent rien dire tant qu'on ne sait pas ce que les deux précédentes ont
 * fait. Elles défilent une par une plutôt que côte à côte — la comparaison se fait sur les
 * mêmes cases, au même endroit, ce que trois colonnes rétrécies rendraient impossible.
 *
 * `stats.updatedAt` à `null` veut dire « pas encore mesurée » et non « 0 vue » : le bloc
 * affiche alors « — » plutôt qu'une série de zéros, qui seraient un mensonge.
 */
const RANK_LABELS = ['Dernière sortie', 'Avant-dernière sortie'];

export const LatestVideoCard = ({ videos }: { videos: Video[] }) => {
  const privacy = usePrivacy();
  const [index, setIndex] = useState(0);

  /**
   * La liste rétrécit quand on change de chaîne dans les filtres : sans ce repli, le
   * bloc se viderait en gardant un rang qui ne désigne plus rien. Le recadrage est
   * **dérivé pendant le rendu** et non posé dans un effet — `react-hooks/set-state-in-effect`
   * refuse l'autre, et c'est déjà le patron des formulaires du projet.
   */
  const [known, setKnown] = useState(videos.length);
  if (known !== videos.length) {
    setKnown(videos.length);
    if (index >= videos.length) setIndex(0);
  }

  const video = videos[index];
  if (!video) return null;

  const measured = video.stats.updatedAt !== null;
  /** « — » l'emporte sur « ••• » : ne pas savoir se dit avant de refuser de dire. */
  const value = (formatted: string) => (measured ? formatted : '—');

  const stats = [
    { label: 'Vues', value: value(privacy.count(video.stats.views, 'views')) },
    {
      label: 'Heures vues',
      value: value(privacy.hours(video.stats.watchMinutes / 60, 'views')),
    },
    {
      label: 'Abonnés gagnés',
      value: value(privacy.signed(video.stats.subscribersGained, 'subscribers')),
    },
    { label: 'Likes', value: value(privacy.count(video.stats.likes, 'views')) },
    { label: 'Commentaires', value: value(privacy.count(video.stats.comments, 'views')) },
    {
      label: 'AdSense',
      value: value(privacy.money(video.stats.estimatedRevenueCents, 'adsense')),
    },
  ];

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <a
          href={youtubeUrl(video.externalId)}
          target="_blank"
          rel="noreferrer"
          className="group flex min-w-0 flex-1 items-center gap-4"
        >
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-20 w-36 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span
              className="h-20 w-36 shrink-0 rounded-md"
              style={{ backgroundColor: `${video.channelColor}33` }}
              aria-hidden
            />
          )}

          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Radio className="h-3.5 w-3.5" aria-hidden />
              {RANK_LABELS[index] ?? `Sortie n° ${index + 1}`}
            </span>
            <span className="mt-1 block truncate text-lg font-semibold group-hover:underline">
              {video.title}
              <ExternalLink
                className="ml-1.5 inline h-3.5 w-3.5 align-baseline text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: video.channelColor }}
                  aria-hidden
                />
                {video.channelName}
              </span>
              <span className="tabular">{formatDate(video.date)}</span>
              {!measured && <span>pas encore mesurée</span>}
            </span>
          </span>
        </a>

        {/* Les compteurs à droite sur grand écran, sous la fiche en dessous : la
            miniature et le titre doivent rester lisibles avant de rétrécir les chiffres. */}
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-3 lg:grid-cols-6 lg:border-l lg:border-border lg:pl-6">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="text-base font-semibold tabular">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {videos.length > 1 && <Pager index={index} total={videos.length} onChange={setIndex} />}
      </div>
    </Card>
  );
};

/**
 * Les deux chevrons et le rang.
 *
 * Ils s'arrêtent aux bornes plutôt que de boucler : trois éléments se parcourent d'un
 * bout à l'autre en deux clics, et un enroulement ferait repartir de la plus récente sans
 * qu'on l'ait demandé — on ne saurait plus laquelle on regarde. Le rang est écrit à côté
 * pour cette raison exacte.
 */
const Pager = ({
  index,
  total,
  onChange,
}: {
  index: number;
  total: number;
  onChange: (next: number) => void;
}) => (
  <div className="flex shrink-0 items-center gap-1 self-end lg:self-center lg:border-l lg:border-border lg:pl-4">
    <button
      type="button"
      onClick={() => onChange(index - 1)}
      disabled={index === 0}
      aria-label="Sortie plus récente"
      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
    </button>
    <span className="w-10 text-center text-xs tabular text-muted-foreground">
      {index + 1} / {total}
    </span>
    <button
      type="button"
      onClick={() => onChange(index + 1)}
      disabled={index === total - 1}
      aria-label="Sortie précédente"
      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <ChevronRight className="h-4 w-4" aria-hidden />
    </button>
  </div>
);
