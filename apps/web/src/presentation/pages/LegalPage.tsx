import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ListChecks, Settings } from 'lucide-react';
import {
  useLegalBookmarks,
  useLegalOverview,
  useToggleLegalCheck,
} from '../../application/legal/usecases/useLegal.ts';
import type { LegalMonth, LegalMonthItem } from '../../domain/legal/entities/Legal.ts';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  dueLabel,
  formatMonth,
} from '../../domain/legal/entities/Legal.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { LegalAlertsCard } from '../components/legal/LegalAlertsCard.tsx';
import { LegalBookmarks } from '../components/legal/LegalBookmarks.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Le suivi administratif : la société, et une ligne par mois depuis sa création.
 *
 * Les mois sont découpés **par année** plutôt que déroulés d'un bloc : cinq ans
 * d'activité font soixante lignes, et celle qu'on vient cocher est presque toujours
 * dans l'année en cours. L'année choisie vit dans l'URL (`?annee=`), pour qu'une alerte
 * du dashboard puisse mener droit au bon tableau.
 */
export const LegalPage = () => {
  const { data, isLoading } = useLegalOverview();
  const { data: bookmarks = [] } = useLegalBookmarks();
  const toggle = useToggleLegalCheck();

  const [searchParams, setSearchParams] = useSearchParams();

  const years = useMemo(() => {
    const set = new Set((data?.months ?? []).map((month) => month.month.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data?.months]);

  const requested = searchParams.get('annee');
  const year = requested && years.includes(requested) ? requested : years[0];

  const months = useMemo(
    () => (data?.months ?? []).filter((month) => month.month.startsWith(year ?? '')),
    [data?.months, year],
  );

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

  const company = data?.company;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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

      {data && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* La fiche de la société : ce qu'on recopie sur une facture, sans avoir à
                ouvrir un autre outil. */}
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Société
                </span>
                {company?.foundedOn && (
                  <span className="text-xs text-muted-foreground">
                    créée le {formatDate(company.foundedOn)}
                  </span>
                )}
              </div>

              <p className="mt-2 text-xl font-semibold">
                {company?.name || <span className="text-muted-foreground">Sans nom</span>}
              </p>

              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Field label="Forme juridique" value={company?.legalForm} />
                <Field label="SIRET" value={company?.siret} />
                <Field label="N° TVA" value={company?.vatNumber} />
                <Field label="Adresse" value={company?.address} />
              </dl>

              {company?.notes && (
                <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-sm text-muted-foreground">
                  {company.notes}
                </p>
              )}

              {!company?.name && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Renseigne les informations dans{' '}
                  <Link to="/parametres?onglet=societe" className="underline">
                    Paramètres → Société
                  </Link>
                  . La date de création décide du premier mois du tableau.
                </p>
              )}
            </Card>

            <div className="grid gap-3 grid-cols-2 xl:grid-cols-1">
              <StatCard
                label="Cases cochées"
                value={`${formatNumber(data.totals.done)} / ${formatNumber(data.totals.expected)}`}
                hint="depuis la création"
                icon={<CheckCircle2 className="h-4 w-4" />}
                accent={
                  data.totals.done === data.totals.expected && data.totals.expected > 0
                    ? 'var(--positive)'
                    : undefined
                }
              />
              <StatCard
                label="En retard"
                value={formatNumber(data.totals.late)}
                hint={data.totals.late === 0 ? 'tout est à jour' : 'échéances dépassées'}
                icon={<ListChecks className="h-4 w-4" />}
                accent={data.totals.late > 0 ? 'var(--negative)' : undefined}
              />
            </div>
          </div>

          {/* Entre la fiche et le tableau : c'est là qu'on les cherche — on ouvre le
              portail, on fait la démarche, on revient cocher la case juste en dessous. */}
          <LegalBookmarks bookmarks={bookmarks} />

          <LegalAlertsCard alerts={data.alerts} />

          {years.length > 1 && (
            <Tabs
              value={year ?? ''}
              onValueChange={(value) => setSearchParams({ annee: value }, { replace: true })}
            >
              <TabsList>
                {years.map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{months.length} mois</CardTitle>
              <p className="text-xs text-muted-foreground">
                Coche au fur et à mesure : la case garde la date à laquelle tu l'as cochée, et
                recocher ne la repousse pas.
              </p>
            </CardHeader>

            {/* Le tableau défile horizontalement dans son propre conteneur : avec dix
                obligations, la page entière ne doit pas partir en travers. */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-40">Mois</TableHead>
                    {data.obligations.map((obligation) => (
                      <TableHead key={obligation.id} className="min-w-36">
                        {obligation.label}
                        {dueLabel(obligation.dayOfMonth) && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {dueLabel(obligation.dayOfMonth)}
                          </span>
                        )}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Avancement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((month) => (
                    <MonthRow
                      key={month.month}
                      month={month}
                      onToggle={(item, checked) =>
                        toggle.mutate({
                          obligationId: item.obligationId,
                          month: month.month,
                          checked,
                        })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className={cn('tabular', !value && 'text-muted-foreground')}>{value || '—'}</dd>
  </div>
);

/**
 * Une ligne = un mois. La case cochée affiche la **date de réalisation** plutôt qu'un
 * simple « Fait » : c'est elle qu'on cherche quand un organisme demande quand la
 * déclaration a été faite.
 */
const MonthRow = ({
  month,
  onToggle,
}: {
  month: LegalMonth;
  onToggle: (item: LegalMonthItem, checked: boolean) => void;
}) => {
  const complete = month.doneCount === month.items.length && month.items.length > 0;

  return (
    <TableRow className={cn(month.lateCount > 0 && 'bg-[var(--negative)]/5')}>
      <TableCell className="whitespace-nowrap font-medium">
        {formatMonth(month.month)}
        {month.lateCount > 0 && (
          <Badge variant="outline" className="ml-2 border-[var(--negative)] text-[var(--negative)]">
            {month.lateCount} en retard
          </Badge>
        )}
      </TableCell>

      {month.items.map((item) => (
        <TableCell key={item.obligationId}>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={item.checked}
              onCheckedChange={(value) => onToggle(item, value === true)}
              aria-label={`${item.label} — ${formatMonth(month.month)}`}
            />
            <span style={{ color: STATUS_COLORS[item.status] }}>
              {item.checked && item.checkedAt
                ? formatDate(item.checkedAt.slice(0, 10))
                : STATUS_LABELS[item.status]}
            </span>
          </label>
        </TableCell>
      ))}

      <TableCell className="text-right text-sm tabular">
        <span style={complete ? { color: 'var(--positive)' } : undefined}>
          {month.doneCount} / {month.items.length}
        </span>
      </TableCell>
    </TableRow>
  );
};
