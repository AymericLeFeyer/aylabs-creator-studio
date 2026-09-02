import { useUpdateSponsorship } from '../../../application/sponsorship/usecases/useSponsorships.ts';
import type { Sponsorship } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { SPONSORSHIP_STATUS_LABELS } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { formatMoney } from '../../../shared/format.ts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { ScriptEditor } from '../production/ScriptEditor.tsx';

/**
 * Le script d'une intégration sponsorisée, sur son propre écran.
 *
 * **Volontairement hors de la modale d'édition** : les deux gestes n'ont ni la même
 * durée ni le même risque. On corrige un montant ou une échéance en dix secondes et on
 * valide ; on écrit un script en plusieurs passages, et un formulaire qui se ferme par
 * mégarde emporterait le texte avec lui. Le bouton dédié dans la table ouvre donc un
 * espace large, avec son propre enregistrement.
 *
 * C'est le même `ScriptEditor` que les fiches de production — même markdown, même
 * durée de lecture, même absence d'enregistrement automatique : un script de sponso
 * s'écrit exactement comme un script de vidéo, et deux éditeurs divergeraient dès la
 * première retouche.
 */
export const SponsorshipScriptDialog = ({
  sponsorship,
  onOpenChange,
}: {
  /** `null` ferme le dialogue : c'est la sponso choisie qui l'ouvre. */
  sponsorship: Sponsorship | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const update = useUpdateSponsorship();

  return (
    <Dialog open={sponsorship !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        {sponsorship && (
          <>
            <DialogHeader>
              <DialogTitle>Script — {sponsorship.label}</DialogTitle>
              <DialogDescription>
                {sponsorship.brandName ?? 'Sans marque'} ·{' '}
                {SPONSORSHIP_STATUS_LABELS[sponsorship.status]} ·{' '}
                {formatMoney(sponsorship.amountCents)}
                {sponsorship.productionTitle && ` · ${sponsorship.productionTitle}`}
              </DialogDescription>
            </DialogHeader>

            <ScriptEditor
              value={sponsorship.script}
              saving={update.isPending}
              onSave={(script) => update.mutateAsync({ id: sponsorship.id, input: { script } })}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
