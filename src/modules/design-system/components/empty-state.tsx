import type { ReactNode } from "react";

interface EmptyStateProps {
  message: ReactNode;
  /** The obvious next step: a button or a link. */
  action?: ReactNode;
  className?: string;
}

/** One short line where a list has nothing to show, with what to do next. */
export function EmptyState({ message, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm text-text-muted ${className}`}>
      <p>{message}</p>
      {action}
    </div>
  );
}
