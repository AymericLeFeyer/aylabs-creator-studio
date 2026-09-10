import type { ProductionFormat } from '../../../domain/production/entities/Production.ts';
import { FORMAT_LABELS } from '../../../domain/production/entities/Production.ts';
import { FORMAT_ICONS } from './formatIcons.ts';

/** Le pictogramme d'un format, avec son libellé pour les lecteurs d'écran et le survol. */
export const FormatIcon = ({
  format,
  className,
}: {
  format: ProductionFormat;
  className?: string;
}) => {
  const Icon = FORMAT_ICONS[format];
  return (
    <Icon className={className} aria-label={FORMAT_LABELS[format]}>
      <title>{FORMAT_LABELS[format]}</title>
    </Icon>
  );
};
