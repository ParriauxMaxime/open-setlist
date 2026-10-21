import type { SetlistSet } from "@db";
import { useDb } from "@db/provider";
import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { formatLongDuration } from "@domain/format";
import { useActiveProfileId } from "@domain/profiles";
import { type SetlistFormValues, setlistFormSchema } from "@domain/schemas/setlist";
import { setlistDuration } from "@domain/setlist-duration";
import { countNotReadySongs } from "@domain/song-status";
import { addTombstone } from "@domain/sync/tombstones";
import { setTechNoteOverride } from "@domain/tech-notes";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmModal } from "../../design-system/components/confirm-modal";
import { EditorHeader } from "../../design-system/components/editor-header";
import { Field, Input } from "../../design-system/components/form";
import { ToolbarMenu } from "../../design-system/components/toolbar-menu";
import { useUnsavedGuard } from "../../shared/hooks/use-unsaved-guard";
import { useDuplicateSetlist } from "../hooks/use-duplicate-setlist";
import { buildSetDragId, buildSongDragIds, useSetlistDnd } from "../hooks/use-setlist-dnd";
import { DragOverlayContent } from "./drag-overlay-content";
import type { RemovedSong } from "./set-editor";
import { SongCatalogPanel } from "./song-catalog-panel";
import { SortableSet } from "./sortable-set";

interface SetlistEditorProps {
  setlistId: string;
}

const UNDO_MS = 6000;

const defaultValues: SetlistFormValues = {
  name: "",
  date: undefined,
  venue: undefined,
  sets: [{ name: "Set 1", songIds: [] }],
  notes: undefined,
  techNotes: undefined,
};

