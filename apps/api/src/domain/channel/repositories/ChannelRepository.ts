import type { Channel, CreateChannelInput, UpdateChannelInput } from '../entities/Channel.ts';

export interface ChannelRepository {
  findAll(options?: { includeArchived?: boolean }): Channel[];
  findById(id: string): Channel | null;
  findByExternalId(externalId: string): Channel | null;
  create(input: CreateChannelInput): Channel;
  update(id: string, input: UpdateChannelInput): Channel;
  delete(id: string): void;
}
