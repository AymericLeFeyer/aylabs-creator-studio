import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mailApi } from '../../../infrastructure/mail/api/mailApi.ts';
import type {
  MailAiRequest,
  MailSettingsInput,
  MailThreadFilter,
  MailThreadView,
  SendMailInput,
} from '../../../domain/mail/entities/Mail.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * La boîte mail. Tout vit sous `['mails']` : un relevé, un envoi ou un rattachement
 * repartent sur la liste, le fil ouvert et la pastille d'un coup — un fil lu sort des
 * « Non lus » et fait baisser la pastille du menu dans le même geste.
 */
const useMailMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });
};

export const useMailSettings = () =>
  useQuery({ queryKey: queryKeys.mailSettings(), queryFn: () => mailApi.settings() });

export const useUpdateMailSettings = () =>
  useMailMutation((input: MailSettingsInput) => mailApi.updateSettings(input));

export const useTestMail = () => useMutation({ mutationFn: () => mailApi.test() });

/**
 * La pastille du menu : relue chaque minute. Le serveur relève la boîte toutes les cinq
 * minutes de lui-même ; un mail lu sur le téléphone fait donc baisser le compte sans clic.
 */
export const useMailStats = () =>
  useQuery({
    queryKey: queryKeys.mailStats(),
    queryFn: () => mailApi.stats(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useSyncMail = () => useMailMutation(() => mailApi.sync());

export const useMailThreads = (filter: MailThreadFilter, enabled = true) =>
  useQuery({
    queryKey: queryKeys.mailThreads(filter),
    queryFn: () => mailApi.threads(filter),
    enabled,
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

export const useMailThread = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.mailThread(id ?? ''),
    queryFn: () => mailApi.thread(id!),
    enabled: id !== null,
  });

export const useUpdateMailThread = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { brandId?: string | null; productionId?: string | null; read?: boolean };
    }) => mailApi.updateThread(id, input),
    onSuccess: (thread) => {
      queryClient.setQueryData<MailThreadView>(queryKeys.mailThread(thread.id), thread);
      void queryClient.invalidateQueries({ queryKey: ['mails', 'threads'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailStats() });
    },
  });
};

/**
 * Les demandes à l'IA. Elles **n'écrivent rien** dans un brouillon ni ne partent nulle
 * part : le texte rendu est posé à l'écran, que l'on relit. Seul le résumé du fil est
 * gardé côté API, d'où l'invalidation du fil.
 */
export const useMailAi = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: MailAiRequest }) =>
      mailApi.ai(id, request),
    onSuccess: (_result, { id, request }) => {
      if (request.action === 'summarize') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.mailThread(id) });
      }
    },
  });
};

export const useSummarizeMailMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId }: { messageId: string; threadId: string }) =>
      mailApi.summarizeMessage(messageId),
    onSuccess: (_result, { threadId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailThread(threadId) });
    },
  });
};

export const useMailVideoNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => mailApi.videoNote(threadId),
    onSuccess: (note, threadId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailThread(threadId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.productionNotes(note.productionId),
      });
    },
  });
};

/** Le seul hook qui fasse partir un mail — appelé par la modale de confirmation, et elle seule. */
export const useSendMail = () => useMailMutation((input: SendMailInput) => mailApi.send(input));
