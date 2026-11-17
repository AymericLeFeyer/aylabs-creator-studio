import { cn } from '../../../shared/cn.ts';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** Un choix à plat, toutes les options visibles : plus lisible qu'une liste déroulante à trois entrées. */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex shrink-0 rounded-lg bg-muted p-0.5 text-sm"
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          title={option.title}
          disabled={disabled || option.disabled}
          onClick={() => !active && onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1 font-medium transition-colors',
            active
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            (disabled || option.disabled) &&
              'cursor-not-allowed opacity-40 hover:text-muted-foreground',
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
