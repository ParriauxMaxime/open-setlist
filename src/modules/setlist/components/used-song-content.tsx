import type { Song } from "@db";
import { useTranslation } from "react-i18next";
import { Badge } from "../../design-system/components/card";
import { SongRowContent } from "./song-row-content";

/** A song already in the setlist: dimmed, with the set it is in. */
export function UsedSongContent({ song, setName }: { song: Song; setName: string }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex min-w-0 flex-1 opacity-50">
        <SongRowContent song={song} statusIndicator="dot" />
      </div>
      <span className="shrink-0">
        <Badge tone="muted">{t("setlist.inSet", { name: setName })}</Badge>
      </span>
    </>
  );
}
