/**
 * Contrat de `/api/discord/history`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 *
 * Un point par collecte, pas par jour : contrairement à Domadoo, membres et connectés
 * bougent d'une heure à l'autre, et c'est cette variation qu'on veut lire.
 */
export interface DiscordSnapshot {
  fetchedAt: string;
  members: number | null;
  membersOnline: number | null;
}
