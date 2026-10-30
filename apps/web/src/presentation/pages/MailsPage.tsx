import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Paperclip, PenSquare, RefreshCw, Search } from 'lucide-react';
import {
  useMailSettings,
  useMailStats,
  useMailThreads,
  useSyncMail,
} from '../../application/mail/usecases/useMails.ts';
import {
  MAIL_VIEWS,
  addressLabel,
  type MailThreadSummary,
  type MailView,
} from '../../domain/mail/entities/Mail.ts';
import { formatDate, formatDateTime } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { AppBarActions } from '../hooks/useAppBar.tsx';
import { MailThreadPanel } from '../components/mail/MailThreadPanel.tsx';
import { MailComposer, type MailDraft } from '../components/mail/MailComposer.tsx';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const ThreadRow = ({
  thread,
  active,
  onOpen,
}: {
  thread: MailThreadSummary;
  active: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    className={cn(
      'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent',
      active && 'bg-secondary',
    )}
  >
    <span className="flex min-w-0 items-center gap-2">
      {thread.unreadCount > 0 && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--today)]" aria-label="Non lu" />
      )}
      <span
        className={cn('min-w-0 flex-1 truncate text-sm', thread.unreadCount > 0 && 'font-semibold')}
      >
        {thread.participants.map(addressLabel).join(', ') || 'Moi'}
        {thread.messageCount > 1 && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {thread.messageCount}
          </span>
        )}
      </span>
      {thread.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
      <span className="shrink-0 text-xs text-muted-foreground">
        {isToday(thread.lastDate)
          ? new Date(thread.lastDate).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : formatDate(thread.lastDate)}
      </span>
    </span>
    <span
      className={cn(
        'truncate text-sm',
        thread.unreadCount > 0 ? 'font-medium' : 'text-muted-foreground',
      )}
    >
      {thread.subject}
    </span>
    <span className="truncate text-xs text-muted-foreground">{thread.snippet}</span>
    {(thread.brandName || thread.productionTitle) && (
      <span className="mt-0.5 flex min-w-0 flex-wrap gap-1">
        {thread.brandName && (
          <span
            className="truncate rounded px-1.5 py-0.5 text-[0.68rem] font-medium"
            style={{
              backgroundColor: `color-mix(in oklab, ${thread.brandColor ?? '#888'} 18%, transparent)`,
            }}
          >
            {thread.brandName}
          </span>
        )}
        {thread.productionTitle && (
          <span className="truncate rounded border border-border px-1.5 py-0.5 text-[0.68rem]">
            🎬 {thread.productionTitle}
          </span>
        )}
      </span>
    )}
  </button>
);

/**
 * La boîte mail : la liste des fils à gauche, le fil ouvert à droite.
 *
 * Le fil ouvert vit dans l'URL (`?fil=`), comme l'onglet des paramètres : un retour arrière
 * ou un lien depuis une autre page retombe sur la bonne conversation. Sur mobile, la liste
 * seule, puis le fil avec un retour — bascule en CSS, comme les notes d'une vidéo.
 *
 * **Rien ne part d'ici sans confirmation** : les brouillons vivent dans `MailComposer`, et
 * l'envoi passe par sa modale.
 */
export const MailsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('fil');
  const [view, setView] = useState<MailView>('inbox');
  const [search, setSearch] = useState('');
  const [newDraft, setNewDraft] = useState<MailDraft | null>(null);

  const { data: settings } = useMailSettings();
  const { data: stats } = useMailStats();
  const configured = settings?.configured ?? false;
  const {
    data: threads = [],
    isLoading,
    isFetching,
  } = useMailThreads({ view, search: search.trim() || undefined }, configured);
  const sync = useSyncMail();

  const open = (id: string | null) => {
    setNewDraft(null);
    setSearchParams(id ? { fil: id } : {}, { replace: false });
  };

  const startNew = () => {
    open(null);
    setNewDraft({ to: '', cc: '', subject: '', body: '', signature: settings?.signature ?? '' });
  };

  if (settings && !configured) {
    return (
      <EmptyState
        title="Aucune boîte mail connectée"
        description="Renseigne ton serveur IMAP/SMTP et ton mot de passe dans les paramètres pour relever tes mails ici."
        actionLabel="Configurer la boîte mail"
        actionTo="/parametres?onglet=mails"
      />
    );
  }

  const syncButton = (
    <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
      {sync.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">Relever</span>
    </Button>
  );
  const composeButton = (
    <Button size="sm" onClick={startNew}>
      <PenSquare className="h-4 w-4" />
      <span className="hidden sm:inline">Nouveau</span>
    </Button>
  );
  const showDetail = threadId !== null || newDraft !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden items-start justify-between gap-4 lg:flex">
        <div>
          <h1 className="text-lg font-semibold">Mails</h1>
          <p className="text-sm text-muted-foreground">
            {stats?.lastSyncAt ? `Relevé ${formatDateTime(stats.lastSyncAt)}` : 'Jamais relevé'}
            {stats?.lastSyncError && (
              <span className="text-destructive">
                {' '}
                · dernier relevé en échec : {stats.lastSyncError}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {syncButton}
          {composeButton}
        </div>
      </div>
      <AppBarActions>
        {syncButton}
        {composeButton}
      </AppBarActions>
      {sync.data?.error && <p className="text-sm text-destructive">{sync.data.error}</p>}
      {sync.error && <p className="text-sm text-destructive">{sync.error.message}</p>}

      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Card
          className={cn(
            'min-w-0 space-y-2 p-2 lg:sticky lg:top-[calc(var(--app-header)+1.5rem)] lg:max-h-[calc(100dvh-var(--app-header)-3rem)] lg:overflow-y-auto',
            showDetail && 'hidden lg:block',
          )}
        >
          <div className="relative px-1 pt-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 mt-0.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher (objet, expéditeur, texte)"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1 px-1">
            {MAIL_VIEWS.map((entry) => (
              <Button
                key={entry.id}
                size="sm"
                variant={view === entry.id ? 'secondary' : 'ghost'}
                onClick={() => setView(entry.id)}
              >
                {entry.label}
                {entry.id === 'unread' && stats && stats.unread > 0 && ` (${stats.unread})`}
              </Button>
            ))}
            {isFetching && (
              <Loader2 className="ml-auto h-4 w-4 animate-spin self-center text-muted-foreground" />
            )}
          </div>
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : threads.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {search
                ? 'Aucun fil ne correspond.'
                : stats?.lastSyncAt
                  ? 'Rien ici.'
                  : 'Premier relevé en cours…'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <ThreadRow
                    thread={thread}
                    active={thread.id === threadId}
                    onOpen={() => open(thread.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className={cn('min-w-0', !showDetail && 'hidden lg:block')}>
          {newDraft ? (
            <MailComposer
              threadId={null}
              draft={newDraft}
              onChange={setNewDraft}
              onClose={() => setNewDraft(null)}
              onSent={() => setNewDraft(null)}
              aiConfigured={false}
            />
          ) : threadId ? (
            <MailThreadPanel
              key={threadId}
              threadId={threadId}
              aiConfigured={settings?.aiConfigured ?? false}
              signature={settings?.signature ?? ''}
              onBack={() => open(null)}
            />
          ) : (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Choisis une conversation dans la liste.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
