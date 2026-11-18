import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { Block } from '../dashboard/Block.tsx';

/**
 * Production → Directs : les chiffres de la période (nombre, pic moyen, viewers moyens),
 * l'historique en liste, et les directs à faire — datés, ils apparaissent dans le planning.
 * Un direct est repéré par YouTube (`liveStreamingDetails`) à la collecte ; pic et moyenne
 * viennent de YouTube Analytics (chaînes connectées en OAuth).
 */
export const LivePage = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Directs</h1>
        <p className="text-sm text-muted-foreground">
          Tes précédents directs avec leurs chiffres, et ceux que tu veux faire.
        </p>
      </div>
      <PeriodPicker />
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Block id="live.count" />
      <Block id="live.peak" />
      <Block id="live.average" />
    </div>

    <Block id="live.history" />
    <Block id="live.ideas" />
  </div>
);
