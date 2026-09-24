import { cn } from '../../shared/cn.ts';

/** La place d'un bloc qui charge : même hauteur qu'un graphique, pour que rien ne saute. */
export const BlockSkeleton = ({ className }: { className?: string }) => (
  <div className={cn('h-72 animate-pulse rounded-xl border border-border bg-card', className)} />
);
