import { FolderInput, Loader2 } from 'lucide-react';
import {
  useMailFolders,
  useUpdateMailSettings,
} from '../../../application/mail/usecases/useMails.ts';
import type { MailSettingsView } from '../../../domain/mail/entities/Mail.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Checkbox } from '../ui/checkbox.tsx';

/**
 * Les dossiers de rangement : on charge la liste du serveur (les dossiers se créent dans
 * Proton, pas ici), on coche les trois ou quatre qui servent, et ils deviennent les
 * entrées du bouton « Ranger dans… » d'un fil. Chaque coche s'enregistre aussitôt.
 *
 * La liste n'est lue qu'au clic : une session IMAP par ouverture de l'écran de réglages
 * serait du bruit pour une liste qui ne change presque jamais.
 */
export const MailFoldersCard = ({ view }: { view: MailSettingsView }) => {
  const folders = useMailFolders();
  const update = useUpdateMailSettings();
  const selected = new Set(view.moveFolders);

  // Les dossiers déjà choisis restent affichés même avant le chargement de la liste.
  const loaded = folders.data ?? [];
  const known = new Set(loaded.map((folder) => folder.path));
  const rows = [
    ...view.moveFolders
      .filter((path) => !known.has(path))
      .map((path) => ({ path, name: path, specialUse: null })),
    ...loaded,
  ];

  const toggle = (path: string, checked: boolean) =>
    update.mutate({
      moveFolders: checked
        ? [...view.moveFolders, path]
        : view.moveFolders.filter((entry) => entry !== path),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossiers de rangement</CardTitle>
        <CardDescription>
          Les dossiers proposés par le bouton « Ranger dans… » d’un fil. Ranger déplace le fil sur
          le serveur — il disparaît de la réception, partout — et reste lisible ici dans « Tous » ;
          ses pièces jointes sont gardées avant le déplacement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void folders.refetch()}
          disabled={!view.configured || folders.isFetching}
        >
          {folders.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderInput className="h-4 w-4" />
          )}
          {folders.data ? 'Recharger les dossiers' : 'Charger les dossiers du serveur'}
        </Button>
        {folders.error && <p className="text-sm text-destructive">{folders.error.message}</p>}
        {rows.length > 0 && (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((folder) => (
              <li key={folder.path}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox
                    checked={selected.has(folder.path)}
                    disabled={update.isPending}
                    onCheckedChange={(checked) => toggle(folder.path, checked === true)}
                  />
                  <span className="min-w-0 flex-1 truncate">{folder.path}</span>
                  {folder.specialUse && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {folder.specialUse.replace('\\', '')}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      </CardContent>
    </Card>
  );
};
