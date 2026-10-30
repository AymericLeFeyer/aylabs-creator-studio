import { useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { MailMessage } from '../../../domain/mail/entities/Mail.ts';

/**
 * Le corps d'un mail, **isolé dans une iframe sans script**.
 *
 * Un mail HTML est du contenu étranger : l'injecter dans la page laisserait ses styles
 * déborder sur l'application, et un `<script>` ou un `onerror` y tourner avec nos droits.
 * L'iframe `srcdoc` est `sandbox` **sans `allow-scripts`** — rien n'y s'exécute, jamais. Le
 * `allow-same-origin` ne sert qu'à mesurer sa hauteur : sans script possible, il n'ouvre
 * rien.
 *
 * **Les images distantes sont bloquées par défaut** (CSP `img-src data: cid:`) : elles
 * servent aussi de mouchards — ouvrir le mail préviendrait l'expéditeur, avec l'heure et
 * l'adresse IP. Un clic les affiche pour ce message.
 */
export const MailBody = ({ message }: { message: MailMessage }) => {
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(120);
  const frameRef = useRef<HTMLIFrameElement>(null);

  if (!message.htmlBody) {
    return (
      <pre className="font-sans text-sm break-words whitespace-pre-wrap">
        {message.textBody.trim() || '(message vide)'}
      </pre>
    );
  }

  const hasRemoteImages = /<img[^>]+src=["']?https?:/i.test(message.htmlBody);
  const csp = `default-src 'none'; style-src 'unsafe-inline' https:; font-src https: data:; img-src data: cid:${showImages ? ' https: http:' : ''};`;
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${message.htmlBody}</body></html>`;

  const measure = () => {
    const body = frameRef.current?.contentDocument?.body;
    if (body) setHeight(Math.min(Math.max(body.scrollHeight + 16, 60), 4000));
  };

  return (
    <div className="space-y-2">
      {hasRemoteImages && !showImages && (
        <button
          type="button"
          onClick={() => setShowImages(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          <ImageOff className="h-3.5 w-3.5" />
          Images distantes bloquées (elles préviennent l’expéditeur que tu as lu) — les afficher
        </button>
      )}
      {/* Fond blanc assumé, même en thème sombre : un mail HTML est conçu pour lui. */}
      <iframe
        ref={frameRef}
        key={showImages ? 'images' : 'no-images'}
        title={message.subject || 'Message'}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        onLoad={measure}
        style={{ height }}
        className="w-full rounded-md border border-border bg-white"
      />
    </div>
  );
};
