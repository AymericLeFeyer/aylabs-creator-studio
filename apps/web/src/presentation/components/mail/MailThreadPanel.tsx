import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FolderInput,
  CalendarSearch,
  FileText,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  useMailAi,
  useMailDateCheck,
  useMailThread,
  useMailVideoNote,
  useMoveMailThread,
  useSummarizeMailMessage,
  useUpdateMailThread,
} from '../../../application/mail/usecases/useMails.ts';
import { useBrands } from '../../../application/brand/usecases/useBrands.ts';
import { useProductions } from '../../../application/production/usecases/useProductions.ts';
import {
  addressLabel,
  attachmentUrl,
  folderLabel,
  formatAddresses,
  replySubject,
  type MailDateCheck,
  type MailMessage,
  type MailThreadView,
} from '../../../domain/mail/entities/Mail.ts';
import { formatDateTime } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Label } from '../ui/label.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { BrandCombobox } from '../forms/BrandCombobox.tsx';
import { NONE, fromSelectValue, toSelectValue } from '../forms/selectNone.ts';
import { MailBody } from './MailBody.tsx';
import { MailComposer, type MailDraft } from './MailComposer.tsx';
import { MailDateCheckPanel } from './MailDateCheckPanel.tsx';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';

const domainOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const host = value.includes('@')
    ? value.split('@')[1]
    : value.replace(/^https?:\/\//, '').split('/')[0];
  return host ? host.replace(/^www\./, '').toLowerCase() : null;
};

/** À qui répondre : le dernier interlocuteur, quel que soit le sens du dernier message. */
const replyTargets = (thread: MailThreadView): MailMessage['to'] => {
  const lastIncoming = [...thread.messages].reverse().find((message) => !message.outgoing);
  if (lastIncoming) return [lastIncoming.from];
  return thread.messages.at(-1)?.to ?? [];
};

const AiText = ({ text }: { text: string }) => (
  <div className="rounded-md border border-[var(--cash)]/30 bg-[var(--cash)]/5 p-3 text-sm whitespace-pre-wrap">
    {text}
  </div>
);

