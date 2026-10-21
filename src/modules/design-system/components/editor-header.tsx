import { Link } from "@swan-io/chicane";
import type { ReactNode } from "react";

interface Breadcrumb {
  label: string;
  to?: string;
}

interface EditorHeaderProps {
  /** The last crumb is the page title. */
  breadcrumbs: Breadcrumb[];
  /** Buttons of the toolbar, left side. */
  actions?: ReactNode;
  /** The ⋮ menu, right end of the toolbar. */
  menu?: ReactNode;
}

/** Way back and title on top, then a toolbar that stays visible while the page scrolls. */
export function EditorHeader({ breadcrumbs, actions, menu }: EditorHeaderProps) {
  const parents = breadcrumbs.slice(0, -1);
  const title = breadcrumbs[breadcrumbs.length - 1]?.label ?? "";
  return (
    <header className="mb-4 flex flex-col gap-2">
      <div className="min-w-0">
        {parents.length > 0 && (
          <nav className="flex items-center gap-1.5 text-sm">
            {parents.map((crumb, i) => (
              <span key={crumb.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-text-faint">&rsaquo;</span>}
                {crumb.to ? (
                  <Link to={crumb.to} className="text-accent hover:underline">
                    &larr; {crumb.label}
                  </Link>
                ) : (
                  <span className="text-text-muted">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold text-text">{title}</h1>
      </div>
      {(actions || menu) && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-surface px-2 py-1.5">
          {actions}
          {menu && <div className="ml-auto">{menu}</div>}
        </div>
      )}
    </header>
  );
}
