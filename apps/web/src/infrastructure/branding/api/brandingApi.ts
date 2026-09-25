import { request } from '../../http/httpClient.ts';
import type { Branding, BrandingIconKey } from '../../../domain/branding/entities/Branding.ts';

export const brandingApi = {
  get: () => request<Branding>('/api/branding'),

  setName: (name: string | null) =>
    request<Branding>('/api/branding', { method: 'PATCH', body: { name } }),

  /** Les PNG en data URL, déjà redimensionnés par `renderLogoIcons`. */
  setLogo: (icons: Record<BrandingIconKey, string>) =>
    request<Branding>('/api/branding/logo', { method: 'PUT', body: { icons } }),

  clearLogo: () => request<Branding>('/api/branding/logo', { method: 'DELETE' }),
};