const MessageCard = ({
  message,
  threadId,
  aiConfigured,
  defaultOpen,
}: {
  message: MailMessage;
  threadId: string;
  aiConfigured: boolean;
  defaultOpen: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const summarize = useSummarizeMailMessage();

  return (
    <Card className={cn('min-w-0 p-4', message.outgoing && 'border-l-4 border-l-[var(--today)]')}>
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {message.outgoing ? 'Moi' : addressLabel(message.from)}
            {!message.outgoing && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {message.from.address}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {open
              ? `À ${formatAddresses(message.to)}${message.cc.length ? ` · Cc ${formatAddresses(message.cc)}` : ''}`
              : message.snippet}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDateTime(message.date)}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {message.aiSummary && <AiText text={message.aiSummary} />}
          <MailBody message={message} />
          {message.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {message.attachments.map((attachment, index) => (
                <li key={index}>
                  {attachment.id ? (
                    <a
                      href={attachmentUrl(attachment.id)}
                      className="flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent hover:text-foreground"
                    >
                      <Download className="h-3 w-3" />
                      {attachment.filename} ({Math.max(1, Math.round(attachment.size / 1024))} ko)
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 rounded border border-border px-2 py-1">
                      <Paperclip className="h-3 w-3" />
                      {attachment.filename}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {aiConfigured && !message.outgoing && (
            <Button
              size="sm"
              variant="ghost"
              disabled={summarize.isPending}
              onClick={() => summarize.mutate({ messageId: message.id, threadId })}
            >
              {summarize.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {message.aiSummary ? 'Résumer à nouveau' : 'Résumer ce message'}
            </Button>
          )}
          {summarize.error && <p className="text-xs text-destructive">{summarize.error.message}</p>}
        </div>
      )}
    </Card>
  );
};

/**
 * Un fil ouvert : ses rattachements (marque, vidéo), les gestes de l'IA, les messages, et
 * le brouillon de réponse.
 *
 * **Ouvrir un fil le marque lu**, sur le serveur aussi — c'est ce qu'on attend d'une
 * messagerie, et la pastille du menu doit baisser au même moment. Une seule fois par
 * ouverture (ref) : sans elle, « Marquer non lu » serait aussitôt défait.
 */
export const MailThreadPanel = ({
  threadId,
  aiConfigured,
  signature,
  senders,
  moveFolders,
  onBack,
}: {
  threadId: string;
  aiConfigured: boolean;
  signature: string;
  senders: string[];
  /** Les dossiers de rangement choisis dans les réglages. */
  moveFolders: string[];
  onBack: () => void;
}) => {
  const { data: thread, isLoading, error } = useMailThread(threadId);
  const update = useUpdateMailThread();
  const ai = useMailAi();
  const videoNote = useMailVideoNote();
  const dateCheck = useMailDateCheck();
  const move = useMoveMailThread();
  const [check, setCheck] = useState<MailDateCheck | null>(null);
  const { data: brands = [] } = useBrands();
  const { data: productions = [] } = useProductions({});
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [pendingAi, setPendingAi] = useState<string | null>(null);
  const markedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!thread || thread.unreadCount === 0 || markedRef.current === thread.id) return;
    markedRef.current = thread.id;
    update.mutate({ id: thread.id, input: { read: true } });
  }, [thread, update]);

  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Chargement…</Card>;
  if (error || !thread) {
    return (
      <Card className="p-6 text-sm text-destructive">{error?.message ?? 'Fil introuvable.'}</Card>
    );
  }

  const openReply = (body = '') =>
    setDraft({
      from: thread.replyFrom ?? senders[0] ?? '',
      to: formatAddresses(replyTargets(thread)),
      cc: '',
      subject: replySubject(thread.subject),
      body,
      signature,
    });

  const followUp = () => {
    setPendingAi('follow_up');
    ai.mutate(
      { id: thread.id, request: { action: 'follow_up' } },
      {
        onSuccess: ({ text }) => {
          if (
            draft?.body.trim() &&
            !window.confirm('Remplacer le brouillon actuel par la relance proposée ?')
          )
            return;
          if (draft) setDraft({ ...draft, body: text });
          else openReply(text);
        },
        onSettled: () => setPendingAi(null),
      },
    );
  };

  const summarizeThread = () => {
    setPendingAi('summarize');
    ai.mutate(
      { id: thread.id, request: { action: 'summarize' } },
      { onSettled: () => setPendingAi(null) },
    );
  };

  // Une marque dont le site ou l'adresse de contact partage le domaine d'un interlocuteur.
  const participantDomains = new Set(thread.participants.map((person) => domainOf(person.address)));
  const suggestedBrand = thread.brandId
    ? null
    : (brands.find(
        (brand) =>
          (domainOf(brand.website) && participantDomains.has(domainOf(brand.website))) ||
          (domainOf(brand.contactEmail) && participantDomains.has(domainOf(brand.contactEmail))),
      ) ?? null);

  const openProductions = productions.filter(
    (production) => production.status !== 'done' || production.id === thread.productionId,
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold break-words">{thread.subject}</h2>
          <p className="text-xs text-muted-foreground">
            {thread.participants.map(addressLabel).join(', ') || '—'} · {thread.messageCount}{' '}
            message
            {thread.messageCount > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: thread.id, input: { read: thread.unreadCount > 0 } })}
          title={thread.unreadCount > 0 ? 'Marquer lu' : 'Marquer non lu'}
        >
          {thread.unreadCount > 0 ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          <span className="hidden sm:inline">
            {thread.unreadCount > 0 ? 'Marquer lu' : 'Non lu'}
          </span>
        </Button>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mail-brand">Marque</Label>
          <BrandCombobox
            id="mail-brand"
            value={thread.brandId}
            onChange={(brandId) => update.mutate({ id: thread.id, input: { brandId } })}
          />
          {suggestedBrand && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() =>
                update.mutate({ id: thread.id, input: { brandId: suggestedBrand.id } })
              }
            >
              Suggestion : {suggestedBrand.name} (même domaine) — associer
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Vidéo</Label>
          <Select
            value={toSelectValue(thread.productionId)}
            onValueChange={(value) =>
              update.mutate({ id: thread.id, input: { productionId: fromSelectValue(value) } })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Aucune vidéo</SelectItem>
              {openProductions.map((production) => (
                <SelectItem key={production.id} value={production.id}>
                  {production.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {thread.productionId && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={!aiConfigured || videoNote.isPending}
                onClick={() => videoNote.mutate(thread.id)}
                title={aiConfigured ? undefined : 'Configure l’IA dans Paramètres → Admin → Mails'}
              >
                {videoNote.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {thread.noteId
                  ? 'Mettre à jour la note de la vidéo'
                  : 'Écrire la note dans la vidéo'}
              </Button>
              {thread.noteId && (
                <Link
                  to={`/production/${thread.productionId}?onglet=notes`}
                  className="text-xs underline-offset-2 hover:underline"
                >
                  Ouvrir la fiche
                </Link>
              )}
            </div>
          )}
          {videoNote.error && <p className="text-xs text-destructive">{videoNote.error.message}</p>}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openReply()} disabled={draft !== null}>
          <Reply className="h-4 w-4" />
          Répondre
        </Button>
        {aiConfigured && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingAi !== null}
              onClick={summarizeThread}
            >
              {pendingAi === 'summarize' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Résumer le fil
            </Button>
            <Button size="sm" variant="outline" disabled={pendingAi !== null} onClick={followUp}>
              {pendingAi === 'follow_up' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Proposer une relance
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={dateCheck.isPending}
              onClick={() =>
                dateCheck.mutate({ id: thread.id, today: localToday() }, { onSuccess: setCheck })
              }
            >
              {dateCheck.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarSearch className="h-4 w-4" />
              )}
              Vérifier les dates
            </Button>
          </>
        )}
        {moveFolders.length > 0 && !thread.archived && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={move.isPending}>
                {move.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderInput className="h-4 w-4" />
                )}
                Ranger dans…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {moveFolders.map((folder) => (
                <DropdownMenuItem
                  key={folder}
                  onSelect={() =>
                    move.mutate({ id: thread.id, folder }, { onSuccess: () => onBack() })
                  }
                >
                  {folderLabel(folder)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {ai.error && <p className="text-sm text-destructive">{ai.error.message}</p>}
      {dateCheck.error && <p className="text-sm text-destructive">{dateCheck.error.message}</p>}
      {move.error && <p className="text-sm text-destructive">{move.error.message}</p>}
      {check && <MailDateCheckPanel check={check} onClose={() => setCheck(null)} />}
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}

      {thread.summary && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Résumé du fil{thread.summaryAt ? ` · ${formatDateTime(thread.summaryAt)}` : ''}
          </p>
          <AiText text={thread.summary} />
        </div>
      )}

      <div className="space-y-2">
        {thread.messages.map((message, index) => (
          <MessageCard
            key={message.id}
            message={message}
            threadId={thread.id}
            aiConfigured={aiConfigured}
            defaultOpen={index === thread.messages.length - 1 || !message.seen}
          />
        ))}
      </div>

      {draft && (
        <MailComposer
          threadId={thread.id}
          draft={draft}
          onChange={setDraft}
          onClose={() => {
            if (draft.body.trim() && !window.confirm('Abandonner ce brouillon ?')) return;
            setDraft(null);
          }}
          onSent={() => setDraft(null)}
          aiConfigured={aiConfigured}
          senders={senders}
        />
      )}
    </div>
  );
};
