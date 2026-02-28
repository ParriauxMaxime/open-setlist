import { Link } from "@swan-io/chicane";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { getPerformReturn } from "../../performance/components/perform-sidebar";
import { GettingStartedBanner } from "./getting-started-banner";
import { NavLink } from "./nav-link";
import { ProfileSwitcher } from "./profile-switcher";
import { SidebarNav } from "./sidebar-nav";
import { SidebarPanel } from "./sidebar-panel";

const isDev = process.env.NODE_ENV !== "production";

const TOOLS_ROUTES = ["Chords", "Tuner", "Quality"] as const;

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
    "Tuner",
    "Quality",
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
          : (TOOLS_ROUTES as readonly string[]).includes(route.name)
            ? "tools"
            : "songs"
    : "songs";

  const performReturn = getPerformReturn();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const [toolsOpen, setToolsOpen] = useState(section === "tools");
  const [playgroundOpen, setPlaygroundOpen] = useState(false);

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
      <span className="text-lg" aria-hidden="true">
        {"\u2190"}
      </span>
      {returnLabel}
    </Link>
  ) : (
    <>
      <ProfileSwitcher />
      <GettingStartedBanner />
    </>
  );

  const toolsFooter = (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setToolsOpen((o) => !o)}
        className={[
          "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          section === "tools"
            ? "text-accent hover:bg-bg-hover"
            : "text-text-muted hover:bg-bg-hover hover:text-text",
        ].join(" ")}
      >
        <span className="text-lg" aria-hidden="true">
          🛠
        </span>
        <span className="flex-1 text-left">{t("nav.tools")}</span>
        <span className="text-xs text-text-faint">{toolsOpen ? "▾" : "▸"}</span>
      </button>
      <div
        className="ml-4 grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: toolsOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5">
            <NavLink to="Tuner" label={t("nav.tuner")} active={route?.name === "Tuner"} />
            <NavLink to="Chords" label={t("nav.chords")} active={route?.name === "Chords"} />
            <NavLink to="Quality" label={t("nav.quality")} active={route?.name === "Quality"} />
          </div>
        </div>
      </div>
    </div>
  );

  const playgroundFooter = isDev ? (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setPlaygroundOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
      >
        <span className="text-lg" aria-hidden="true">
          🧪
        </span>
        <span className="flex-1 text-left">{t("nav.playground")}</span>
        <span className="text-xs text-text-faint">{playgroundOpen ? "▾" : "▸"}</span>
      </button>
      <div
        className="ml-4 grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: playgroundOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5" />
        </div>
      </div>
    </div>
  ) : null;

  const sidebarContent = (
    <>
      {header}
      <SidebarNav
        activeSection={section}
        footer={
          <>
            {toolsFooter}
            {playgroundFooter}
          </>
        }
      />
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-bg focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Sidebar — always visible on desktop */}
      <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-bg-surface p-3 md:flex">
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
      <main id="main-content" className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
