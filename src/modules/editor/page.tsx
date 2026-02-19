import { useDb } from "@db/provider";
import { MAJOR_KEYS, MINOR_KEYS } from "@domain/music";
import {
  getSongOverrides,
  loadPreferences,
  removeSongOverrides,
  type SongDisplayPrefs,
  setSongOverrides,
} from "@domain/preferences";
import { useActiveProfileId } from "@domain/profiles";
import { type SongFormValues, songFormSchema } from "@domain/schemas/song";
import { addTombstone } from "@domain/sync/tombstones";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { Field, Input, Select, Textarea } from "../design-system/components/form";
import { fetchChords } from "../lookup";
import { SongLookupModal } from "./components/song-lookup-modal";

interface EditSongPageProps {
  songId?: string;
}

const defaultValues: SongFormValues = {
  title: "",
  artist: "",
  key: undefined,
  bpm: undefined,
  duration: undefined,
  tags: [],
  notes: "",
  links: undefined,
  content: "",
};

type EnrichmentStatus = "idle" | "enriching" | "done";

export function EditSongPage({ songId }: EditSongPageProps) {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const existing = useLiveQuery(() => (songId ? db.songs.get(songId) : undefined), [songId, db]);
  const [songDbId] = useState(() => songId ?? crypto.randomUUID());
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<EnrichmentStatus>("idle");
  const [enrichDetail, setEnrichDetail] = useState("");
  const enrichAbortRef = useRef<AbortController | null>(null);
  const isNew = !songId;

  // Per-song display overrides
  const [overrides, setOverrides] = useState<Partial<SongDisplayPrefs>>(() =>
    songId ? getSongOverrides(songId) : {},
  );
  const hasOverrides = Object.keys(overrides).length > 0;
  const [overridesOpen, setOverridesOpen] = useState(hasOverrides);
  const globalPrefs = useRef(loadPreferences()).current;

  const updateOverride = useCallback(
    (patch: Partial<SongDisplayPrefs>) => {
      if (!songId) return;
      setSongOverrides(songId, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
    },
    [songId],
  );

  const clearOverrideKey = useCallback(
    (key: keyof SongDisplayPrefs) => {
      if (!songId) return;
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        // Save the full cleaned map
        if (Object.keys(next).length === 0) {
          removeSongOverrides(songId);
        } else {
          // Rebuild from scratch to avoid stale merged keys
          removeSongOverrides(songId);
          setSongOverrides(songId, next);
        }
        return next;
      });
    },
    [songId],
  );

  const clearAllOverrides = useCallback(() => {
    if (!songId) return;
    removeSongOverrides(songId);
    setOverrides({});
    setOverridesOpen(false);
  }, [songId]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SongFormValues>({
    resolver: zodResolver(songFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        artist: existing.artist ?? "",
        key: existing.key || undefined,
        bpm: existing.bpm,
        duration: existing.duration,
        tags: existing.tags,
        notes: existing.notes ?? "",
        links: existing.links,
        content: existing.content,
      });
    }
  }, [existing, reset]);

  // Cancel enrichment on unmount
  useEffect(() => {
    return () => enrichAbortRef.current?.abort();
  }, []);

  const tags = watch("tags");

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setValue("tags", [...tags, tag]);
    }
    setTagInput("");
  }, [tagInput, tags, setValue]);

  const removeTag = useCallback(
    (tag: string) => {
      setValue(
        "tags",
        tags.filter((t) => t !== tag),
      );
    },
    [tags, setValue],
  );

  const onSubmit = async (values: SongFormValues) => {
    const now = Date.now();
    // Clean empty link strings
    const links = values.links
      ? Object.fromEntries(Object.entries(values.links).filter(([, v]) => v))
      : undefined;
    const toSave = {
      ...values,
      artist: values.artist || undefined,
      key: values.key || undefined,
      notes: values.notes || undefined,
      links: links && Object.keys(links).length > 0 ? links : undefined,
      id: songDbId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.songs.put(toSave);
    if (isNew) {
      Router.replace("SongEdit", { songId: toSave.id });
    }
  };

  const deleteSong = useCallback(async () => {
    if (!songId) return;
    addTombstone(profileId, "song", songId);
    removeSongOverrides(songId);
    await db.songs.delete(songId);
    Router.replace("Catalog");
  }, [songId, profileId, db]);

  const enrichSong = useCallback(
    (title: string, artist: string) => {
      enrichAbortRef.current?.abort();
      const controller = new AbortController();
      enrichAbortRef.current = controller;

      setEnrichStatus("enriching");
      setEnrichDetail(t("editor.fetchingChords"));

      fetchChords(title, artist).then((chords) => {
        if (controller.signal.aborted) return;
        if (chords) setValue("content", chords);
        setEnrichStatus("done");
        setEnrichDetail("");
        setTimeout(() => setEnrichStatus((s) => (s === "done" ? "idle" : s)), 2000);
      });
    },
    [setValue, t],
  );

  const onLookupSelect = useCallback(
    (values: Partial<SongFormValues>) => {
      reset({ ...defaultValues, ...values });
      setShowLookup(false);

      // Kick off background enrichment
      if (values.title && values.artist) {
        enrichSong(values.title, values.artist);
      }
    },
    [reset, enrichSong],
  );

  // Wait for existing song to load before rendering the form
  if (!isNew && !existing) {
    return (
      <div className="p-page">
        <p className="text-text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{isNew ? t("editor.newSong") : t("editor.editSong")}</h1>
        <div className="flex items-center gap-3">
          {isNew && (
            <button
              type="button"
              onClick={() => setShowLookup(true)}
              className="btn btn-outline btn-sm"
            >
              {t("editor.findOnline")}
            </button>
          )}
          {!isNew && (
            <Link to={Router.PerformSong({ songId: songDbId })} className="btn btn-outline btn-sm">
              {t("editor.preview")}
            </Link>
          )}
          <Link to={Router.Catalog()} className="link">
            {t("editor.backToCatalog")}
          </Link>
        </div>
      </div>

      {/* Enrichment indicator */}
      <div aria-live="polite">
        {enrichStatus === "enriching" && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-bg-surface px-3 py-2 text-sm text-text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {enrichDetail || t("editor.enriching")}
          </div>
        )}
        {enrichStatus === "done" && (
          <div className="mb-3 rounded-md bg-bg-surface px-3 py-2 text-sm text-success">
            {t("editor.done")}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Title */}
        <Field label={t("editor.titleLabel")} error={errors.title?.message}>
          <Input {...register("title")} placeholder={t("editor.titlePlaceholder")} />
        </Field>

        {/* Artist */}
        <Field label={t("editor.artistLabel")} error={errors.artist?.message}>
          <Input {...register("artist")} placeholder={t("editor.artistPlaceholder")} />
        </Field>

        {/* Key / BPM / Duration row */}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("editor.keyLabel")} error={errors.key?.message}>
            <Select {...register("key")}>
              <option value="">—</option>
              <optgroup label={t("editor.majorGroup")}>
                {MAJOR_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("editor.minorGroup")}>
                {MINOR_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>

          <Field label={t("editor.bpmLabel")} error={errors.bpm?.message}>
            <Input
              type="number"
              {...register("bpm", {
                setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
              })}
              placeholder="120"
            />
          </Field>

          <Field label={t("editor.durationLabel")} error={errors.duration?.message}>
            <Input
              type="number"
              {...register("duration", {
                setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
              })}
              placeholder="240"
            />
          </Field>
        </div>

        {/* Tags */}
        <Field label={t("editor.tagsLabel")}>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-sm bg-bg-raised px-2 py-0.5 text-sm text-text-muted"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="ml-0.5 text-text-faint hover:text-danger"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder={t("editor.addTagPlaceholder")}
              className="flex-1"
            />
            <button type="button" onClick={addTag} className="btn btn-ghost">
              {t("common.add")}
            </button>
          </div>
        </Field>

        {/* Notes */}
        <Field label={t("editor.notesLabel")} error={errors.notes?.message}>
          <Textarea
            {...register("notes")}
            placeholder={t("editor.notesPlaceholder")}
            rows={2}
            className="resize-y"
          />
        </Field>

        {/* Links */}
        <details className="group rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text-muted select-none">
            {t("editor.linksLabel")}
          </summary>
          <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
            <Field label="YouTube">
              <Input {...register("links.youtube")} placeholder="https://youtube.com/watch?v=..." />
            </Field>
            <Field label="Spotify">
              <Input
                {...register("links.spotify")}
                placeholder="https://open.spotify.com/track/..."
              />
            </Field>
            <Field label="Deezer">
              <Input {...register("links.deezer")} placeholder="https://deezer.com/track/..." />
            </Field>
          </div>
        </details>

        {/* ChordPro content */}
        <Field label={t("editor.chordproLabel")} error={errors.content?.message}>
          <Textarea
            {...register("content")}
            placeholder={`{start_of_verse}\n[Am]Down the empty road again\n[C]Headlights cutting through\n{end_of_verse}`}
            rows={12}
            className="resize-y font-mono text-sm"
          />
        </Field>

        {/* Display Overrides (existing songs only) */}
        {!isNew && (
          <fieldset className="rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-text-muted">
              {t("editor.displayOverrides")}
            </legend>

            <label className="mb-2 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={overridesOpen}
                onChange={(e) => {
                  if (!e.target.checked) clearAllOverrides();
                  else setOverridesOpen(true);
                }}
                className="h-4 w-4 rounded accent-[var(--color-accent)]"
              />
              <span className="text-sm text-text">{t("editor.enableDisplayOverrides")}</span>
            </label>

            <p className="mb-3 text-xs text-text-faint">{t("editor.displayOverridesDesc")}</p>

            {overridesOpen && (
              <div className="flex flex-col gap-4">
                <OverrideSizeField
                  label={t("settings.display.scale")}
                  field="globalScale"
                  min={0.5}
                  max={3}
                  step={0.1}
                  suffix="x"
                  globalValue={globalPrefs.globalScale}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideSizeField
                  label={t("settings.sizes.lyrics")}
                  field="lyricsSize"
                  min={0.5}
                  max={4}
                  step={0.125}
                  suffix="rem"
                  globalValue={globalPrefs.lyricsSize}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideSizeField
                  label={t("settings.sizes.chords")}
                  field="chordSize"
                  min={0.5}
                  max={4}
                  step={0.125}
                  suffix="rem"
                  globalValue={globalPrefs.chordSize}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideSizeField
                  label={t("settings.sizes.sectionLabels")}
                  field="sectionSize"
                  min={0.5}
                  max={4}
                  step={0.125}
                  suffix="rem"
                  globalValue={globalPrefs.sectionSize}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideColorField
                  label={t("settings.colors.chords")}
                  field="chordColor"
                  globalValue={globalPrefs.chordColor}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideColorField
                  label={t("settings.colors.verse")}
                  field="verseColor"
                  globalValue={globalPrefs.verseColor}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideColorField
                  label={t("settings.colors.chorus")}
                  field="chorusColor"
                  globalValue={globalPrefs.chorusColor}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
                <OverrideColorField
                  label={t("settings.colors.bridge")}
                  field="bridgeColor"
                  globalValue={globalPrefs.bridgeColor}
                  overrides={overrides}
                  onUpdate={updateOverride}
                  onClear={clearOverrideKey}
                />
              </div>
            )}
          </fieldset>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? t("common.saving") : t("common.save")}
          </button>

          {!isNew &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-danger">{t("editor.deleteSongConfirm")}</span>
                <button
                  type="button"
                  onClick={deleteSong}
                  className="btn-danger font-medium hover:underline"
                >
                  {t("editor.yesDelete")}
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
            ))}
        </div>
      </form>

      {showLookup && (
        <SongLookupModal onSelect={onLookupSelect} onClose={() => setShowLookup(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override field components
// ---------------------------------------------------------------------------

type SizeKey = "globalScale" | "lyricsSize" | "chordSize" | "sectionSize";

function OverrideSizeField({
  label,
  field,
  min,
  max,
  step,
  suffix,
  globalValue,
  overrides,
  onUpdate,
  onClear,
}: {
  label: string;
  field: SizeKey;
  min: number;
  max: number;
  step: number;
  suffix: string;
  globalValue: number;
  overrides: Partial<SongDisplayPrefs>;
  onUpdate: (patch: Partial<SongDisplayPrefs>) => void;
  onClear: (key: keyof SongDisplayPrefs) => void;
}) {
  const active = overrides[field] !== undefined;
  const value = overrides[field] ?? globalValue;

  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onUpdate({ [field]: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="w-16 text-right text-sm text-text-muted">
        {value}
        {suffix}
      </span>
      {active && (
        <button
          type="button"
          onClick={() => onClear(field)}
          className="text-xs text-text-faint hover:text-danger"
          title="Reset to global"
        >
          ✕
        </button>
      )}
    </label>
  );
}

type ColorKey = "chordColor" | "verseColor" | "chorusColor" | "bridgeColor";

function OverrideColorField({
  label,
  field,
  globalValue,
  overrides,
  onUpdate,
  onClear,
}: {
  label: string;
  field: ColorKey;
  globalValue: string;
  overrides: Partial<SongDisplayPrefs>;
  onUpdate: (patch: Partial<SongDisplayPrefs>) => void;
  onClear: (key: keyof SongDisplayPrefs) => void;
}) {
  const active = overrides[field] !== undefined;
  const value = overrides[field] ?? globalValue;

  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onUpdate({ [field]: e.target.value })}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onUpdate({ [field]: v });
        }}
        className="field w-24"
        maxLength={7}
      />
      {active && (
        <button
          type="button"
          onClick={() => onClear(field)}
          className="text-xs text-text-faint hover:text-danger"
          title="Reset to global"
        >
          ✕
        </button>
      )}
    </label>
  );
}
