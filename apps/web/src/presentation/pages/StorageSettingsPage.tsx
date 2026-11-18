import { useState } from 'react';
import { Database, HardDrive, Loader2, Trash2, Video } from 'lucide-react';
import {
  useStorage,
  useCompactStorage,
  usePurgeStorage,
} from '../../application/storage/usecases/useStorage.ts';
import {
  STORAGE_GROUP_LABELS,
  STORAGE_GROUP_ORDER,
  formatBytes,
  type StorageCategory,
  type StoragePurgeOption,
} from '../../domain/storage/entities/Storage.ts';
import { formatNumber } from '../../shared/format.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';

/** Une barre proportionnelle : la longueur dit le poids relatif, le texte la valeur. */
const Bar = ({
  value,
  max,
  tone = 'bg-primary',
}: {
  value: number;
  max: number;
  tone?: string;
}) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
    <div
      className={`h-full rounded-full ${tone}`}
      style={{ width: `${max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0}%` }}
    />
  </div>
);

const Figure = ({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail?: string;
}) => (
  <Card>
    <CardContent className="space-y-1 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </CardContent>
  </Card>
);

const optionLabel = (option: StoragePurgeOption): string =>
  option.olderThanDays === 0
    ? `Tout (${formatNumber(option.count)} · ${formatBytes(option.bytes)})`
    : `De plus de ${option.olderThanDays} jours (${formatNumber(option.count)} · ${formatBytes(option.bytes)})`;

