import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ExternalLink,
  Gift,
  Handshake,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useDeleteProduction,
  useDeleteSlot,
  useProduction,
  useProductionSlots,
  useProductionSteps,
  useToggleStep,
  useUpdateProduction,
  useUpdateSlot,
} from '../../application/production/usecases/useProductions.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import { STATUS_COLORS, STATUS_LABELS } from '../../domain/production/entities/Production.ts';
import type { ProductionSlot } from '../../domain/production/entities/ProductionSlot.ts';
import { formatSlotTime } from '../../domain/production/entities/ProductionSlot.ts';
import { PRODUCT_STATUS_LABELS } from '../../domain/product/entities/Product.ts';
import { SPONSORSHIP_STATUS_LABELS } from '../../domain/sponsorship/entities/Sponsorship.ts';
import { formatDate, formatMoney } from '../../shared/format.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { StepChips, StepProgress } from '../components/production/StepChips.tsx';
import { ScriptEditor } from '../components/production/ScriptEditor.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';
import { ProductDialog } from '../components/forms/ProductDialog.tsx';
import { SponsorshipDialog } from '../components/forms/SponsorshipDialog.tsx';
import { SlotDialog } from '../components/forms/SlotDialog.tsx';
import { PublishDialog } from '../components/forms/PublishDialog.tsx';
import { cn } from '../../shared/cn.ts';

export const ProductionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: production, isLoading } = useProduction(id);
  const { data: steps = [] } = useProductionSteps();
  const { data: slots = [] } = useProductionSlots({ productionIds: id ? [id] : [] });
  const { data: products = [] } = useProducts({ productionIds: id ? [id] : [] });
  const { data: sponsorships = [] } = useSponsorships({ productionIds: id ? [id] : [] });

  const update = useUpdateProduction();
  const remove = useDeleteProduction();
  const toggleStep = useToggleStep();
  const updateSlot = useUpdateSlot();
  const deleteSlot = useDeleteSlot();

  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [sponsorshipOpen, setSponsorshipOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ProductionSlot | null>(null);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />;
  }
  if (!production || !id) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Cette vidéo n'existe plus.{' '}
        <Link to="/production" className="underline">
          Retour à la production
        </Link>
      </Card>
    );
  }

  const pendingSponsorships = sponsorships
    .filter((sponsorship) => sponsorship.status !== 'paid' && sponsorship.status !== 'cancelled')
    .reduce((total, sponsorship) => total + sponsorship.amountCents, 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/production')}>
        <ArrowLeft className="h-4 w-4" />
        Production
      </Button>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{production.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" style={{ color: STATUS_COLORS[production.status] }}>
                {STATUS_LABELS[production.status]}
              </Badge>
              <span>{production.channelName ?? 'Chaîne à décider'}</span>
              {production.plannedDate && (
                <span>· sortie visée {formatDate(production.plannedDate)}</span>
              )}
              {production.videoExternalId && (
                <a
                  href={`https://www.youtube.com/watch?v=${production.videoExternalId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Voir la vidéo
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <Upload className="h-4 w-4" />
              {production.videoId ? 'Changer la sortie' : 'Marquer publiée'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm(`Supprimer « ${production.title} » ?`)) {
                  remove.mutate(production.id, { onSuccess: () => navigate('/production') });
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              <span className="sr-only">Supprimer</span>
            </Button>
          </div>
        </div>

        {production.status === 'paused' && production.pausedReason && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            En pause : {production.pausedReason}
          </p>
        )}

        <div className="space-y-2">
          <StepChips
            production={production}
            steps={steps}
            size="md"
            onToggle={(stepId, checked) =>
              toggleStep.mutate({ id: production.id, stepId, checked })
            }
          />
          <StepProgress production={production} steps={steps} />
        </div>
      </Card>

      <Tabs defaultValue="script">
        <TabsList>
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="slots">Créneaux ({slots.length})</TabsTrigger>
          <TabsTrigger value="money">
            Produits &amp; sponsos ({products.length + sponsorships.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="script">
          <ScriptEditor
            value={production.script}
            saving={update.isPending}
            onSave={(script) => update.mutateAsync({ id: production.id, input: { script } })}
          />
        </TabsContent>

        <TabsContent value="slots">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4" />
                Créneaux de travail
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSlot(null);
                  setSlotOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Poser un créneau
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {slots.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucun créneau. Pose une date pour t'engager sur un moment de travail.
                </p>
              ) : (
                slots.map((slot) => (
                  <div
                    key={slot.id}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm',
                      slot.done && 'opacity-60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateSlot.mutate({ id: slot.id, input: { done: !slot.done } })
                      }
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        slot.done
                          ? 'border-transparent bg-[var(--positive)] text-white'
                          : 'border-border hover:border-foreground',
                      )}
                      title={slot.done ? 'Marquer à faire' : 'Marquer fait'}
                    >
                      {slot.done && <Check className="h-3.5 w-3.5" />}
                      <span className="sr-only">{slot.done ? 'Fait' : 'À faire'}</span>
                    </button>

                    <span className="min-w-0 flex-1">
                      <span className={cn('block font-medium', slot.done && 'line-through')}>
                        {slot.label || slot.stepName || 'Créneau'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(slot.date)} · {formatSlotTime(slot)}
                        {slot.stepName && slot.label ? ` · ${slot.stepName}` : ''}
                      </span>
                    </span>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingSlot(slot);
                          setSlotOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSlot.mutate(slot.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="money">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4" />
                  Produits
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setProductOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {products.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Aucun produit rattaché.
                  </p>
                ) : (
                  products.map((product) => (
                    <Link
                      key={product.id}
                      to="/partenariats?onglet=produits"
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {product.brandName ?? 'Sans marque'} ·{' '}
                          {PRODUCT_STATUS_LABELS[product.status]}
                        </span>
                      </span>
                      <span className="shrink-0 tabular text-[var(--in-kind)]">
                        {formatMoney(product.valueCents)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Handshake className="h-4 w-4" />
                  Sponsos
                  {pendingSponsorships > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {formatMoney(pendingSponsorships)} à encaisser
                    </span>
                  )}
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setSponsorshipOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {sponsorships.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Aucune sponso rattachée.
                  </p>
                ) : (
                  sponsorships.map((sponsorship) => (
                    <Link
                      key={sponsorship.id}
                      to="/partenariats?onglet=sponsors"
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{sponsorship.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sponsorship.brandName ?? 'Sans marque'} ·{' '}
                          {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 tabular',
                          sponsorship.status === 'paid'
                            ? 'text-[var(--positive)]'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatMoney(sponsorship.amountCents)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-5">
            {production.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{production.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune note. Elles se saisissent dans « Modifier ».
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ProductionDialog open={editOpen} onOpenChange={setEditOpen} production={production} />
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} production={production} />
      <ProductDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        defaultProductionId={production.id}
      />
      <SponsorshipDialog
        open={sponsorshipOpen}
        onOpenChange={setSponsorshipOpen}
        defaultProductionId={production.id}
      />
      <SlotDialog
        open={slotOpen}
        onOpenChange={setSlotOpen}
        productionId={production.id}
        slot={editingSlot}
      />
    </div>
  );
};
