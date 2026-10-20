import { useDb } from "@db/provider";
import type { Song } from "@db/song";
import { cleanupChart, needsCleanup } from "@domain/chordpro/cleanup";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardRow } from "../../design-system/components/card";
import { useConfirmedRewrite } from "../hooks/use-confirmed-rewrite";
import { CheckLine } from "./check-line";

const LISTED_TITLES = 8;

/** Charts still carrying Setlist Helper's appended directives or CSV trailing spaces. */
export function LeftoversCheck({ songs }: { songs: Song[] }) {
  const { t } = useTranslation();
  const db = useDb();
  const affected = useMemo(() => songs.filter(needsCleanup), [songs]);
  const rewrite = useConfirmedRewrite();

  const cleanAll = () => {
    const updatedAt = Date.now();
    return db.transaction("rw", db.songs, async () => {
      for (const song of affected) {
        await db.songs.update(song.id, { content: cleanupChart(song), updatedAt });
      }
      return affected.length;
    });
  };

  const titles = affected.slice(0, LISTED_TITLES).map((s) => s.title);
  const more = affected.length - titles.length;

  return (
    <Card title={t("quality.leftovers.title")} description={t("quality.leftovers.description")}>
      {rewrite.doneLine}
      {affected.length === 0 ? (
        <CheckLine passed label={t("quality.leftovers.none")} />
      ) : (
        <CardRow
          label={t("quality.leftovers.count", { count: affected.length })}
          description={[
            titles.join(", "),
            more > 0 ? t("quality.leftovers.more", { count: more }) : "",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => rewrite.ask(affected.length, cleanAll)}
            className="btn btn-outline btn-sm"
          >
            {t("quality.leftovers.cleanAll")}
          </button>
        </CardRow>
      )}
      {rewrite.modal}
    </Card>
  );
}
