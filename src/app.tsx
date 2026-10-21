import { useCallback, useState } from "react";
import { CatalogPage } from "./modules/catalog/page";
import { ChordsPage } from "./modules/chords/page";
import { CrewPage } from "./modules/crew/page";
import { EditSongPage } from "./modules/editor/page";
import { PerformPage } from "./modules/performance/page";
import { PrintPage } from "./modules/print/page";
import { QualityPage } from "./modules/quality/page";
import { SetlistPage } from "./modules/setlist/page";
import { SettingsPage } from "./modules/settings/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { FirstRunSetup } from "./modules/shared/components/first-run-setup";
import { JoinPrompt } from "./modules/shared/components/join-prompt";

import { SyncPage } from "./modules/sync/page";
import { TechSheetPage } from "./modules/tech-sheet/page";
import { TunerPage } from "./modules/tuner/page";
import { Router } from "./router";

export function App() {
  const route = Router.useRoute([
    "Home",
    "Catalog",
    "SongNew",
    "SongEdit",
    "Setlists",
    "SetlistEdit",
    "TechSheet",
    "Perform",
    "PerformSong",
    "Crew",
    "Print",
    "Chords",
    "Tuner",
    "Sync",
    "Settings",
    "SettingsSection",
    "Quality",
  ]);

  // Remounts the pages after the first-run setup: they read notation once per mount
  const [layoutKey, setLayoutKey] = useState(0);
  const remountLayout = useCallback(() => setLayoutKey((k) => k + 1), []);

  if (!route) {
    Router.replace("Catalog");
    return null;
  }

  // Performance mode — no admin layout
  if (route.name === "Perform") {
    return <PerformPage setlistId={route.params.setlistId} />;
  }
  if (route.name === "PerformSong") {
    return <PerformPage songId={route.params.songId} />;
  }
  if (route.name === "Crew") {
    return <CrewPage setlistId={route.params.setlistId} />;
  }
  if (route.name === "Print") {
    return (
      <PrintPage
        setlistId={route.params.setlistId}
        mode={route.params.mode}
        part={route.params.part}
      />
    );
  }

  // Admin routes — wrapped in layout
  return (
    <>
      <JoinPrompt />
      <FirstRunSetup onDone={remountLayout} />
      <AdminLayout key={layoutKey}>
        <AdminRoutes route={route} />
      </AdminLayout>
    </>
  );
}

function AdminRoutes({
  route,
}: {
  route: NonNullable<
    ReturnType<
      typeof Router.useRoute<
        | "Home"
        | "Catalog"
        | "SongNew"
        | "SongEdit"
        | "Setlists"
        | "SetlistEdit"
        | "TechSheet"
        | "Chords"
        | "Tuner"
        | "Sync"
        | "Settings"
        | "SettingsSection"
        | "Quality"
      >
    >
  >;
}) {
  switch (route.name) {
    case "Home":
      Router.replace("Catalog");
      return null;
    case "Catalog":
      return <CatalogPage />;
    case "SongNew":
      return <EditSongPage />;
    case "SongEdit":
      // Keyed: the editor keeps the song's id in state, another song needs a fresh one
      return <EditSongPage key={route.params.songId} songId={route.params.songId} />;
    case "Setlists":
      return <SetlistPage />;
    case "SetlistEdit":
      return <SetlistPage key={route.params.setlistId} setlistId={route.params.setlistId} />;
    case "TechSheet":
      return <TechSheetPage setlistId={route.params.setlistId} />;
    case "Chords":
      return <ChordsPage />;
    case "Tuner":
      return <TunerPage />;
    case "Sync":
      return <SyncPage />;
    case "Settings":
      return <SettingsPage companion={route.params.companion} />;
    case "SettingsSection":
      return <SettingsPage section={route.params.section} />;
    case "Quality":
      return <QualityPage />;
  }
}
