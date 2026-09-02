import { request } from '../../http/httpClient.ts';
import type {
  RequirementInput,
  Sponsorship,
  SponsorshipInput,
  SponsorshipRequirement,
  SponsorshipStatus,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';

export interface SponsorshipListParams {
  statuses?: SponsorshipStatus[];
  brandIds?: string[];
  productionIds?: string[];
  channelIds?: string[];
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const sponsorshipApi = {
  list: (params: SponsorshipListParams = {}) =>
    request<Sponsorship[]>('/api/sponsorships', {
      query: {
        statuses: csv(params.statuses),
        brandIds: csv(params.brandIds),
        productionIds: csv(params.productionIds),
        channelIds: csv(params.channelIds),
      },
    }),

  create: (input: SponsorshipInput) =>
    request<Sponsorship>('/api/sponsorships', { method: 'POST', body: input }),

  update: (id: string, input: Partial<SponsorshipInput>) =>
    request<Sponsorship>(`/api/sponsorships/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/sponsorships/${id}`, { method: 'DELETE' }),

  /** Les plans à filmer exigés par la marque : ils vivent sous leur sponso. */
  addRequirement: (sponsorshipId: string, input: RequirementInput) =>
    request<SponsorshipRequirement>(`/api/sponsorships/${sponsorshipId}/requirements`, {
      method: 'POST',
      body: input,
    }),

  updateRequirement: (sponsorshipId: string, id: string, input: Partial<RequirementInput>) =>
    request<SponsorshipRequirement>(`/api/sponsorships/${sponsorshipId}/requirements/${id}`, {
      method: 'PATCH',
      body: input,
    }),

  removeRequirement: (sponsorshipId: string, id: string) =>
    request<void>(`/api/sponsorships/${sponsorshipId}/requirements/${id}`, { method: 'DELETE' }),
};
