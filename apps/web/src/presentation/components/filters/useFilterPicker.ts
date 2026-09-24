import { useLocation } from 'react-router-dom';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useInstagramAccounts } from '../../../application/instagram/usecases/useInstagram.ts';
import { useTikTokAccounts } from '../../../application/tiktok/usecases/useTikTok.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { PickableEntity } from './EntityPicker.tsx';

export interface EntityGroup {
  label: string;
  entities: PickableEntity[];
  /** Vide = tout le groupe. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export interface FilterPicker {
  entities: PickableEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  noun: string;
  /**
   * Plusieurs sources dans un même menu (le dashboard : chaînes, comptes Instagram,
   * comptes TikTok). Chaque groupe garde sa propre sélection dans les filtres.
   */
  groups?: EntityGroup[];
}

/**
 * Ce que le sélecteur de la barre de filtres doit proposer, **selon l'écran ouvert** :
 * les chaînes YouTube partout, sauf sur `/instagram` et `/tiktok` où ce sont leurs propres
 * comptes — une chaîne YouTube n'a aucun sens à filtrer un aperçu Instagram.
 *
 * Un seul point de décision, partagé par `ContextualEntityPicker` (le déclencheur) et
 * `FiltersSheet` (qui a besoin des mêmes données pour son résumé mobile) : dupliquer la
 * détection de route aurait fini par diverger — l'un swappe le sélecteur, l'autre pas.
 */
export const useFilterPicker = (): FilterPicker => {
  const location = useLocation();
  const filters = useFilters();
  const { data: channels = [] } = useChannels();
  const { data: instagramAccounts = [] } = useInstagramAccounts();
  const { data: tiktokAccounts = [] } = useTikTokAccounts();

  if (location.pathname.startsWith('/instagram')) {
    return {
      entities: instagramAccounts.map((account) => ({
        id: account.id,
        label: `@${account.username}`,
        color: account.color,
        thumbnailUrl: account.profilePicture,
      })),
      selectedIds: filters.instagramAccountIds,
      onChange: (instagramAccountIds) => filters.set({ instagramAccountIds }),
      allLabel: 'Tous les comptes',
      noun: 'comptes',
    };
  }

  if (location.pathname.startsWith('/tiktok')) {
    return {
      entities: tiktokAccounts.map((account) => ({
        id: account.id,
        label: `@${account.username}`,
        color: account.color,
        thumbnailUrl: account.profilePicture,
      })),
      selectedIds: filters.tiktokAccountIds,
      onChange: (tiktokAccountIds) => filters.set({ tiktokAccountIds }),
      allLabel: 'Tous les comptes',
      noun: 'comptes',
    };
  }

  const channelEntities = channels.map((channel) => ({
    id: channel.id,
    label: channel.name,
    color: channel.color,
    thumbnailUrl: channel.thumbnailUrl,
  }));

  /**
   * Le dashboard mêle des blocs YouTube, Instagram et TikTok : son sélecteur propose les
   * trois, chacun dans son groupe, **tous cochés par défaut** (sélection vide = tout).
   * Chaque groupe écrit dans son propre filtre — les mêmes que `/instagram` et `/tiktok`,
   * si bien qu'un compte décoché ici l'est aussi là-bas.
   */
  if (location.pathname === '/') {
    const groups: EntityGroup[] = [
      {
        label: 'Chaînes YouTube',
        entities: channelEntities,
        selectedIds: filters.channelIds,
        onChange: (channelIds: string[]) => filters.set({ channelIds }),
      },
      {
        label: 'Instagram',
        entities: instagramAccounts.map((account) => ({
          id: account.id,
          label: `@${account.username}`,
          color: account.color,
          thumbnailUrl: account.profilePicture,
        })),
        selectedIds: filters.instagramAccountIds,
        onChange: (instagramAccountIds: string[]) => filters.set({ instagramAccountIds }),
      },
      {
        label: 'TikTok',
        entities: tiktokAccounts.map((account) => ({
          id: account.id,
          label: `@${account.username}`,
          color: account.color,
          thumbnailUrl: account.profilePicture,
        })),
        selectedIds: filters.tiktokAccountIds,
        onChange: (tiktokAccountIds: string[]) => filters.set({ tiktokAccountIds }),
      },
    ].filter((group) => group.entities.length > 0);

    return {
      entities: groups.flatMap((group) => group.entities),
      selectedIds: groups.flatMap((group) => group.selectedIds),
      onChange: () => undefined,
      allLabel: 'Toutes les sources',
      noun: 'sources',
      groups,
    };
  }

  return {
    entities: channelEntities,
    selectedIds: filters.channelIds,
    onChange: (channelIds) => filters.set({ channelIds }),
    allLabel: 'Toutes les chaînes',
    noun: 'chaînes',
  };
};

/** Les entités cochées d'un groupe : toutes quand la sélection est vide. */
export const checkedIn = (group: Pick<EntityGroup, 'entities' | 'selectedIds'>) =>
  group.selectedIds.length === 0
    ? group.entities
    : group.entities.filter((entity) => group.selectedIds.includes(entity.id));

/**
 * Ce que le déclencheur affiche, identique au large (`EntityPicker`) et dans le résumé
 * mobile (`FiltersSheet`) : « Toutes… », le nom de l'unique entité retenue, ou un compte.
 * Renvoie aussi les entités retenues (pour les miniatures), vide quand tout l'est.
 */
export const pickerSummary = (
  picker: FilterPicker,
): { label: string; selected: PickableEntity[] } => {
  const groups = picker.groups ?? [
    {
      label: '',
      entities: picker.entities,
      selectedIds: picker.selectedIds,
      onChange: picker.onChange,
    },
  ];
  if (groups.every((group) => group.selectedIds.length === 0)) {
    return { label: picker.allLabel, selected: [] };
  }
  const selected = groups.flatMap((group) => checkedIn(group));
  return {
    label: selected.length === 1 ? selected[0]!.label : `${selected.length} ${picker.noun}`,
    selected,
  };
};
