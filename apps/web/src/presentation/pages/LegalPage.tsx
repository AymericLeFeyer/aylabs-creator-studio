import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useLegalOverview } from '../../application/legal/usecases/useLegal.ts';
import { Button } from '../components/ui/button.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { AppBarActions } from '../hooks/useAppBar.tsx';
import { Block } from '../dashboard/Block.tsx';

/**
 * Le suivi administratif : la société, et une ligne par mois depuis sa création.
 *
 * Chaque morceau — fiche, compteurs, liens utiles, tableau mensuel — est un bloc du
 * catalogue (`blocks/legalBlocks.tsx`), ajoutable au dashboard au survol.
 */
export const LegalPage = () => {
  const { data, isLoading } = useLegalOverview();

  if (!isLoading && data && data.obligations.length === 0) {
    return (
      <EmptyState
        title="Aucune obligation configurée"
        description="Ajoute les déclarations et démarches qui reviennent chaque mois : elles deviendront une case à cocher par mois, et une alerte sur le dashboard dès qu'une échéance approche."
        actionLabel="Configurer les obligations"
        actionTo="/parametres?onglet=societe"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Sur mobile, la roue crantée remonte dans la barre d'application. */}
      <AppBarActions>
        <Button asChild variant="ghost" size="icon">
          <Link to="/parametres?onglet=societe" aria-label="Société et obligations">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </AppBarActions>

      <div className="hidden flex-wrap items-start justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-lg font-semibold">Légal</h1>
          <p className="text-sm text-muted-foreground">
            Une ligne par mois depuis la création de la société, une case par obligation.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/parametres?onglet=societe">
            <Settings className="h-4 w-4" />
            Société &amp; obligations
          </Link>
        </Button>
      </div>

      {/* Pourquoi le menu porte une pastille : tout en haut, avant la fiche. */}
      <PageAlerts path="/legal" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Block id="legal.company" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <Block id="legal.done" />
          <Block id="legal.late" />
        </div>
      </div>

      {/* Entre la fiche et le tableau : on ouvre le portail, on fait la démarche, on revient
          cocher la case juste en dessous. */}
      <Block id="legal.bookmarks" />

      <Block id="legal.table" />
    </div>
  );
};
