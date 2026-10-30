import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useMailAddresses,
  useUpdateMailSettings,
} from '../../../application/mail/usecases/useMails.ts';
import type { MailSettingsView } from '../../../domain/mail/entities/Mail.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Input } from '../ui/input.tsx';

/**
 * Les adresses suivies. Une boîte Proton (Bridge) mélange toutes les adresses du compte dans
 * une seule réception : on coche celles qui concernent le studio, et seuls leurs fils
 * s'affichent et comptent dans la pastille. **Rien de coché = toutes.**
 *
 * Les adresses sont **proposées** depuis ce qui a déjà été relevé (reçues sur, envoyées
 * depuis) : on ne retape pas un alias qu'on a oublié avoir créé. Une adresse encore jamais
 * vue s'ajoute à la main. Chaque coche s'enregistre aussitôt : rien n'est supprimé, le
 * filtre s'applique à la lecture et se défait d'un clic.
 */
export const MailAddressesCard = ({ view }: { view: MailSettingsView }) => {
  const { data: candidates = [], isLoading } = useMailAddresses(view.configured);
  const update = useUpdateMailSettings();
  const [manual, setManual] = useState('');

  const selected = new Set(view.addresses);
  const known = new Set(candidates.map((candidate) => candidate.address));
  // Les adresses cochées à la main mais encore jamais vues restent dans la liste.
  const rows = [
    ...view.addresses
      .filter((address) => !known.has(address))
      .map((address) => ({ address, received: 0, sent: 0 })),
    ...candidates,
  ];

  const save = (addresses: string[]) => update.mutate({ addresses });
  const toggle = (address: string, checked: boolean) =>
    save(
      checked ? [...view.addresses, address] : view.addresses.filter((entry) => entry !== address),
    );
  const add = () => {
    const address = manual.trim().toLowerCase();
    if (!address.includes('@') || selected.has(address)) return;
    save([...view.addresses, address]);
    setManual('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresses suivies</CardTitle>
        <CardDescription>
          Seuls les fils reçus sur ces adresses — ou envoyés depuis elles — apparaissent dans Mails
          et comptent dans la pastille. Une réponse part depuis l’adresse à laquelle on t’a écrit.{' '}
          {view.addresses.length === 0 ? 'Aucune cochée : toutes sont suivies.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune adresse vue pour l’instant : elles apparaîtront après le premier relevé.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.address}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox
                    checked={selected.has(row.address)}
                    disabled={update.isPending}
                    onCheckedChange={(checked) => toggle(row.address, checked === true)}
                  />
                  <span className="min-w-0 flex-1 truncate">{row.address}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.received > 0 && `${row.received} reçu${row.received > 1 ? 's' : ''}`}
                    {row.received > 0 && row.sent > 0 && ' · '}
                    {row.sent > 0 && `${row.sent} envoyé${row.sent > 1 ? 's' : ''}`}
                    {row.received === 0 && row.sent === 0 && 'ajoutée à la main'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
            placeholder="Ajouter une adresse (alias@domaine.fr)"
          />
          <Button variant="outline" onClick={add} disabled={!manual.includes('@')}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      </CardContent>
    </Card>
  );
};
