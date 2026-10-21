import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../design-system/components/card";
import { usePendingChanges } from "../hooks/use-pending-changes";
import { NavLink } from "./nav-link";

/** The four sections of the app, in the order every navigation shows them. */
export const MAIN_SECTIONS = [
  { to: "Catalog", section: "songs", labelKey: "nav.songs", icon: "♫" },
  { to: "Setlists", section: "setlists", labelKey: "nav.setlists", icon: "☰" },
  { to: "Sync", section: "sync", labelKey: "nav.sync", icon: "⇄" },
  { to: "Settings", section: "settings", labelKey: "nav.settings", icon: "⚙" },
] as const;

/** Local changes waiting for the next sync, on the Sync entry. */
export function PendingChangesBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <Badge>
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{t("sync.status.pending", { count })}</span>
    </Badge>
  );
}

interface SidebarNavProps {
  /** Current active section for highlighting. */
  activeSection?: string;
  /** Called before each navigation (e.g. to store perform return state). */
  onNavigate?: () => void;
  /** Extra content rendered below the main links (e.g. dev playground). */
  footer?: ReactNode;
}

/**
 * Shared navigation links — Songs, Setlists, Sync, Settings.
 * Used by both admin sidebar and performance sidebar.
 */
export function SidebarNav({ activeSection, onNavigate, footer }: SidebarNavProps) {
  const { t } = useTranslation();
  const pending = usePendingChanges();

  return (
    <>
      {MAIN_SECTIONS.map(({ to, section, labelKey, icon }) => (
        <NavLink
          key={to}
          to={to}
          label={t(labelKey)}
          icon={icon}
          active={activeSection === section}
          onClick={onNavigate}
          badge={to === "Sync" && pending ? <PendingChangesBadge count={pending} /> : undefined}
        />
      ))}
      {footer}
    </>
  );
}
