import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ListChecks } from 'lucide-react';
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
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { Badge } from '../components/ui/badge.tsx';
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
import { StatDetails } from '../components/StatDetails.tsx';
import { LegalBookmarks } from '../components/legal/LegalBookmarks.tsx';
import { useWidgetOverrides } from '../dashboard/widgetContext.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

/** La fiche de la société : ce qu'on recopie sur une facture, sans ouvrir un autre outil. */
export const CompanyBlock = () => {
  const { data } = useLegalOverview();
  // Le nom reste lisible : il est public. Ce sont les numéros et l'adresse qu'on masque.
  const hideIdentity = usePrivacy().isMasked('company');
  const overrides = useWidgetOverrides();
  const company = data?.company;
  const Icon = overrides?.icon ?? Building2;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-4 w-4" />
          {overrides?.title ?? 'Société'}
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
        <Field label="SIRET" value={company?.siret} masked={hideIdentity} />
        <Field label="N° TVA" value={company?.vatNumber} masked={hideIdentity} />
        <Field label="Adresse" value={company?.address} masked={hideIdentity} />
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
  );
};

/** « 2026-03 » → « mars 2026 ». */
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export const LegalDoneCard = () => {
  const { data } = useLegalOverview();
  const totals = data?.totals;
  // Obligation par obligation : laquelle traîne se voit tout de suite.
  const perObligation = useMemo(() => {
    const rows = new Map<string, { label: string; done: number; expected: number }>();
    for (const month of data?.months ?? []) {
      for (const item of month.items) {
        const row = rows.get(item.obligationId) ?? { label: item.label, done: 0, expected: 0 };
        row.expected += 1;
        if (item.checked) row.done += 1;
        rows.set(item.obligationId, row);
      }
    }
    return [...rows.entries()].map(([id, row]) => ({ id, ...row }));
  }, [data]);
  const months = data?.months ?? [];
  return (
    <StatCard
      label="Cases cochées"
      value={totals ? `${formatNumber(totals.done)} / ${formatNumber(totals.expected)}` : '…'}
      hint="depuis la création"
      icon={<CheckCircle2 className="h-4 w-4" />}
      details={
        <StatDetails
          title="Par obligation"
          rows={perObligation.map((row) => ({
            key: row.id,
            label: row.label,
            value: `${formatNumber(row.done)} / ${formatNumber(row.expected)}`,
            tone: row.done < row.expected ? 'warning' : undefined,
          }))}
          max={10}
          empty="Aucune obligation active."
          note={
            months.length > 0
              ? `Une case par obligation et par mois, de ${monthLabel(months.at(-1)!.month)} à ${monthLabel(months[0]!.month)}. Une obligation archivée ne compte plus.`
              : undefined
          }
        />
      }
      accent={
        totals && totals.done === totals.expected && totals.expected > 0
          ? 'var(--positive)'
          : undefined
      }
    />
  );
};

export const LegalLateCard = () => {
  const { data } = useLegalOverview();
  const late = data?.totals.late ?? 0;
  const lateItems = useMemo(
    () =>
      (data?.months ?? [])
        .flatMap((month) =>
          month.items
            .filter((item) => item.status === 'late')
            .map((item) => ({ month: month.month, item })),
        )
        .sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate)),
    [data],
  );
  return (
    <StatCard
      label="Obligations en retard"
      value={data ? formatNumber(late) : '…'}
      hint={late === 0 ? 'tout est à jour' : 'échéances dépassées'}
      icon={<ListChecks className="h-4 w-4" />}
      details={
        <StatDetails
          title="Échéances dépassées, la plus ancienne d'abord"
          rows={lateItems.map(({ month, item }) => ({
            key: `${item.obligationId}:${month}`,
            label: item.label,
            sub: `${monthLabel(month)} · échéance le ${formatDate(item.dueDate)}`,
            tone: 'danger',
          }))}
          max={8}
          empty="Tout est à jour."
          note="Une obligation sans jour limite n'est en retard qu'une fois son mois terminé."
        />
      }
      accent={late > 0 ? 'var(--negative)' : undefined}
    />
  );
};

export const LegalBookmarksBlock = () => {
  const { data: bookmarks = [] } = useLegalBookmarks();
  return <LegalBookmarks bookmarks={bookmarks} />;
};

/**
 * Le tableau mensuel, découpé **par année** : cinq ans d'activité font soixante lignes, et
 * celle qu'on vient cocher est presque toujours dans l'année en cours. L'année vit dans
 * l'URL (`?annee=`), pour qu'une alerte mène droit au bon tableau.
 */
export const LegalTableBlock = () => {
  const { data } = useLegalOverview();
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

  if (!data) return <BlockSkeleton />;

  return (
    <div className="space-y-4">
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
            Coche au fur et à mesure : la case garde la date à laquelle tu l'as cochée, et recocher
            ne la repousse pas.
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
    </div>
  );
};

/**
 * Une ligne de la fiche société.
 *
 * `masked` remplace la valeur sans faire disparaître le libellé : un SIRET absent et un
 * SIRET qu'on refuse de montrer n'appellent pas la même conclusion, et une ligne qui
 * s'évanouirait laisserait croire que la fiche est incomplète.
 */
const Field = ({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string | null | undefined;
  masked?: boolean;
}) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className={cn('tabular', !value && !masked && 'text-muted-foreground')}>
      {masked ? MASKED_TEXT : value || '—'}
    </dd>
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
