import type { Branding, BrandingIconKey } from '../entities/Branding.ts';

/** Ligne unique (`id = 'default'`) + une icône par emplacement. */
export interface BrandingRepository {
  get(): Branding;
  /** `null` rend le nom par défaut. */
  setName(name: string | null): Branding;
  /** Remplace **toutes** les icônes d'un coup et change `logoVersion`, en transaction. */
  setLogo(icons: Record<BrandingIconKey, Uint8Array>): Branding;
  /** Retire le logo : les icônes livrées avec le front reprennent la main. */
  clearLogo(): Branding;
  icon(key: BrandingIconKey): Uint8Array | null;
}
