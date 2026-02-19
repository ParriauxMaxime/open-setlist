import { CatalogPage } from "./modules/catalog/page";
import { ChordsPage } from "./modules/chords/page";
import { EditSongPage } from "./modules/editor/page";
import { PerformPage } from "./modules/performance/page";
import { SetlistPage } from "./modules/setlist/page";
import { SettingsPage } from "./modules/settings/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { SyncPage } from "./modules/sync/page";
import { Router } from "./router";

export function App() {
  const route = Router.useRoute([
    "Home",
    "Catalog",
    "SongNew",
    "SongEdit",
    "Setlists",
    "SetlistEdit",
    "Perform",
    "PerformSong",
    "Chords",
    "Sync",
    "Settings",
  ]);

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

  // Admin routes — wrapped in layout
  return (
    <AdminLayout>
      <AdminRoutes route={route} />
    </AdminLayout>
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
        | "Chords"
        | "Sync"
        | "Settings"
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
      return <EditSongPage songId={route.params.songId} />;
    case "Setlists":
      return <SetlistPage />;
    case "SetlistEdit":
      return <SetlistPage setlistId={route.params.setlistId} />;
    case "Chords":
      return <ChordsPage />;
    case "Sync":
      return <SyncPage />;
    case "Settings":
      return <SettingsPage />;
  }
}
