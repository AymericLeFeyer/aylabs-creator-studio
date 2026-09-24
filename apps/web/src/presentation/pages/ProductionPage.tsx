import { useState } from 'react';
import { Plus, Rows2, Rows3 } from 'lucide-react';
import {
  useProductionOverview,
  useProductions,
} from '../../application/production/usecases/useProductions.ts';
import type { ProductionFormat } from '../../domain/production/entities/Production.ts';
import { FORMAT_ROUTES } from '../../domain/production/entities/Production.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { Button } from '../components/ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { Fab } from '../components/Fab.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';
import { Block } from '../dashboard/Block.tsx';
import { PRODUCTION_COPY } from '../blocks/productionCopy.ts';

/**
 * La file d'un format : « Vidéos » ou « Shorts & Réels ».
 *
 * Les deux menus montent ce même écran. Ce qui les sépare n'est qu'un filtre — la file,
 * ses chiffres, ses créneaux et ses terminées ne portent que le format demandé — alors
 * que le planning, lui, continue de montrer les deux ensemble. Chaque morceau est un bloc
 * du catalogue paramétré par format (`production.<format>.…`), ajoutable au dashboard.
 */
export const ProductionPage = ({ format }: { format: ProductionFormat }) => {
  const copy = PRODUCTION_COPY[format];
  const { data: overview, isLoading } = useProductionOverview(format);
  const { data: done = [] } = useProductions({ statuses: ['done'], formats: [format] });
  const { preferences, set } = usePreferences();
  const [dialogOpen, setDialogOpen] = useState(false);

  const queue = overview?.queue ?? [];
  const openCreate = () => setDialogOpen(true);
  const dialog = (
    <ProductionDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultFormat={format} />
  );

  if (!isLoading && queue.length === 0 && done.length === 0) {
    return (
      <>
        <EmptyState
          title={copy.empty}
          description="Crée la première : elle portera son script, ses créneaux, ses produits et ses sponsos, puis se rattachera à sa sortie le jour de la publication."
          actionLabel={copy.create}
          onAction={openCreate}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tout l'en-tête disparaît sous `lg` : le titre est dans la barre d'application, et
          l'action est déjà un bouton flottant. */}
      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {copy.create}
        </Button>
      </div>

      {/* Pourquoi le menu porte une pastille rouge ou orange : avant tout le reste. */}
      <PageAlerts path={FORMAT_ROUTES[format]} />

      {/* Les chiffres de la file. Aucun ne dépend d'une période — ce sont des états. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Block id={`production.${format}.inQueue`} />
        <Block id={`production.${format}.progress`} />
        <Block id={`production.${format}.next`} />
        <Block id={`production.${format}.week`} />
        <Block id={`production.${format}.late`} />
        <Block id={`production.${format}.paused`} />
      </div>

      {/* Le planning se lit à l'arrivée, pas derrière un onglet. */}
      <Block id={`production.${format}.gantt`} />

      <Tabs defaultValue="queue">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="queue">File d'attente</TabsTrigger>
            <TabsTrigger value="done">Terminées ({done.length})</TabsTrigger>
          </TabsList>

          {/* Le repli est une préférence, pas un état d'écran. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => set({ compactQueue: !preferences.compactQueue })}
          >
            {preferences.compactQueue ? (
              <Rows3 className="h-4 w-4" />
            ) : (
              <Rows2 className="h-4 w-4" />
            )}
            {preferences.compactQueue ? 'Vue détaillée' : 'Vue compacte'}
          </Button>
        </div>

        <TabsContent value="queue">
          {/* `minmax(0,1fr)` et `min-w-0` : une piste de grille a `min-width: auto` et
              s'élargirait au titre le plus long au lieu de le tronquer. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Block id={`production.${format}.queue`} />
            <div className="min-w-0 space-y-4">
              <Block id={`production.${format}.slots`} />
              <Block id={`production.${format}.averages`} />
              {/* Le carnet vit à côté de la file : une idée se note pendant qu'on regarde
                  ce qu'on est en train de faire. */}
              <Block id={`production.${format}.ideas`} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="done">
          <Block id={`production.${format}.done`} />
        </TabsContent>
      </Tabs>

      <Fab label={copy.create} icon={Plus} onClick={openCreate} />
      {dialog}
    </div>
  );
};
