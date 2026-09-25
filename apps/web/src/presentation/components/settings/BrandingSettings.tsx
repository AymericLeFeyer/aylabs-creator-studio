import { useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import {
  useBranding,
  useClearBrandingLogo,
  useSetBrandingLogo,
  useUpdateBrandingName,
} from '../../../application/branding/usecases/useBranding.ts';
import { brandingIconUrl, DEFAULT_APP_NAME } from '../../../domain/branding/entities/Branding.ts';
import { renderLogoIcons } from '../../../infrastructure/branding/renderLogoIcons.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

/** Au-delà, l'image est sûrement une photo pleine résolution : le canevas la réduirait de toute façon. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Le nom et le logo de l'application. **Partagés entre appareils** (ils vivent en base) :
 * le manifeste PWA en dépend, et c'est l'API qui le sert.
 *
 * Le nom se valide à la sortie du champ ou sur Entrée, comme `StepsPage` : une écriture
 * par frappe renommerait l'onglet à chaque lettre. Le logo est redimensionné **dans le
 * navigateur** (`renderLogoIcons`) avant l'envoi.
 */
export const BrandingSettings = () => {
  const { data: branding } = useBranding();
  const updateName = useUpdateBrandingName();
  const setLogo = useSetBrandingLogo();
  const clearLogo = useClearBrandingLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const name = branding?.name ?? '';
  const commitName = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== name) updateName.mutate(next || null);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Ce fichier n’est pas une image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image trop lourde (10 Mo au plus).');
      return;
    }
    setRendering(true);
    try {
      const icons = await renderLogoIcons(file);
      await setLogo.mutateAsync(icons);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le logo n’a pas pu être enregistré.');
    } finally {
      setRendering(false);
    }
  };

  const busy = rendering || setLogo.isPending || clearLogo.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">Personnalisation</h2>
        <p className="text-sm text-muted-foreground">
          Le nom et le logo de l’application : onglet du navigateur, menu, et application installée
          sur l’écran d’accueil. Les mêmes sur tous tes appareils.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nom</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="branding-name" className="sr-only">
              Nom de l’application
            </Label>
            <Input
              id="branding-name"
              value={draft ?? name}
              placeholder={DEFAULT_APP_NAME}
              maxLength={40}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setDraft(null);
                  event.currentTarget.blur();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Vide, l’application reprend « {DEFAULT_APP_NAME} ». Sur l’écran d’accueil d’un
              téléphone, au-delà d’une douzaine de caractères le nom est coupé.
            </p>
            {updateName.isError && (
              <p className="text-xs text-destructive">Le nom n’a pas pu être enregistré.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              {/* Deux aperçus : l'icône telle qu'elle apparaît dans l'onglet et le menu
                  (transparente), et celle de l'écran d'accueil iOS (fond blanc). */}
              <img
                src={brandingIconUrl(branding, 'icon-192')}
                alt="Logo actuel"
                className="h-16 w-16 rounded-lg border border-border object-contain p-1"
              />
              <img
                src={brandingIconUrl(branding, 'apple-180')}
                alt="Icône d’écran d’accueil"
                className="h-16 w-16 rounded-2xl border border-border object-contain"
              />
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageUp className="h-4 w-4" />
                  {busy ? 'Enregistrement…' : 'Choisir une image'}
                </Button>
                {branding?.logoVersion && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => clearLogo.mutate()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Revenir au logo d’origine
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                  void pickLogo(event.target.files?.[0]);
                  // Rechoisir le même fichier doit redéclencher l'envoi.
                  event.target.value = '';
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Une image carrée d’au moins 512 px, idéalement sur fond transparent. Elle est recadrée
              sans être rognée : un logo en longueur se centre dans le carré.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Application déjà installée : l’onglet et le menu changent tout de suite, l’icône et le nom
        de l’écran d’accueil, eux, dépendent du téléphone. Android les met à jour tout seul au bout
        de quelques heures ou jours ; sur iPhone, il faut retirer l’application de l’écran d’accueil
        et l’ajouter à nouveau.
      </p>
    </div>
  );
};
