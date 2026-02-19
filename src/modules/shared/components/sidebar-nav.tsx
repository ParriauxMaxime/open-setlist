import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "./nav-link";

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

  return (
    <>
      <NavLink
        to="Catalog"
        label={t("nav.songs")}
        icon="♫"
        active={activeSection === "songs"}
        onClick={onNavigate}
      />
      <NavLink
        to="Setlists"
        label={t("nav.setlists")}
        icon="☰"
        active={activeSection === "setlists"}
        onClick={onNavigate}
      />
      <NavLink
        to="Sync"
        label={t("nav.sync")}
        icon="⇄"
        active={activeSection === "sync"}
        onClick={onNavigate}
      />
      <NavLink
        to="Settings"
        label={t("nav.settings")}
        icon="⚙"
        active={activeSection === "settings"}
        onClick={onNavigate}
      />
      {footer}
    </>
  );
}
