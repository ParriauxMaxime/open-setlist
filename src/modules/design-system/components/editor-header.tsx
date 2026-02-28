import { Link } from "@swan-io/chicane";

interface Breadcrumb {
  label: string;
  to?: string;
}

interface EditorHeaderProps {
  breadcrumbs: Breadcrumb[];
  actions: React.ReactNode;
}

export function EditorHeader({ breadcrumbs, actions }: EditorHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={crumb.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-text-faint">&rsaquo;</span>}
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className="shrink-0 text-accent hover:underline">
                  &larr; {crumb.label}
                </Link>
              ) : (
                <span className="truncate text-text-muted">{crumb.label}</span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
