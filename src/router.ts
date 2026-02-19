import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    Home: "/",
    Catalog: "/catalog",
    SongNew: "/song/new",
    SongEdit: "/song/:songId",
    Setlists: "/setlists",
    SetlistEdit: "/setlist/:setlistId",
    Perform: "/perform/:setlistId",
    PerformSong: "/perform-song/:songId",
    Chords: "/chords",
    Sync: "/sync",
    Settings: "/settings",
  },
  { basePath },
);