const PurgeControl = ({ category }: { category: StorageCategory }) => {
  const purge = usePurgeStorage();
  const spec = category.purge!;
  const [days, setDays] = useState(spec.options.at(-1)?.olderThanDays ?? 0);
  const option = spec.options.find((entry) => entry.olderThanDays === days) ?? spec.options[0]!;

  const run = () => {
    const message = `${spec.label} : ${formatNumber(option.count)} élément(s), ${formatBytes(option.bytes)}.\n\n${spec.keeps}\n\nCette action est définitive.`;
    if (!window.confirm(message)) return;
    purge.mutate({ kind: spec.kind, olderThanDays: option.olderThanDays, compact: true });
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        {spec.options.length > 1 && (
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={option.olderThanDays}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {spec.options.map((entry) => (
              <option key={entry.olderThanDays} value={entry.olderThanDays}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="outline" onClick={run} disabled={purge.isPending}>
          {purge.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {spec.label}
          {spec.options.length === 1 && ` (${formatBytes(option.bytes)})`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{spec.keeps}</p>
      {purge.error && <p className="text-xs text-destructive">{purge.error.message}</p>}
      {purge.data && (
        <p className="text-xs text-cash">
          {formatNumber(purge.data.deleted)} retiré(s), {formatBytes(purge.data.freedBytes)} libérés
          {purge.data.compacted &&
            ` · base ${formatBytes(purge.data.databaseBytesBefore)} → ${formatBytes(purge.data.databaseBytesAfter)}`}
          .
        </p>
      )}
    </div>
  );
};

const CategoryRow = ({ category, max }: { category: StorageCategory; max: number }) => (
  <div className="py-3">
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{category.label}</div>
        <div className="text-xs text-muted-foreground">{category.description}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums">{formatBytes(category.bytes)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(category.count)} élément{category.count > 1 ? 's' : ''}
        </div>
      </div>
    </div>
    <div className="mt-2">
      <Bar value={category.bytes} max={max} />
    </div>
    {category.purge && <PurgeControl category={category} />}
  </div>
);

/** Paramètres → Stockage : ce que le studio garde, et de quoi le purger. */
export const StorageSettingsPage = () => {
  const { data, isLoading, error, refetch, isFetching } = useStorage();
  const compact = useCompactStorage();

  if (isLoading) return <p className="text-sm text-muted-foreground">Mesure du stockage…</p>;
  if (error || !data)
    return <p className="text-sm text-destructive">{error?.message ?? 'Mesure impossible.'}</p>;

  const max = Math.max(...data.categories.map((category) => category.bytes), 1);
  const maxTable = Math.max(...data.tables.map((table) => table.bytes), 1);
  const purgeable = data.categories.reduce(
    (sum, category) =>
      sum + (category.purge?.options.find((option) => option.olderThanDays === 0)?.bytes ?? 0),
    0,
  );
  const diskUsed = data.disk ? data.disk.totalBytes - data.disk.freeBytes : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          icon={HardDrive}
          label="Total du studio"
          value={formatBytes(data.totalBytes)}
          detail={
            data.disk
              ? `${formatBytes(data.disk.freeBytes)} libres sur ${formatBytes(data.disk.totalBytes)}`
              : undefined
          }
        />
        <Figure
          icon={Database}
          label="Base de données"
          value={formatBytes(data.database.fileBytes)}
          detail={`${formatBytes(data.database.usedBytes)} utilisés · journal ${formatBytes(data.database.walBytes)}`}
        />
        <Figure
          icon={Video}
          label="Vidéos déposées"
          value={formatBytes(data.uploads.bytes)}
          detail={`${formatNumber(data.uploads.files)} fichier(s)${data.uploads.missingFiles > 0 ? ` · ${data.uploads.missingFiles} supprimé(s)` : ''}`}
        />
        <Figure
          icon={Trash2}
          label="Purgeable"
          value={formatBytes(purgeable)}
          detail={`+ ${formatBytes(data.database.reclaimableBytes)} récupérables en compactant`}
        />
      </div>

      {data.disk && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Disque du serveur</span>
              <span className="tabular-nums">
                {formatBytes(diskUsed)} / {formatBytes(data.disk.totalBytes)}
              </span>
            </div>
            <Bar value={diskUsed} max={data.disk.totalBytes} tone="bg-[var(--negative)]" />
            <p className="text-xs text-muted-foreground">
              Le studio en occupe {formatBytes(data.totalBytes)}, soit{' '}
              {((data.totalBytes / data.disk.totalBytes) * 100).toLocaleString('fr-FR', {
                maximumFractionDigits: 1,
              })}{' '}
              % du disque.
            </p>
          </CardContent>
        </Card>
      )}

      {STORAGE_GROUP_ORDER.map((group) => {
        const categories = data.categories.filter((category) => category.group === group);
        if (categories.length === 0) return null;
        const subtotal = categories.reduce((sum, category) => sum + category.bytes, 0);
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between">
                {STORAGE_GROUP_LABELS[group]}
                <span className="text-sm font-normal tabular-nums text-muted-foreground">
                  {formatBytes(subtotal)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {categories.map((category) => (
                <CategoryRow key={category.id} category={category} max={max} />
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Compacter la base</CardTitle>
          <CardDescription>
            Supprimer des données ne rétrécit pas le fichier : l’espace libéré reste réservé à la
            base. Compacter le rend au disque ; les purges ci-dessus le font déjà. Bloque brièvement
            les écritures.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => compact.mutate(undefined)}
            disabled={compact.isPending}
          >
            {compact.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Compacter ({formatBytes(data.database.reclaimableBytes)} récupérables)
          </Button>
          <Button variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
            Remesurer
          </Button>
          {compact.data && (
            <span className="text-sm text-cash">
              {formatBytes(compact.data.databaseBytesBefore)} →{' '}
              {formatBytes(compact.data.databaseBytesAfter)}
            </span>
          )}
          {compact.error && (
            <span className="text-sm text-destructive">{compact.error.message}</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tables les plus lourdes</CardTitle>
          <CardDescription>
            Index compris. Les {Math.min(15, data.tables.length)} premières sur {data.tables.length}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {data.tables.slice(0, 15).map((table) => (
            <div key={table.name} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate font-mono text-xs">{table.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatNumber(table.rows)} ligne{table.rows > 1 ? 's' : ''} ·{' '}
                  {formatBytes(table.bytes)}
                </span>
              </div>
              <Bar value={table.bytes} max={maxTable} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
