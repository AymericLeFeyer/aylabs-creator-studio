import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Star } from 'lucide-react';
import type { LegalBookmark } from '../../../domain/legal/entities/Legal.ts';
import { faviconOf, hostOf } from '../../../domain/legal/entities/Legal.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { cn } from '../../../shared/cn.ts';

/**
 * La vignette d'un favori, avec ses deux replis.
 *
 * L'image saisie d'abord ; sinon le **favicon du site cible**, demandé au site lui-même
 * et jamais à un service de vignettes tiers — ce serait envoyer à un inconnu la liste
 * des sites administratifs qu'on consulte, pour une image de seize pixels ; sinon
 * l'**initiale sur la couleur du favori**, comme les chaînes et les marques.
 *
 * L'état d'échec est local à la vignette : un favicon manquant est le cas normal sur un
 * site sur deux, pas une erreur à remonter.
 */
const BookmarkThumb = ({ bookmark }: { bookmark: LegalBookmark }) => {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : (bookmark.imageUrl ?? faviconOf(bookmark.url));

  if (source) {
    return (
      <img
        src={source}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain bg-background p-1"
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        backgroundColor: bookmark.color,
        color: readableTextColor(bookmark.color),
      }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold uppercase"
    >
      {bookmark.label.trim().charAt(0) || '?'}
    </span>
  );
};

/**
 * Les liens utiles, entre la fiche de la société et le tableau à cocher.
 *
 * C'est leur place exacte : on les ouvre **au moment de cocher** — le portail Urssaf
 * pour faire la déclaration, puis la case juste en dessous. Les laisser dans les signets
 * du navigateur obligeait à sortir de l'outil au milieu du geste.
 *
 * La carte entière est le lien, pas seulement le titre : c'est la cible la plus large, et
 * celle qu'on vise naturellement. Ils s'ouvrent dans un **nouvel onglet** — on revient
 * cocher une case après, et une navigation aurait fait perdre l'année choisie et la
 * position dans le tableau.
 *
 * Rien ne s'affiche tant qu'aucun favori n'est configuré : un bloc vide avec un message
 * d'invitation prendrait, sur cet écran, la place de ce qu'on vient réellement y faire.
 */
export const LegalBookmarks = ({ bookmarks }: { bookmarks: LegalBookmark[] }) => {
  if (bookmarks.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Star className="h-4 w-4" />
          Liens utiles
        </h2>
        <Link
          to="/parametres?onglet=societe"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Gérer
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {bookmarks.map((bookmark) => (
          // Un `<a>` portant les classes de `Card` plutôt qu'une `Card` enveloppant un
          // lien : la carte entière doit être cliquable, et un lien à l'intérieur ne
          // couvrirait que son propre texte.
          <a
            key={bookmark.id}
            href={bookmark.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'group flex items-start gap-3 rounded-xl border border-border bg-card p-3',
              'text-card-foreground transition-colors hover:border-foreground/25 hover:bg-muted/50',
            )}
          >
            <BookmarkThumb bookmark={bookmark} />

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{bookmark.label}</span>
                <ExternalLink
                  className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </p>

              {bookmark.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {bookmark.description}
                </p>
              )}

              {/* Le domaine plutôt que l'URL entière : il dit où l'on va sans manger
                  deux lignes de carte. */}
              <p className="mt-1 truncate text-[11px] text-muted-foreground/70">
                {hostOf(bookmark.url)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};
