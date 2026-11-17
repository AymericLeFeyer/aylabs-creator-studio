/**
 * L'assistant IA du studio.
 *
 * Un domaine **à part** et non un réglage des mails : la boîte mail en est le premier
 * utilisateur, pas le seul. La clé et le modèle se règlent une fois, dans Paramètres →
 * API → Assistant IA, et tout module qui en a besoin passe par `ManageAi.credentials()`.
 *
 * **L'IA ne fait que proposer.** Aucun module ne lui donne d'outil qui agisse à la place de
 * l'utilisateur (envoyer un mail, publier) : elle rend du texte ou des données, que le code
 * applique dans les limites qu'il fixe lui-même.
 */

/** `shared` : la clé OpenAI saisie pour les miniatures, réutilisée par l'assistant. */
export type AiKeySource = 'env' | 'app' | 'shared' | 'unreadable' | null;

export const AI_PROVIDERS = ['anthropic', 'openai'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_SETTINGS = {
  anthropic: { label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', model: 'claude-opus-5' },
  openai: { label: 'OpenAI', envKey: 'OPENAI_ASSISTANT_API_KEY', model: 'gpt-6.1-sol' },
} satisfies Record<AiProvider, { label: string; envKey: string; model: string }>;

export interface StoredAiSettings {
  /** Chiffrée par `SecretBox`. Seul `ManageAi` la lit en clair. */
  encryptedApiKey: string | null;
  model: string | null;
  /** Le solde relevé dans la Console, en centimes de dollar. `null` = jamais renseigné. */
  creditBalanceCents: number | null;
  creditSetAt: string | null;
  /** Ce que le studio a consommé depuis ce relevé, en millionièmes de dollar. */
  creditSpentMicros: number;
  /** Quand l'API a répondu que le solde était épuisé ; effacé au prochain appel réussi. */
  creditExhaustedAt: string | null;
  creditUnpriced: boolean;
  /** Clé admin OpenAI, chiffrée : lit la dépense réelle de l'organisation. */
  encryptedAdminKey: string | null;
}

/** Sous ce reste, l'écran et le menu préviennent (2 $). */
export const AI_CREDIT_ALERT_CENTS = 200;

/**
 * Le solde de crédits, **estimé**.
 *
 * L'API d'Anthropic n'expose aucun solde : seule la Console l'affiche. On part donc du
 * montant relevé à la main, et on en retire ce que le studio a consommé depuis — une clé
 * utilisée ailleurs que dans le studio n'est pas comptée. `exhausted` est le seul signal
 * certain : c'est l'API elle-même qui l'a dit.
 */
export interface AiCreditView {
  balanceCents: number | null;
  setAt: string | null;
  spentCents: number;
  remainingCents: number | null;
  exhausted: boolean;
  unpriced: boolean;
  low: boolean;
}

/**
 * Les tâches que l'assistant sait faire, chacune confiable au fournisseur de son choix.
 * Une tâche sans choix prend le fournisseur par défaut. Les libellés vivent ici et pas côté
 * front : l'écran ne fait que lister ce que l'API annonce, ajouter une tâche ne demande donc
 * qu'une ligne ici et un `task` à l'appel.
 */
export const AI_TASKS = [
  {
    id: 'script',
    group: 'Fiche de vidéo',
    label: 'Script',
    description: 'Écrire, réécrire ou compléter un passage du script.',
  },
  {
    id: 'titles',
    group: 'Fiche de vidéo',
    label: 'Titres',
    description: 'Proposer des idées de titre.',
  },
  {
    id: 'tags',
    group: 'Fiche de vidéo',
    label: 'Tags et hashtags',
    description: 'Tirer les tags et hashtags du script.',
  },
  {
    id: 'description',
    group: 'Fiche de vidéo',
    label: 'Description',
    description: 'Rédiger la description de la vidéo.',
  },
  {
    id: 'mail_reply',
    group: 'Boîte mail',
    label: 'Rédaction',
    description: 'Brouillons de réponse, relances, traductions et ajustements.',
  },
  {
    id: 'mail_analysis',
    group: 'Boîte mail',
    label: 'Analyse',
    description: 'Résumés, vérification des dates et note « Échanges » de la vidéo.',
  },
] as const;

export type AiTask = (typeof AI_TASKS)[number]['id'];
export const AI_TASK_IDS = AI_TASKS.map((task) => task.id) as [AiTask, ...AiTask[]];

/** Un fournisseur, tel que l'écran l'affiche. La clé n'en sort jamais. */
export interface AiProviderView {
  provider: AiProvider;
  label: string;
  envKey: string;
  keySource: AiKeySource;
  model: string;
  configured: boolean;
  credit: AiCreditView;
  /** La clé admin, seule à lire la dépense réelle. `null` : le fournisseur n'en a pas l'usage. */
  adminKeySource: AiKeySource;
}

/**
 * La dépense **réelle** d'OpenAI, lue avec la clé admin. OpenAI n'a pas d'API de solde :
 * seule la dépense de l'organisation (toutes clés, tous outils) est lisible. Le reste se
 * déduit du solde noté, moins la dépense depuis cette date.
 */
export interface AiSpendView {
  available: boolean;
  /** Dépensé depuis le 1er du mois (UTC), en centimes de dollar. */
  monthCents: number | null;
  /** Dépensé depuis le dernier solde noté, en centimes de dollar. */
  sinceNoteCents: number | null;
  /** `balanceCents − sinceNoteCents`, plancher à zéro. */
  remainingCents: number | null;
  error: string | null;
  fetchedAt: string | null;
}

export interface AiTaskView {
  task: AiTask;
  group: string;
  label: string;
  description: string;
  /** Le choix enregistré ; `null` = le fournisseur par défaut. */
  provider: AiProvider | null;
  /** Celui qui répondra vraiment (le choix s'il est configuré, sinon le défaut). */
  effectiveProvider: AiProvider;
}

export interface AiSettingsView {
  /** Le fournisseur des tâches qui n'ont pas de choix à elles. */
  defaultProvider: AiProvider;
  providers: AiProviderView[];
  tasks: AiTaskView[];
  secretsKeyConfigured: boolean;
  /** Au moins un fournisseur est prêt : c'est ce qui allume les boutons d'IA des écrans. */
  configured: boolean;
  /** Le solde le plus bas parmi les fournisseurs configurés : alimente la pastille du menu. */
  credit: AiCreditView;
}

export interface AiSettingsInput {
  /** Fournisseur dont les réglages (clé, modèle, solde) sont modifiés. */
  provider?: AiProvider;
  /** Change le fournisseur par défaut. */
  defaultProvider?: AiProvider;
  /** Fournisseur choisi par tâche ; `null` rend la tâche au fournisseur par défaut. */
  routes?: Partial<Record<AiTask, AiProvider | null>>;
  /** Absent = conservée, `null` ou `""` = effacée. */
  apiKey?: string | null;
  /** Clé admin OpenAI, même règle. Sans effet sur Anthropic. */
  adminKey?: string | null;
  model?: string | null;
  /** Solde relevé, **en dollars**. Le poser remet la consommation à zéro ; `null` l'efface. */
  creditBalance?: number | null;
}

/** Les jetons facturés d'un appel, tels que l'API les rapporte. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiCredentials {
  provider: AiProvider;
  apiKey: string;
  model: string;
}
