import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-[hsl(var(--surface-elevated))] p-5 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-5 max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
