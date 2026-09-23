import { useLocation } from 'react-router-dom';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useInstagramAccounts } from '../../../application/instagram/usecases/useInstagram.ts';
import { useTikTokAccounts } from '../../../application/tiktok/usecases/useTikTok.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { PickableEntity } from './EntityPicker.tsx';

export interface FilterPicker {
  entities: PickableEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  noun: string;
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

  return {
    entities: channels.map((channel) => ({
      id: channel.id,
      label: channel.name,
      color: channel.color,
      thumbnailUrl: channel.thumbnailUrl,
    })),
    selectedIds: filters.channelIds,
    onChange: (channelIds) => filters.set({ channelIds }),
    allLabel: 'Toutes les chaînes',
    noun: 'chaînes',
  };
};
