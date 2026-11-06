import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Paperclip } from 'lucide-react';
import {
  attachmentPreviewUrl,
  attachmentUrl,
  type MailAttachment,
} from '../../../domain/mail/entities/Mail.ts';
import {
  previewKind,
  type AttachmentPreviewKind,
} from '../../../domain/mail/services/attachmentPreview.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog.tsx';

type Previewable = MailAttachment & { id: string; kind: AttachmentPreviewKind };

const sizeLabel = (size: number): string =>
  size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
    : `${Math.max(1, Math.round(size / 1024))} ko`;

/**
 * Les pièces jointes d'un message. Les images s'affichent en vignette ; images, PDF et
 * texte s'ouvrent dans un aperçu (flèches ← → pour passer de l'une à l'autre) ; le reste
 * se télécharge. **Ce qui peut s'afficher est décidé par `previewKind`**, la même règle
 * que l'API : un SVG ou un HTML d'expéditeur inconnu n'est jamais rendu dans la page.
 *
 * Une pièce sans `id` n'est qu'un nom.
 */
export const MailAttachments = ({ attachments }: { attachments: MailAttachment[] }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const previewable: Previewable[] = attachments.flatMap((attachment) => {
    const kind = attachment.id ? previewKind(attachment.contentType, attachment.filename) : null;
    return kind && attachment.id ? [{ ...attachment, id: attachment.id, kind }] : [];
  });
  const current = openIndex === null ? null : (previewable[openIndex] ?? null);

  const step = (delta: number) =>
    setOpenIndex((index) =>
      index === null ? index : (index + delta + previewable.length) % previewable.length,
    );

  if (attachments.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {attachments.map((attachment, index) => {
          if (!attachment.id) {
            return (
              <li key={index}>
                <span className="flex items-center gap-1 rounded border border-border px-2 py-1">
                  <Paperclip className="h-3 w-3" />
                  {attachment.filename}
                </span>
              </li>
            );
          }
          const previewIndex = previewable.findIndex((item) => item.id === attachment.id);
          const preview = previewable[previewIndex];
          const label = (
            <>
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0">({sizeLabel(attachment.size)})</span>
            </>
          );
          return (
            <li
              key={index}
              className="flex max-w-full items-stretch overflow-hidden rounded border border-border"
            >
              {preview ? (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 px-2 py-1 text-left hover:bg-accent hover:text-foreground"
                  onClick={() => setOpenIndex(previewIndex)}
                  title="Aperçu"
                >
                  {preview.kind === 'image' ? (
                    <img
                      src={attachmentPreviewUrl(preview.id)}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-sm bg-muted object-cover"
                    />
                  ) : preview.kind === 'pdf' ? (
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {label}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-1 px-2 py-1">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  {label}
                </span>
              )}
              <a
                href={attachmentUrl(attachment.id)}
                className="flex items-center border-l border-border px-2 hover:bg-accent hover:text-foreground"
                title="Télécharger"
                aria-label={`Télécharger ${attachment.filename}`}
              >
                <Download className="h-3 w-3" />
              </a>
            </li>
          );
        })}
      </ul>

      <Dialog open={current !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent
          className="flex max-h-[95vh] max-w-5xl flex-col gap-3 p-4"
          onKeyDown={(event) => {
            if (previewable.length < 2) return;
            if (event.key === 'ArrowLeft') step(-1);
            if (event.key === 'ArrowRight') step(1);
          }}
        >
          {current && (
            <>
              <div className="flex items-center gap-2 pr-8">
                <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">
                  {current.filename}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {sizeLabel(current.size)}
                    {previewable.length > 1 && ` · ${(openIndex ?? 0) + 1} / ${previewable.length}`}
                  </span>
                </DialogTitle>
                {previewable.length > 1 && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => step(-1)}
                      aria-label="Pièce précédente"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => step(1)}
                      aria-label="Pièce suivante"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" asChild>
                  <a href={attachmentUrl(current.id)}>
                    <Download className="h-3.5 w-3.5" />
                    Télécharger
                  </a>
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-muted/40">
                {current.kind === 'image' ? (
                  <img
                    key={current.id}
                    src={attachmentPreviewUrl(current.id)}
                    alt={current.filename}
                    className="max-h-[80vh] max-w-full object-contain"
                  />
                ) : (
                  <iframe
                    key={current.id}
                    src={attachmentPreviewUrl(current.id)}
                    title={current.filename}
                    className="h-[80vh] w-full rounded-md bg-white"
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
