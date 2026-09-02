/**
 * La société derrière les chaînes.
 *
 * Table à **ligne unique** (`id = 'default'`) plutôt qu'un fichier de configuration :
 * ces informations se saisissent depuis l'interface, et surtout `foundedOn` décide du
 * premier mois du tableau des obligations — une valeur qui doit pouvoir changer sans
 * redéploiement.
 */
export interface Company {
  id: string;
  name: string;
  legalForm: string | null;
  siret: string | null;
  vatNumber: string | null;
  address: string | null;
  /**
   * Date de création de la société. `null` tant qu'elle n'est pas saisie : le tableau
   * légal n'a alors aucun premier mois et retombe sur les 12 derniers.
   */
  foundedOn: string | null;
  notes: string | null;
  updatedAt: string;
}

export type UpdateCompanyInput = Partial<Omit<Company, 'id' | 'updatedAt'>>;
