import { PageAlerts } from '../components/PageAlerts.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { Block } from '../dashboard/Block.tsx';

/**
 * Les sponsos : ce qu'il faut livrer, ce qu'il faut relancer, et ce qui est encaissé.
 *
 * Sa pastille, dans le menu, compte les **paiements en attente** — la vidéo est livrée,
 * l'argent est dû —, parce que c'est le seul statut qui coûte de l'argent si on l'oublie.
 *
 * Les quatre cartes suivent l'ordre de la table (`SPONSORSHIP_SORT_RANK`) : à relancer,
 * à livrer, puis l'argent. « À encaisser » et les deux premières sont des **états** et
 * ignorent la période ; « Encaissées » est un **flux** borné par elle, comme le CA.
 */
export const SponsorsPage = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Sponsors</h1>
        <p className="text-sm text-muted-foreground">
          Une sponso payée alimente tes revenus automatiquement — pas de double saisie, et pas de
          double comptage.
        </p>
      </div>
      <PeriodPicker />
    </div>

    <PageAlerts path="/sponsors" />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Block id="sponsors.awaiting" />
      <Block id="sponsors.toDeliver" />
      <Block id="sponsors.pending" />
      <Block id="sponsors.paid" />
    </div>

    <Block id="sponsors.table" />
  </div>
);
