/**
 * Un relevé Discord, à l'échelle de la **collecte** et non du jour : contrairement à
 * Domadoo, membres et connectés bougent d'une heure à l'autre, et c'est précisément ce
 * qu'on veut voir sur le graphique. Pas d'`upsert` ici, un `insert` par passage.
 */
export interface DiscordSnapshotRow {
  fetchedAt: string;
  members: number | null;
  membersOnline: number | null;
}

export interface DiscordSnapshotRepository {
  insert(row: DiscordSnapshotRow): void;
  /** Tous les relevés entre deux dates (`AAAA-MM-JJ`), du plus ancien au plus récent. */
  findInRange(from: string, to: string): DiscordSnapshotRow[];
}