export function SetlistEditor({ setlistId }: SetlistEditorProps) {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const existing = useLiveQuery(
    async () => (await db.setlists.get(setlistId)) ?? null,
    [setlistId, db],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting, isDirty },
    control,
  } = useForm<SetlistFormValues>({
    resolver: zodResolver(setlistFormSchema),
    defaultValues,
  });

  const {
    fields,
    append,
    remove,
    update: updateField,
    move,
  } = useFieldArray({
    control,
    name: "sets",
  });

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        date: existing.date,
        venue: existing.venue,
        sets: existing.sets.map((s) => ({ ...s })),
        notes: existing.notes,
        expectedDuration: existing.expectedDuration,
        techNotes: existing.techNotes && { ...existing.techNotes },
      });
    }
  }, [existing, reset]);

  const updateSet = useCallback(
    (index: number, updated: SetlistSet) => {
      updateField(index, updated);
    },
    [updateField],
  );

  // Kept here: a set's editor remounts on every change to the set
  const [removed, setRemoved] = useState<(RemovedSong & { setIndex: number }) | null>(null);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const undoRemove = () => {
    if (!removed) return;
    const set = getValues(`sets.${removed.setIndex}`);
    if (!set) return;
    const songIds = [...set.songIds];
    songIds.splice(Math.min(removed.index, songIds.length), 0, removed.songId);
    updateSet(removed.setIndex, { ...set, songIds });
    setRemoved(null);
  };

  const addSet = useCallback(() => {
    append({ name: `${t("setlist.set")} ${fields.length + 1}`, songIds: [] });
  }, [append, fields.length, t]);

  const onSubmit = async (values: SetlistFormValues) => {
    const now = Date.now();
    await db.setlists.put({
      ...values,
      date: values.date || undefined,
      venue: values.venue || undefined,
      notes: values.notes || undefined,
      expectedDuration: values.expectedDuration || undefined,
      techNotes: values.techNotes,
      id: setlistId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  };

  const unsavedModal = useUnsavedGuard(isDirty, () => {
    if (!isSubmitting) handleSubmit(onSubmit)();
  });

  const duplicateSetlist = useDuplicateSetlist();

  const deleteSetlist = useCallback(async () => {
    addTombstone(profileId, "setlist", setlistId);
    await db.setlists.delete(setlistId);
    Router.replace("Setlists");
  }, [setlistId, profileId, db]);

  const sets = watch("sets");
  const totalSongs = sets.reduce((n, s) => n + s.songIds.length, 0);

  // Build drag IDs for sets and songs
  const setDragIds = useMemo(() => fields.map((_, i) => buildSetDragId(i)), [fields]);

  const songDragIdsBySet = useMemo(
    () => sets.map((set, setIdx) => buildSongDragIds(setIdx, set.songIds)),
    [sets],
  );

  // All song IDs currently in any set, a song played twice listed twice
  const usedSongIds = useMemo(() => sets.flatMap((s) => s.songIds), [sets]);

  // Load songs to compute total duration
  const uniqueSongIds = useMemo(() => [...new Set(usedSongIds)], [usedSongIds]);
  const songs = useLiveQuery(
    () => (uniqueSongIds.length > 0 ? db.songs.bulkGet(uniqueSongIds) : []),
    [uniqueSongIds, db],
  );

  const { total: totalDuration, unknownCount } = useMemo(
    () => (songs ? setlistDuration(usedSongIds, songs) : { total: 0, unknownCount: 0 }),
    [songs, usedSongIds],
  );

  const notReadyCount = useMemo(() => countNotReadySongs(sets, songs ?? []), [sets, songs]);

  const expectedDuration = watch("expectedDuration");
  const techNotes = watch("techNotes");
  const setTechNote = useCallback(
    (songId: string, text: string) =>
      setValue(
        "techNotes",
        setTechNoteOverride({ techNotes: getValues("techNotes") }, songId, text),
        { shouldDirty: true },
      ),
    [getValues, setValue],
  );

  // DnD hook
  const { sensors, onDragStart, onDragOver, onDragEnd, activeDrag } = useSetlistDnd({
    sets,
    updateSet,
    moveSet: move,
  });

  if (existing === null) {
    return (
      <div className="flex flex-col items-center gap-4 p-page">
        <p className="text-text-muted">{t("setlist.notFound")}</p>
        <Link to={Router.Setlists()} className="link-accent">
          {t("setlist.backToSetlists")}
        </Link>
      </div>
    );
  }

  if (!existing) {
    return (
      <div className="p-page">
        <p className="text-text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-page">
      <EditorHeader
        breadcrumbs={[
          { label: t("nav.setlists"), to: Router.Setlists() },
          { label: watch("name") || "..." },
        ]}
        actions={
          <>
            <button
              type="submit"
              form="setlist-form"
              disabled={isSubmitting || !isDirty}
              className={`btn btn-responsive ${isDirty ? "btn-primary" : "btn-outline"}`}
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </button>
            {totalSongs > 0 && (
              <Link
                to={Router.TechSheet({ setlistId })}
                className={`btn btn-responsive ${isDirty ? "btn-outline" : "btn-primary"}`}
              >
                {t("setlist.perform")}
              </Link>
            )}
            {totalSongs > 0 && (
              <Link to={Router.Print({ setlistId })} className="btn btn-ghost btn-responsive">
                {t("print.print")}
              </Link>
            )}
          </>
        }
        menu={
          <ToolbarMenu
            label={t("a11y.moreOptions")}
            items={[
              { label: t("setlist.resetChanges"), onClick: () => reset(), disabled: !isDirty },
              {
                label: t("setlist.duplicate"),
                onClick: () => duplicateSetlist(existing),
                disabled: isDirty,
                title: isDirty ? t("setlist.duplicateSaveFirst") : undefined,
              },
              {
                label: t("setlist.deleteTitle"),
                onClick: () => setConfirmDelete(true),
                danger: true,
              },
            ]}
          />
        }
      />

      <form id="setlist-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-bg-surface p-4 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Field label={t("setlist.nameLabel")} error={errors.name?.message}>
              <Input {...register("name")} />
            </Field>
          </div>
          <Field label={t("setlist.dateLabel")} error={errors.date?.message}>
            <Input type="date" {...register("date")} />
          </Field>
          <Field label={t("setlist.venueLabel")} error={errors.venue?.message}>
            <Input {...register("venue")} placeholder={t("setlist.venuePlaceholder")} />
          </Field>
          <Field label={t("setlist.expectedDuration")} error={errors.expectedDuration?.message}>
            <Input
              type="number"
              min={1}
              {...register("expectedDuration", {
                setValueAs: (v: string) => {
                  const n = Number.parseInt(v, 10);
                  return Number.isNaN(n) ? undefined : n * 60;
                },
              })}
              value={expectedDuration ? Math.round(expectedDuration / 60) : ""}
            />
          </Field>
        </div>

        {/* Sets with DnD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4">
            {/* Desktop catalog panel */}
            <SongCatalogPanel sets={sets} />

            {/* Sets area */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <h2 className="text-sm font-semibold">
                {t("setlist.setsHeading")}{" "}
                <span className="text-xs font-normal text-text-faint">
                  {t("setlist.songCount", { count: totalSongs })}
                  {totalDuration > 0 && <> &middot; {formatLongDuration(totalDuration)}</>}
                  {unknownCount > 0 && (
                    <> ({t("setlist.unknownDuration", { count: unknownCount })})</>
                  )}
                  {expectedDuration && <> / {formatLongDuration(expectedDuration)}</>}
                  {notReadyCount > 0 && (
                    <>
                      {" "}
                      &middot;{" "}
                      <span className="text-warning">
                        ⚠ {t("songStatus.notReadyCount", { count: notReadyCount })}
                      </span>
                    </>
                  )}
                </span>
              </h2>

              <SortableContext items={setDragIds} strategy={verticalListSortingStrategy}>
                {fields.map((field, i) => (
                  <SortableSet
                    key={field.id}
                    id={setDragIds[i]}
                    setName={sets[i].name}
                    set={sets[i]}
                    setIndex={i}
                    allSets={sets}
                    songDragIds={songDragIdsBySet[i]}
                    onUpdate={(updated) => updateSet(i, updated)}
                    onRemove={() => {
                      remove(i);
                      setRemoved(null);
                    }}
                    canRemove={fields.length > 1}
                    removed={removed?.setIndex === i ? removed : undefined}
                    onSongRemoved={(song) => setRemoved({ ...song, setIndex: i })}
                    onUndoRemove={undoRemove}
                    techNotes={techNotes}
                    onTechNote={setTechNote}
                  />
                ))}
              </SortableContext>

              <button type="button" onClick={addSet} className="link-accent self-start text-sm">
                {t("setlist.addSet")}
              </button>
            </div>
          </div>

          <DragOverlay>
            {activeDrag ? <DragOverlayContent activeDrag={activeDrag} /> : null}
          </DragOverlay>
        </DndContext>
      </form>

      {confirmDelete && (
        <ConfirmModal
          title={t("setlist.deleteConfirmTitle")}
          message={`${t("setlist.deleteDesc")} ${t("setlist.deleteConfirmMessage")}`}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={deleteSetlist}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {unsavedModal}
    </div>
  );
}
