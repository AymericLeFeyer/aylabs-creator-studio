import { PageAlerts } from '../components/PageAlerts.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { Block } from '../dashboard/Block.tsx';

/**
 * Les produits reçus des marques : ce qui arrive, ce qui est arrivé, et ce qu'il reste à
 * tourner.
 *
 * **Les quatre cartes parlent de produits et de rien d'autre.** Deux états, qui ignorent
 * la période parce qu'un colis attendu depuis mars l'est toujours en juin (« Attendus »,
 * « À tourner »), et un flux borné par elle (« Reçus sur la période »). La table porte sa
 * case « Reste à faire uniquement » et son formulaire (`ProductsTable`) : c'est un bloc
 * autonome, posable tel quel sur le dashboard.
 */
export const ProductsPage = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Produits</h1>
        <p className="text-sm text-muted-foreground">
          Un produit reçu alimente tes revenus en nature automatiquement — pas de double saisie, et
          pas de double comptage.
        </p>
      </div>
      <PeriodPicker />
    </div>

    <PageAlerts path="/produits" />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Block id="products.pending" />
      <Block id="products.pendingValue" />
      <Block id="products.received" />
      <Block id="products.toShoot" />
    </div>

    <Block id="products.table" />
  </div>
);
