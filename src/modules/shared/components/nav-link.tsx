import { Link } from "@swan-io/chicane";
import { Router } from "../../../router";

type RouteName = Parameters<typeof Router.useRoute>[0][number];

interface NavLinkProps {
  to: RouteName;
  params?: Record<string, string>;
  label: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
}

export function NavLink({ to, params, label, icon, active, onClick }: NavLinkProps) {
  return (
    <Link
      to={(Router[to] as (params?: Record<string, string>) => string)(params)}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent-muted text-accent"
          : "text-text-muted hover:bg-bg-hover hover:text-text",
      ].join(" ")}
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
