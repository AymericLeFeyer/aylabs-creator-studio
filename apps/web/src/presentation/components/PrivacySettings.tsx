import { Eye, EyeOff } from 'lucide-react';
import {
  MONEY_COMPONENT_KEYS,
  PRIVACY_GROUPS,
  PRIVACY_HINTS,
  PRIVACY_LABELS,
  type PrivacyKey,
} from '../../domain/privacy/entities/Privacy.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Le réglage de confidentialité : un interrupteur, puis ce qu'on accepte de laisser voir.
 *
 * L'interrupteur d'abord et les cases ensuite, parce que ce sont deux gestes de fréquence
 * très différentes : on choisit une fois ce qui est sensible, et on rallume le masquage à
 * chaque fois qu'on partage son écran. Les cases restent lisibles — grisées, pas
 * démontées — quand l'interrupteur dort : les faire disparaître obligerait à réactiver la
 * confidentialité pour se rappeler ce qu'on avait choisi de masquer.
 *
 * La case « Chiffre d'affaires et bénéfices » se coche **toute seule** dès qu'une
 * composante est masquée, et devient alors non décochable. Ce n'est pas une commodité :
 * un total affiché à côté de ses composantes visibles annonce la composante manquante par
 * simple soustraction, et le masquage ne vaudrait plus rien.
 */
export const PrivacySettings = () => {
  const privacy = usePrivacy();
  const maskedCount = Object.values(privacy.effective).filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {privacy.anyMasked ? (
            <EyeOff className="h-4 w-4 text-[var(--negative)]" aria-hidden />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          Confidentialité
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="privacy-enabled"
            checked={privacy.enabled}
            onCheckedChange={(value) => privacy.setEnabled(value === true)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="privacy-enabled" className="font-normal">
              Masquer les informations sensibles
            </Label>
            <p className="text-xs text-muted-foreground">
              Pour un partage d'écran, une capture ou un direct. Les montants masqués deviennent
              «&nbsp;•••&nbsp;» et tombent à zéro dans les graphiques — un trou dans une pile se
              devinerait aussi bien qu'un chiffre.
            </p>
          </div>
        </div>

        <div
          className={cn(
            'space-y-4 border-t border-border pt-4 transition-opacity',
            !privacy.enabled && 'opacity-50',
          )}
        >
          {PRIVACY_GROUPS.map((group) => (
            <fieldset key={group.title} disabled={!privacy.enabled} className="space-y-2.5">
              <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </legend>
              {group.keys.map((key) => (
                <MaskRow key={key} maskKey={key} />
              ))}
            </fieldset>
          ))}
        </div>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {privacy.enabled ? (
            maskedCount === 0 ? (
              'Rien de coché : tout reste visible. Choisis au moins une ligne ci-dessus.'
            ) : (
              <>
                {maskedCount} information(s) masquée(s) ·{' '}
                <button
                  type="button"
                  onClick={privacy.clear}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  tout réafficher
                </button>
              </>
            )
          ) : (
            "Rien n'est masqué. Les cases ci-dessus attendent la prochaine activation."
          )}{' '}
          Le masquage est un affichage : les données restent en base et repartent telles quelles
          dans l'API.
        </p>
      </CardContent>
    </Card>
  );
};

/**
 * Une case. Celle des totaux se verrouille dès qu'une composante est masquée : cochée de
 * force, désactivée, et le motif écrit à la place du sous-titre habituel.
 */
const MaskRow = ({ maskKey }: { maskKey: PrivacyKey }) => {
  const privacy = usePrivacy();

  const forced =
    maskKey === 'totals' &&
    !privacy.masks.totals &&
    MONEY_COMPONENT_KEYS.some((key) => privacy.masks[key]);

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={`privacy-${maskKey}`}
        checked={privacy.masks[maskKey] || forced}
        disabled={forced}
        onCheckedChange={(value) => privacy.setMask(maskKey, value === true)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={`privacy-${maskKey}`} className="font-normal">
          {PRIVACY_LABELS[maskKey]}
        </Label>
        <p className="text-xs text-muted-foreground">
          {forced
            ? 'Masqué d’office : un total affiché à côté de ses composantes visibles livrerait celle qui manque.'
            : PRIVACY_HINTS[maskKey]}
        </p>
      </div>
    </div>
  );
};
