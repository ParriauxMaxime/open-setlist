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
    TechSheet: "/tech/:setlistId",
    Perform: "/perform/:setlistId",
    PerformSong: "/perform-song/:songId",
    Print: "/print/:setlistId?:mode{sheet|booklet}&:part",
    Chords: "/chords",
    Tuner: "/tuner",
    Sync: "/sync",
    Settings: "/settings",
    Quality: "/quality",
  },
  { basePath },
);
