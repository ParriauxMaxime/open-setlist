import { Link } from "@swan-io/chicane";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { getPerformReturn } from "../../performance/components/perform-sidebar";
import { NavLink } from "./nav-link";
import { SidebarNav } from "./sidebar-nav";
import { SidebarPanel } from "./sidebar-panel";

const isDev = process.env.NODE_ENV !== "production";

const PLAYGROUND_ROUTES = ["Chords"] as const;

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useTranslation();

  const route = Router.useRoute([
    "Catalog",
    "SongNew",
    "SongEdit",
    "Setlists",
    "SetlistEdit",
    "Chords",
    "Sync",
    "Settings",
  ]);

  const section = route
    ? route.name === "Setlists" || route.name === "SetlistEdit"
      ? "setlists"
      : route.name === "Sync"
        ? "sync"
        : route.name === "Settings"
          ? "settings"
          : (PLAYGROUND_ROUTES as readonly string[]).includes(route.name)
            ? "playground"
            : "songs"
    : "songs";

  const performReturn = getPerformReturn();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const [playgroundOpen, setPlaygroundOpen] = useState(section === "playground");

  // Close mobile sidebar on route change
  const prevRoute = useRef(route?.name);
  useEffect(() => {
    if (prevRoute.current !== route?.name) {
      prevRoute.current = route?.name;
      setMobileOpen(false);
    }
  });

  const returnHref = performReturn?.setlistId
    ? Router.Perform({ setlistId: performReturn.setlistId })
    : performReturn?.songId
      ? Router.PerformSong({ songId: performReturn.songId })
      : null;

  const returnLabel = performReturn?.setlistId
    ? t("perform.backToSet")
    : performReturn?.songId
      ? t("perform.backToSong")
      : null;

  const header = returnHref ? (
    <Link
      to={returnHref}
      className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent-muted"
    >
      <span className="text-lg">←</span>
      {returnLabel}
    </Link>
  ) : (
    <div className="mb-4 px-3 py-2">
      <span className="text-lg font-bold text-text">Open Setlist</span>
    </div>
  );

  const playgroundFooter = isDev ? (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setPlaygroundOpen((o) => !o)}
        className={[
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          section === "playground"
            ? "text-accent"
            : "text-text-muted hover:bg-bg-hover hover:text-text",
        ].join(" ")}
      >
        <span className="text-lg">🧪</span>
        <span className="flex-1 text-left">{t("nav.playground")}</span>
        <span className="text-xs text-text-faint">{playgroundOpen ? "▾" : "▸"}</span>
      </button>
      {playgroundOpen && (
        <div className="ml-4 flex flex-col gap-0.5">
          <NavLink to="Chords" label={t("nav.chords")} icon="♯" active={route?.name === "Chords"} />
        </div>
      )}
    </div>
  ) : null;

  const sidebarContent = (
    <>
      {header}
      <SidebarNav activeSection={section} footer={playgroundFooter} />
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar — always visible on desktop */}
      <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-bg-surface p-3 md:flex">
        {sidebarContent}
      </nav>

      {/* Mobile header bar with hamburger */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-xl text-text-muted hover:bg-bg-hover hover:text-text"
          aria-label="Open menu"
        >
          ☰
        </button>
        <span className="text-sm font-bold text-text">Open Setlist</span>
      </div>

      {/* Mobile sidebar overlay */}
      <SidebarPanel open={mobileOpen} onClose={closeMobile}>
        <div className="flex flex-col gap-1 p-3">{sidebarContent}</div>
      </SidebarPanel>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
