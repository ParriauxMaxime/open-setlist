import type { SetlistSet } from "@db";
import { useDb } from "@db/provider";
import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useActiveProfileId } from "@domain/profiles";
import { type SetlistFormValues, setlistFormSchema } from "@domain/schemas/setlist";
import { addTombstone } from "@domain/sync/tombstones";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
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
      });
    }
  }, [existing, reset]);

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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("setlist.editSetlist")}</h1>
        <Link to={Router.Setlists()} className="link">
          {t("setlist.backToSetlists")}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Metadata */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("setlist.nameLabel")} error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>
          <Field label={t("setlist.dateLabel")} error={errors.date?.message}>
            <Input type="date" {...register("date")} />
          </Field>
          <Field label={t("setlist.venueLabel")} error={errors.venue?.message}>
            <Input {...register("venue")} placeholder={t("setlist.venuePlaceholder")} />
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
                  ({t("setlist.songCount", { count: totalSongs })})
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

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? t("common.saving") : t("common.save")}
          </button>

          {totalSongs > 0 && (
            <Link to={Router.Perform({ setlistId })} className="btn btn-outline">
              {t("setlist.perform")}
            </Link>
          )}

          {confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-danger">{t("setlist.deleteSetlistConfirm")}</span>
              <button
                type="button"
                onClick={deleteSetlist}
                className="btn-danger font-medium hover:underline"
              >
                {t("common.yes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="link hover:underline"
              >
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn-danger text-sm"
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
