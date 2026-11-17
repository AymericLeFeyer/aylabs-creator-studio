import { useState } from 'react';
import { useAiSpend, useUpdateAiSettings } from '../../../application/ai/usecases/useAi.ts';
import {
  AI_PROVIDERS,
  formatDollars,
  type AiProviderView,
} from '../../../domain/ai/entities/Ai.ts';
import { cn } from '../../../shared/cn.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';

/** Ce qu'il reste : la dépense réelle d'OpenAI (clé admin) quand elle est lisible, sinon l'estimation. */
const useRemaining = (view: AiProviderView) => {
  const hasAdmin = view.provider === 'openai' && view.adminKeySource !== null;
  const spend = useAiSpend(hasAdmin);
  const real = hasAdmin && spend.data?.available && !spend.data.error ? spend.data : null;
  const { credit } = view;
  return {
    real,
    remaining: real?.remainingCents ?? credit.remainingCents,
    spent: real?.sinceNoteCents ?? credit.spentCents,
  };
};

/** La jauge : le reste du solde noté, en un coup d'œil. */
export const CreditGauge = ({ view }: { view: AiProviderView }) => {
  const { credit } = view;
  const { real, remaining, spent } = useRemaining(view);
  const known = remaining !== null && !(credit.unpriced && !real);
  const share = known && credit.balanceCents ? Math.min(1, remaining / credit.balanceCents) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Crédits
        </span>
        {known ? (
          <span
            className={cn(
              'tabular text-lg font-semibold',
              credit.low && 'text-[var(--expense)]',
              credit.exhausted && 'text-destructive',
            )}
          >
            ≈ {formatDollars(remaining)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Aucun solde noté</span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            credit.low || credit.exhausted ? 'bg-[var(--expense)]' : 'bg-[var(--positive)]',
          )}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {credit.exhausted
          ? 'L’API a répondu que le solde était épuisé : recharge-le, puis note le nouveau montant.'
          : credit.unpriced && !real
            ? 'Le tarif d’un appel est inconnu : relève à nouveau le solde pour reprendre l’estimation.'
            : known
              ? `${formatDollars(credit.balanceCents ?? 0)} relevés${credit.setAt ? ` le ${formatDate(credit.setAt.slice(0, 10))}` : ''}, ${formatDollars(spent)} ${real ? 'dépensés (relevé OpenAI)' : 'consommés par le studio'} depuis.`
              : 'Note le solde de la Console pour être prévenu avant qu’il soit épuisé.'}
        {real && ` Ce mois-ci : ${formatDollars(real.monthCents ?? 0)}.`}
      </p>
    </div>
  );
};

/** Le solde relevé dans la Console, à noter de temps en temps. */
export const CreditNoteForm = ({ view }: { view: AiProviderView }) => {
  const update = useUpdateAiSettings();
  const [balance, setBalance] = useState('');
  const amount = Number(balance.replace(',', '.'));
  const valid = balance.trim() !== '' && Number.isFinite(amount) && amount >= 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`credit-${view.provider}`}>Solde affiché par la Console ($)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`credit-${view.provider}`}
          inputMode="decimal"
          className="w-32"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          placeholder="12,50"
        />
        <Button
          variant="outline"
          disabled={!valid || update.isPending}
          onClick={() =>
            update.mutate(
              { provider: view.provider, creditBalance: amount },
              { onSuccess: () => setBalance('') },
            )
          }
        >
          Noter ce solde
        </Button>
        <a
          href={AI_PROVIDERS[view.provider].billingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Page de facturation
        </a>
      </div>
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
    </div>
  );
};
