import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Card } from './ui/card.tsx';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

/** Écran vide réutilisable : toujours avec une action, jamais un cul-de-sac. */
export const EmptyState = ({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: EmptyStateProps) => (
  <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <span className="rounded-full bg-muted p-3 text-muted-foreground">
      <Inbox className="h-6 w-6" />
    </span>
    <div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
    {actionLabel && actionTo && (
      <Button asChild size="sm">
        <Link to={actionTo}>{actionLabel}</Link>
      </Button>
    )}
    {actionLabel && onAction && (
      <Button size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </Card>
);
