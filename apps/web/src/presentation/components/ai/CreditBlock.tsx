import { useState } from 'react';
import { useUpdateAiSettings, useAiSpend } from '../../../application/ai/usecases/useAi.ts';
import {
  AI_PROVIDERS,
  formatDollars,
  type AiProviderView,
} from '../../../domain/ai/entities/Ai.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

/**
 * Les crédits d'un fournisseur. Le solde se **note** à la main (aucune API n'en rend un) ;
 * OpenAI, avec une clé admin, y ajoute la dépense réelle, ce qui rend le reste exact.
 */
export const CreditBlock = ({ view }: { view: AiProviderView }) => {
  const update = useUpdateAiSettings();
  const [balance, setBalance] = useState('');
  const hasAdmin = view.provider === 'openai' && view.adminKeySource !== null;
  const spend = useAiSpend(hasAdmin);
  const { credit } = view;
  const real = hasAdmin && spend.data?.available && !spend.data.error ? spend.data : null;
  const remaining = real?.remainingCents ?? credit.remainingCents;
  const amount = Number(balance.replace(',', '.'));
  const valid = balance.trim() !== '' && Number.isFinite(amount) && amount >= 0;

  const save = () =>
    update.mutate(
      { provider: view.provider, creditBalance: amount },
      { onSuccess: () => setBalance('') },
    );

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">Crédits</h4>
        <a
          href={AI_PROVIDERS[view.provider].billingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Page de facturation
        </a>
      </div>

      {credit.exhausted && (
        <p className="text-sm font-medium text-destructive">
          L’API a répondu que le solde était épuisé. Recharge-le, puis note le nouveau montant.
        </p>
      )}

      {remaining !== null && !(credit.unpriced && !real) ? (
        <div className="space-y-0.5">
          <p
            className={cn(
              'tabular text-2xl font-semibold',
              credit.low && 'text-[var(--expense)]',
              credit.exhausted && 'text-destructive',
            )}
          >
            ≈ {formatDollars(remaining)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDollars(credit.balanceCents ?? 0)} relevés
            {credit.setAt ? ` le ${formatDate(credit.setAt.slice(0, 10))}` : ''}, dont{' '}
            {formatDollars(real?.sinceNoteCents ?? credit.spentCents)}{' '}
            {real ? 'dépensés (relevé OpenAI)' : 'consommés par le studio'} depuis.
          </p>
        </div>
      ) : credit.unpriced ? (
        <p className="text-sm text-muted-foreground">
          Le tarif d’au moins un appel est inconnu. Relève à nouveau le solde pour reprendre
          l’estimation.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun solde noté : le studio ne peut pas te prévenir avant qu’il soit épuisé.
        </p>
      )}

      {real && (
        <p className="text-xs text-muted-foreground">
          Dépensé ce mois-ci sur l’organisation OpenAI : {formatDollars(real.monthCents ?? 0)}.
        </p>
      )}
      {!real && !credit.unpriced && credit.remainingCents !== null && (
        <p className="text-xs text-muted-foreground">
          Estimation : une clé utilisée ailleurs que dans le studio n’est pas comptée.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`credit-${view.provider}`}>Solde affiché par la Console ($)</Label>
          <Input
            id={`credit-${view.provider}`}
            inputMode="decimal"
            className="w-40"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="12,50"
          />
        </div>
        <Button variant="outline" onClick={save} disabled={!valid || update.isPending}>
          Noter ce solde
        </Button>
      </div>
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
    </div>
  );
};
