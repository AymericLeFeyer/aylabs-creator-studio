import { useState } from 'react';
import {
  useIntegrations,
  useUpdateIntegration,
} from '../../../application/integration/usecases/useIntegrations.ts';
import type {
  CredentialFieldView,
  IntegrationProvider,
} from '../../../domain/integration/entities/Integration.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

const fieldPlaceholder = (field: CredentialFieldView, secretsKeyConfigured: boolean): string => {
  if (field.source === 'env') return `Défini par ${field.envVar}`;
  if (field.unreadable) return 'Illisible (SECRETS_KEY a changé) : à ressaisir';
  if (field.secret && field.source === 'app') return '•••••••• (enregistré)';
  if (field.secret && !secretsKeyConfigured) return 'SECRETS_KEY requise';
  return field.optional ? 'Facultatif' : '';
};

/**
 * Les identifiants d'une source de l'export (Amazon, Domadoo, Discord, le profil public
 * Instagram…), pour être posés là où le domaine qu'ils alimentent se règle déjà —
 * Paramètres → Revenus → Affiliation pour Amazon et Domadoo, Paramètres → Audience →
 * Instagram et → Discord pour les deux autres.
 *
 * **Ce que cette carte ne fait pas** : ni l'interrupteur « Publier dans l'export », ni le
 * bouton « Collecter », ni l'aperçu des données publiées. Ces trois-là restent groupés
 * dans Paramètres → API, la seule page qui parle de ce qui *sort* du studio — cette carte
 * ne parle que de ce qui y *entre*.
 *
 * Le champ s'édite **localement jusqu'à l'enregistrement**, comme le `ProviderCard`
 * d'origine dont cette carte reprend la logique : seuls les champs touchés partent, un
 * secret laissé vide est conservé.
 */
export const ProviderCredentialsCard = ({
  provider,
  title,
}: {
  provider: IntegrationProvider;
  title?: string;
}) => {
  const { data } = useIntegrations();
  const update = useUpdateIntegration();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const integration = data?.providers.find((candidate) => candidate.id === provider);
  if (!integration || integration.fields.length === 0) return null;

  const secretsKeyConfigured = data?.secretsKeyConfigured ?? true;
  const dirty = Object.keys(draft).length > 0;
  const needsSecretsKey = !secretsKeyConfigured && integration.fields.some((field) => field.secret);

  const save = () => {
    const credentials: Record<string, string | null> = {};
    for (const field of integration.fields) {
      if (!(field.key in draft)) continue;
      const value = draft[field.key] ?? '';
      // Un secret vide veut dire « je n'y touche pas », pas « efface-le ».
      if (field.secret && value === '') continue;
      credentials[field.key] = value === '' ? null : value;
    }
    update.mutate(
      { provider: integration.id, input: { credentials } },
      { onSuccess: () => setDraft({}) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? integration.label}</CardTitle>
        <CardDescription>{integration.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {needsSecretsKey && (
          <p className="text-xs text-muted-foreground">
            <code>SECRETS_KEY</code> n’est pas définie côté serveur : les champs secrets sont
            verrouillés, rien ne sera stocké en clair. Ajoute-la à la stack (16 caractères minimum),
            ou passe l’identifiant en variable d’environnement.
          </p>
        )}

        <div className="space-y-3">
          {integration.fields.map((field) => {
            const locked = field.source === 'env' || (field.secret && !secretsKeyConfigured);
            const id = `${integration.id}-${field.key}`;
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.unreadable && <span className="text-xs text-destructive">illisible</span>}
                  {field.source === 'app' && !locked && (
                    <button
                      type="button"
                      className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() =>
                        update.mutate({
                          provider: integration.id,
                          input: { credentials: { [field.key]: null } },
                        })
                      }
                    >
                      Effacer
                    </button>
                  )}
                </div>
                <Input
                  id={id}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="off"
                  disabled={locked}
                  value={
                    field.key in draft
                      ? (draft[field.key] ?? '')
                      : field.secret
                        ? ''
                        : (field.value ?? '')
                  }
                  placeholder={fieldPlaceholder(field, secretsKeyConfigured)}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {field.hint && <>{field.hint} </>}
                  Variable : <code>{field.envVar}</code>
                </p>
              </div>
            );
          })}
        </div>

        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}

        {dirty && (
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={save}>
              {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft({})}>
              Annuler
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
