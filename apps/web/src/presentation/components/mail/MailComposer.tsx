import { useState } from 'react';
import { Languages, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useMailAi, useSendMail } from '../../../application/mail/usecases/useMails.ts';
import {
  MAIL_DRAFT_INTENTS,
  formatAddresses,
  parseAddresses,
  type MailDraftIntent,
} from '../../../domain/mail/entities/Mail.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

export interface MailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  signature: string;
}

const fullText = (draft: MailDraft): string =>
  draft.signature.trim()
    ? `${draft.body.trimEnd()}\n\n${draft.signature.trim()}`
    : draft.body.trimEnd();

/**
 * Le brouillon d'un mail : réponse dans un fil, ou nouveau message.
 *
 * **L'IA écrit ici, jamais au-delà.** Les boutons de pré-remplissage, la traduction et la
 * relance remplacent le **corps** du brouillon ; la signature reste à part, pour que la
 * traduction ne la touche pas et qu'un nouveau brouillon de l'IA ne la duplique pas.
 *
 * **Envoyer passe toujours par une confirmation** qui redit destinataires, objet et
 * texte. C'est le bouton de cette modale, et lui seul, qui pose `confirm: true` — le
 * contrat de l'API refuse un envoi sans lui.
 */
export const MailComposer = ({
  threadId,
  draft,
  onChange,
  onClose,
  onSent,
  aiConfigured,
}: {
  /** `null` pour un nouveau message : pas de fil, donc pas d'IA contextuelle. */
  threadId: string | null;
  draft: MailDraft;
  onChange: (draft: MailDraft) => void;
  onClose: () => void;
  onSent: () => void;
  aiConfigured: boolean;
}) => {
  const ai = useMailAi();
  const send = useSendMail();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState('');
  const [language, setLanguage] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const set = (patch: Partial<MailDraft>) => onChange({ ...draft, ...patch });
  const to = parseAddresses(draft.to);
  const cc = parseAddresses(draft.cc);
  const canSend = to.length > 0 && draft.body.trim().length > 0;

  /** Un brouillon déjà écrit ne s'écrase pas sans qu'on l'ait accepté. */
  const replaceBody = (text: string) => {
    if (
      draft.body.trim() &&
      !window.confirm('Remplacer le brouillon actuel par la proposition de l’IA ?')
    )
      return;
    set({ body: text });
  };

  const prefill = (intent: MailDraftIntent) => {
    if (!threadId) return;
    setPending(intent);
    ai.mutate(
      { id: threadId, request: { action: 'draft', intent, notes: notes.trim() || undefined } },
      { onSuccess: ({ text }) => replaceBody(text), onSettled: () => setPending(null) },
    );
  };

  const translate = () => {
    if (!threadId || !draft.body.trim()) return;
    setPending('translate');
    ai.mutate(
      {
        id: threadId,
        request: { action: 'translate', text: draft.body, language: language.trim() || undefined },
      },
      { onSuccess: ({ text }) => set({ body: text }), onSettled: () => setPending(null) },
    );
  };

  const confirmSend = () => {
    send.mutate(
      { to, cc, subject: draft.subject, text: fullText(draft), threadId, confirm: true },
      {
        onSuccess: () => {
          setConfirming(false);
          onSent();
        },
      },
    );
  };

  const busy = pending !== null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{threadId ? 'Répondre' : 'Nouveau message'}</h3>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fermer le brouillon">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-center">
        <Label htmlFor="mail-to">À</Label>
        <Input
          id="mail-to"
          value={draft.to}
          onChange={(e) => set({ to: e.target.value })}
          placeholder="nom@marque.com, …"
        />
        <Label htmlFor="mail-cc">Cc</Label>
        <Input id="mail-cc" value={draft.cc} onChange={(e) => set({ cc: e.target.value })} />
        <Label htmlFor="mail-subject">Objet</Label>
        <Input
          id="mail-subject"
          value={draft.subject}
          onChange={(e) => set({ subject: e.target.value })}
        />
      </div>

      {threadId && aiConfigured && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Pré-remplir avec l’IA — dans la langue de l’interlocuteur, à compléter ensuite
          </p>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Indications facultatives (« dispo en mars », « budget minimum 800 € »…)"
            className="h-8 text-xs"
          />
          <div className="flex flex-wrap gap-2">
            {MAIL_DRAFT_INTENTS.map((intent) => (
              <Button
                key={intent.id}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => prefill(intent.id)}
              >
                {pending === intent.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {intent.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Textarea
        value={draft.body}
        onChange={(e) => set({ body: e.target.value })}
        rows={12}
        placeholder="Ton message…"
        className="font-sans"
      />

      {threadId && aiConfigured && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="Langue (auto : celle du fil)"
            className="h-8 w-56 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !draft.body.trim()}
            onClick={translate}
          >
            {pending === 'translate' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5" />
            )}
            Traduire mon message
          </Button>
        </div>
      )}

      {ai.error && <p className="text-xs text-destructive">{ai.error.message}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="mail-signature" className="text-xs text-muted-foreground">
          Signature (ajoutée à la fin, jamais traduite)
        </Label>
        <Textarea
          id="mail-signature"
          value={draft.signature}
          onChange={(e) => set({ signature: e.target.value })}
          rows={2}
          className="text-xs"
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={!canSend} onClick={() => setConfirming(true)}>
          <Send className="h-4 w-4" />
          Envoyer…
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !send.isPending && setConfirming(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Envoyer ce mail ?</DialogTitle>
            <DialogDescription>
              Relis une dernière fois : une fois parti, il ne se rattrape pas.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">À</dt>
            <dd className="break-words">{formatAddresses(to)}</dd>
            {cc.length > 0 && (
              <>
                <dt className="text-muted-foreground">Cc</dt>
                <dd className="break-words">{formatAddresses(cc)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Objet</dt>
            <dd className="break-words">{draft.subject || '(sans objet)'}</dd>
          </dl>
          <pre className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap">
            {fullText(draft)}
          </pre>
          {/\[[^\]]+\]/.test(draft.body) && (
            <p className="text-xs text-[var(--negative)]">
              Le message contient encore des champs entre crochets à compléter.
            </p>
          )}
          {send.error && <p className="text-sm text-destructive">{send.error.message}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={send.isPending}
            >
              Revenir au brouillon
            </Button>
            <Button onClick={confirmSend} disabled={send.isPending}>
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Envoyer maintenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
