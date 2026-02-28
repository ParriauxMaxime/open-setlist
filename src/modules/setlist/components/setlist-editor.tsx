import type { SetlistSet } from "@db";
import { useDb } from "@db/provider";
import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { formatDuration } from "@domain/format";
import { useActiveProfileId } from "@domain/profiles";
import { type SetlistFormValues, setlistFormSchema } from "@domain/schemas/setlist";
import { addTombstone } from "@domain/sync/tombstones";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmModal } from "../../design-system/components/confirm-modal";
import { EditorHeader } from "../../design-system/components/editor-header";
import { Field, Input } from "../../design-system/components/form";
import { buildSetDragId, buildSongDragIds, useSetlistDnd } from "../hooks/use-setlist-dnd";
import { DragOverlayContent } from "./drag-overlay-content";
import { SongCatalogPanel } from "./song-catalog-panel";
import { SortableSet } from "./sortable-set";

interface SetlistEditorProps {
  setlistId: string;
}

const defaultValues: SetlistFormValues = {
  name: "",
  date: undefined,
  venue: undefined,
  sets: [{ name: "Set 1", songIds: [] }],
  notes: undefined,
};

export function SetlistEditor({ setlistId }: SetlistEditorProps) {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const existing = useLiveQuery(() => db.setlists.get(setlistId), [setlistId, db]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
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
      });
    }
  }, [existing, reset]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const updateSet = useCallback(
    (index: number, updated: SetlistSet) => {
      updateField(index, updated);
    },
    [updateField],
  );

  const addSet = useCallback(() => {
    append({ name: `Set ${fields.length + 1}`, songIds: [] });
  }, [append, fields.length]);

  const onSubmit = async (values: SetlistFormValues) => {
    const now = Date.now();
    await db.setlists.put({
      ...values,
      date: values.date || undefined,
      venue: values.venue || undefined,
      notes: values.notes || undefined,
      expectedDuration: values.expectedDuration || undefined,
      id: setlistId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  };

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

  // All song IDs currently in any set (for catalog panel filtering)
  const usedSongIds = useMemo(() => sets.flatMap((s) => s.songIds), [sets]);

  // Load songs to compute total duration
  const uniqueSongIds = useMemo(() => [...new Set(usedSongIds)], [usedSongIds]);
  const songs = useLiveQuery(
    () => (uniqueSongIds.length > 0 ? db.songs.bulkGet(uniqueSongIds) : []),
    [uniqueSongIds, db],
  );

  const { totalDuration, unknownCount } = useMemo(() => {
    if (!songs) return { totalDuration: 0, unknownCount: 0 };
    const defined = songs.filter((s): s is NonNullable<typeof s> => s != null);
    const songMap = new Map(defined.map((s) => [s.id, s]));
    let total = 0;
    let unknown = 0;
    for (const id of usedSongIds) {
      const song = songMap.get(id);
      if (song?.duration) {
        total += song.duration;
      } else {
        unknown++;
      }
    }
    return { totalDuration: total, unknownCount: unknown };
  }, [songs, usedSongIds]);

  const expectedDuration = watch("expectedDuration");

  // DnD hook
  const { sensors, onDragStart, onDragOver, onDragEnd, activeDrag } = useSetlistDnd({
    sets,
    updateSet,
    moveSet: move,
  });

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
              className="btn btn-primary btn-responsive"
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </button>
            {totalSongs > 0 && (
              <Link to={Router.TechSheet({ setlistId })} className="btn btn-outline btn-responsive">
                {t("setlist.perform")}
              </Link>
            )}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="btn btn-ghost btn-responsive"
                aria-label="More options"
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                &#8942;
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-md border border-border bg-bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    disabled={!isDirty}
                    onClick={() => {
                      reset();
                      setMenuOpen(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-text hover:bg-bg-hover disabled:opacity-50"
                  >
                    {t("setlist.resetChanges")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(true);
                      setMenuOpen(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-bg-hover"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      <form id="setlist-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Metadata */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={t("setlist.nameLabel")} error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>
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
            <SongCatalogPanel usedSongIds={usedSongIds} />

            {/* Sets area */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <h2 className="text-lg font-semibold">
                {t("setlist.setsHeading")}{" "}
                <span className="text-sm font-normal text-text-faint">
                  {t("setlist.songCount", { count: totalSongs })}
                  {totalDuration > 0 && <> &middot; {formatDuration(totalDuration)}</>}
                  {unknownCount > 0 && (
                    <> ({t("setlist.unknownDuration", { count: unknownCount })})</>
                  )}
                  {expectedDuration && <> / {formatDuration(expectedDuration)}</>}
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
                    songDragIds={songDragIdsBySet[i]}
                    onUpdate={(updated) => updateSet(i, updated)}
                    onRemove={() => remove(i)}
                    canRemove={fields.length > 1}
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
          message={t("setlist.deleteConfirmMessage")}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={deleteSetlist}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
