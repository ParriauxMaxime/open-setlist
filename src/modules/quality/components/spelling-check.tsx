import { useDb } from "@db/provider";
import type { Song } from "@db/song";
import { findSpellingIssues, type SpellingIssue, unifySpelling } from "@domain/catalog-checks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardRow } from "../../design-system/components/card";
import { useConfirmedRewrite } from "../hooks/use-confirmed-rewrite";
import { CheckLine } from "./check-line";

/** Artists and tags written several ways, each with a one-tap fix to the most common spelling. */
export function SpellingCheck({ songs }: { songs: Song[] }) {
  const { t } = useTranslation();
  const db = useDb();
  const issues = useMemo(() => findSpellingIssues(songs), [songs]);
  const titles = useMemo(() => new Map(songs.map((s) => [s.id, s.title])), [songs]);
  const rewrite = useConfirmedRewrite();

  const unify = (issue: SpellingIssue) => {
    const updatedAt = Date.now();
    return db.transaction("rw", db.songs, async () => {
      let updated = 0;
      for (const song of songs) {
        const changes = unifySpelling(song, issue);
        if (!changes) continue;
        await db.songs.update(song.id, { ...changes, updatedAt });
        updated++;
      }
      return updated;
    });
  };

  return (
    <Card
      title={t("quality.spelling.title")}
      aside={
        <span className="text-xs text-text-faint">
          {t("quality.spelling.count", { count: issues.length })}
        </span>
      }
    >
      {rewrite.doneLine}
      {issues.length === 0 && <CheckLine passed label={t("quality.spelling.none")} />}
      {issues.map((issue) => (
        <CardRow
          key={`${issue.field}:${issue.preferred}`}
          label={
            <>
              <span className="text-text-muted">{t(`quality.spelling.field.${issue.field}`)}</span>{" "}
              {issue.spellings.map((s) => `${s.spelling} ×${s.count}`).join(" / ")}
            </>
          }
          description={issue.songIds.map((id) => titles.get(id) ?? id).join(", ")}
        >
          <button
            type="button"
            onClick={() => rewrite.ask(issue.songIds.length, () => unify(issue))}
            className="btn btn-outline btn-sm"
          >
            {t("quality.spelling.unify", { spelling: issue.preferred })}
          </button>
        </CardRow>
      ))}
      {rewrite.modal}
    </Card>
  );
}
