import { useMemo } from 'react';
import { useExternalApps } from '../../application/externalApp/usecases/useExternalApps.ts';
import { useIntegrations } from '../../application/integration/usecases/useIntegrations.ts';
import { withDiscord, withExternalApps, withTikTok } from '../navigation.ts';

/**
 * Le menu **augmenté** : `NAV_SECTIONS`, plus les applications externes activées, TikTok
 * et Discord quand ils sont configurés. Un seul point de composition, partagé par la barre
 * latérale et le réglage de la barre du bas — sinon on pourrait choisir pour le bas un
 * écran que le menu ne montre pas.
 */
export const useNavSections = () => {
  const { data: externalApps = [] } = useExternalApps();
  const { data: integrations } = useIntegrations();
  const discordConfigured =
    integrations?.providers.find((provider) => provider.id === 'discord')?.configured ?? false;
  const tiktokConfigured =
    integrations?.providers.find((provider) => provider.id === 'tiktok')?.configured ?? false;

  const sections = useMemo(
    () =>
      withDiscord(withTikTok(withExternalApps(externalApps), tiktokConfigured), discordConfigured),
    [externalApps, discordConfigured, tiktokConfigured],
  );
  return { sections, externalApps };
};
