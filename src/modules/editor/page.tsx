import { useDb } from "@db/provider";
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
import { ConfirmModal } from "../design-system/components/confirm-modal";
import { EditorHeader } from "../design-system/components/editor-header";
import { fetchChords } from "../lookup";
import { ChordProEditor } from "./components/chordpro-editor";
import { ChordProHelp } from "./components/chordpro-help";
import { MetadataPanel } from "./components/metadata-panel";
import { SongLookupModal } from "./components/song-lookup-modal";
import { useChordProSync } from "./hooks/use-chordpro-sync";

interface EditSongPageProps {
  songId?: string;
}

const defaultValues: SongFormValues = {
  title: "",
  artist: "",
  key: undefined,
  bpm: undefined,
  duration: undefined,
  transposition: undefined,
  tags: [],
  notes: "",
  techNotes: "",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLookup, setShowLookup] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<EnrichmentStatus>("idle");
  const [enrichDetail, setEnrichDetail] = useState("");
  const enrichAbortRef = useRef<AbortController | null>(null);
  const isNew = !songId;

  // Panel collapse state
  const [panelOpen, setPanelOpen] = useState(true);

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
        if (Object.keys(next).length === 0) {
          removeSongOverrides(songId);
        } else {
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
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SongFormValues>({
    resolver: zodResolver(songFormSchema),
    defaultValues,
  });

  // Bidirectional sync between ChordPro content and metadata fields
  useChordProSync({ watch, setValue, getValues });

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        artist: existing.artist ?? "",
        key: existing.key || undefined,
        bpm: existing.bpm,
        duration: existing.duration,
        transposition: existing.transposition,
        tags: existing.tags,
        notes: existing.notes ?? "",
        techNotes: existing.techNotes ?? "",
        links: existing.links,
        content: existing.content,
      });
    }
  }, [existing, reset]);

  // Cancel enrichment on unmount
  useEffect(() => {
    return () => enrichAbortRef.current?.abort();
  }, []);

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

  const tags = watch("tags");

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setValue("tags", [...tags, tag], { shouldDirty: true });
    }
    setTagInput("");
  }, [tagInput, tags, setValue]);

  const removeTag = useCallback(
    (tag: string) => {
      setValue(
        "tags",
        tags.filter((t) => t !== tag),
        { shouldDirty: true },
      );
    },
    [tags, setValue],
  );

  const onSubmit = async (values: SongFormValues) => {
    const now = Date.now();
    const links = values.links
      ? Object.fromEntries(Object.entries(values.links).filter(([, v]) => v))
      : undefined;
    const toSave = {
      ...values,
      artist: values.artist || undefined,
      key: values.key || undefined,
      notes: values.notes || undefined,
      techNotes: values.techNotes || undefined,
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
    <div className="flex min-h-full flex-col p-page lg:h-full">
      <div className="shrink-0">
        <EditorHeader
          breadcrumbs={[
            { label: t("nav.songs"), to: Router.Catalog() },
            { label: watch("title") || t("editor.newSong") },
          ]}
          actions={
            <>
              {isNew && (
                <button
                  type="button"
                  onClick={() => setShowLookup(true)}
                  className="btn btn-outline btn-responsive"
                >
                  {t("editor.findOnline")}
                </button>
              )}
              {!isNew && (
                <Link
                  to={Router.PerformSong({ songId: songDbId })}
                  className="btn btn-outline btn-responsive"
                >
                  {t("editor.preview")}
                </Link>
              )}
              <button
                type="submit"
                form="song-form"
                disabled={isSubmitting || !isDirty}
                className="btn btn-primary btn-responsive"
              >
                {isSubmitting ? t("common.saving") : t("common.save")}
              </button>
              {!isNew && (
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
                        {t("editor.resetChanges")}
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
              )}
            </>
          }
        />

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
      </div>

      {/* Desktop: side-by-side grid | Mobile: stacked */}
      <form
        id="song-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid flex-1 gap-4 transition-[grid-template-columns] duration-200 ease-in-out lg:min-h-0 lg:grid-cols-[1fr_var(--panel-w)]"
        style={{ "--panel-w": panelOpen ? "22rem" : "0fr" } as React.CSSProperties}
      >
        {/* Left: ChordPro editor (order-2 on mobile so metadata comes first) */}
        <div className="relative order-2 flex min-h-0 flex-col gap-4 lg:order-none">
          {/* Floating re-open button when drawer is collapsed (desktop only) */}
          {!panelOpen && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="absolute right-2 top-8 z-10 hidden rounded-md border border-border bg-bg-surface/90 px-2 py-1 text-xs text-text-muted shadow-sm backdrop-blur-sm hover:bg-bg-hover hover:text-text lg:block"
              aria-label={t("editor.toggleMetadata")}
              title={t("editor.toggleMetadata")}
            >
              {t("editor.metadata")} ◂
            </button>
          )}
          <ChordProEditor
            register={register}
            value={watch("content")}
            error={errors.content?.message}
          />
          <ChordProHelp />
        </div>

        {/* Metadata — mobile: collapsible accordion | desktop: side drawer */}
        <div className="order-1 lg:order-none lg:min-h-0">
          {/* Mobile: native <details> accordion */}
          <details className="group rounded-md border border-border lg:hidden">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-text-muted">
              {t("editor.metadata")}
            </summary>
            <div className="border-t border-border px-3 py-3">
              <MetadataPanel
                register={register}
                errors={errors}
                watch={watch}
                setValue={setValue}
                tags={tags}
                tagInput={tagInput}
                onTagInputChange={setTagInput}
                onAddTag={addTag}
                onRemoveTag={removeTag}
                isNew={isNew}
                songId={songId}
                overrides={overrides}
                overridesOpen={overridesOpen}
                onOverridesOpenChange={setOverridesOpen}
                globalPrefs={globalPrefs}
                onUpdateOverride={updateOverride}
                onClearOverrideKey={clearOverrideKey}
                onClearAllOverrides={clearAllOverrides}
              />
            </div>
          </details>

          {/* Desktop: collapsible drawer */}
          <div className="hidden lg:flex lg:h-full lg:flex-col">
            <div
              className="grid min-h-0 flex-1 transition-[grid-template-rows,opacity] duration-200 ease-in-out"
              style={{
                gridTemplateRows: panelOpen ? "1fr" : "0fr",
                opacity: panelOpen ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="overflow-y-auto lg:h-full">
                  <MetadataPanel
                    register={register}
                    errors={errors}
                    watch={watch}
                    setValue={setValue}
                    tags={tags}
                    tagInput={tagInput}
                    onTagInputChange={setTagInput}
                    onAddTag={addTag}
                    onRemoveTag={removeTag}
                    isNew={isNew}
                    songId={songId}
                    onTogglePanel={() => setPanelOpen((o) => !o)}
                    overrides={overrides}
                    overridesOpen={overridesOpen}
                    onOverridesOpenChange={setOverridesOpen}
                    globalPrefs={globalPrefs}
                    onUpdateOverride={updateOverride}
                    onClearOverrideKey={clearOverrideKey}
                    onClearAllOverrides={clearAllOverrides}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {showLookup && (
        <SongLookupModal onSelect={onLookupSelect} onClose={() => setShowLookup(false)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={t("editor.deleteConfirmTitle")}
          message={t("editor.deleteConfirmMessage")}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={deleteSong}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
