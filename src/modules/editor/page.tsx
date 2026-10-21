import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import { removeMyNote } from "@domain/my-notes";
import {
  getSongOverrides,
  loadPreferences,
  removeSongOverrides,
  resolveSongDisplayPrefs,
  type SongDisplayPrefs,
  setSongOverrides,
} from "@domain/preferences";
import { useActiveProfileId } from "@domain/profiles";
import { type SongFormValues, songFormSchema } from "@domain/schemas/song";
import { addTombstone } from "@domain/sync/tombstones";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmModal } from "../design-system/components/confirm-modal";
import { EditorHeader } from "../design-system/components/editor-header";
import { getPerformReturn, performReturnHref } from "../performance/components/perform-sidebar";
import { navigateFromGuardedPage, useUnsavedGuard } from "../shared/hooks/use-unsaved-guard";
import { AttachmentsPanel } from "./components/attachments-panel";
import { ChartPreview } from "./components/chart-preview";
import { ChordProEditor } from "./components/chordpro-editor";
import { ChordProHelp } from "./components/chordpro-help";
import { DeleteSongCard } from "./components/delete-song-card";
import { MetadataPanel } from "./components/metadata-panel";
import { MyNotePanel } from "./components/my-note-panel";
import { PasteChartModal } from "./components/paste-chart-modal";
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
  scrollSpeed: undefined,
  status: undefined,
  tags: [],
  notes: "",
  techNotes: "",
  links: undefined,
  attachments: undefined,
  patches: undefined,
  content: "",
};

/** Drops the instruments left without a code. */
function cleanPatches(patches: Record<string, string> | undefined) {
  const kept = Object.entries(patches ?? {})
    .map(([part, code]) => [part, code.trim()] as const)
    .filter(([, code]) => code);
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

export function EditSongPage({ songId }: EditSongPageProps) {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const existing = useLiveQuery(
    async () => (songId ? ((await db.songs.get(songId)) ?? null) : undefined),
    [songId, db],
  );
  const [songDbId] = useState(() => songId ?? createId());
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLookup, setShowLookup] = useState(false);
  const [showPasteChart, setShowPasteChart] = useState(false);
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
  const displayPrefs = useMemo(
    () => ({ ...resolveSongDisplayPrefs(globalPrefs, undefined), ...overrides }),
    [globalPrefs, overrides],
  );
  // Below lg, the chart preview takes the text's place
  const [previewing, setPreviewing] = useState(false);

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
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
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
        scrollSpeed: existing.scrollSpeed,
        status: existing.status,
        tags: existing.tags,
        notes: existing.notes ?? "",
        techNotes: existing.techNotes ?? "",
        links: existing.links,
        attachments: existing.attachments,
        patches: existing.patches,
        content: existing.content,
      });
    }
  }, [existing, reset]);

  // A save can race the live-query reset above; re-baseline once the submit settles.
  useEffect(() => {
    if (isSubmitSuccessful) reset(getValues());
  }, [isSubmitSuccessful, reset, getValues]);

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
      attachments: values.attachments?.length ? values.attachments : undefined,
      patches: cleanPatches(values.patches),
      id: songDbId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.songs.put(toSave);
    const kept = new Set(toSave.attachments?.map((a) => a.id));
    await db.files.bulkDelete(
      (existing?.attachments ?? []).filter((a) => !kept.has(a.id)).map((a) => a.id),
    );
    if (isNew) {
      Router.replace("SongEdit", { songId: toSave.id });
      return;
    }
    // Opened from the stage view: Save goes back to the same song there
    const performReturn = getPerformReturn();
    const returnHref = performReturn?.songId === songDbId ? performReturnHref(performReturn) : null;
    if (returnHref) navigateFromGuardedPage(returnHref);
  };

  const deleteSong = useCallback(async () => {
    if (!songId) return;
    addTombstone(profileId, "song", songId);
    removeSongOverrides(songId);
    removeMyNote(profileId, songId);
    await db.files.bulkDelete((existing?.attachments ?? []).map((a) => a.id));
    await db.songs.delete(songId);
    Router.replace("Catalog");
  }, [songId, profileId, db, existing]);

  const unsavedModal = useUnsavedGuard(isDirty, () => {
    if (!isSubmitting) handleSubmit(onSubmit)();
  });

  const onLookupSelect = useCallback(
    (values: Partial<SongFormValues>) => {
      reset({ ...defaultValues, ...values });
      setShowLookup(false);
    },
    [reset],
  );

  if (!isNew && existing === null) {
    return (
      <div className="flex flex-col items-center gap-4 p-page">
        <p className="text-text-muted">{t("editor.notFound")}</p>
        <Link to={Router.Catalog()} className="link-accent">
          {t("editor.backToCatalog")}
        </Link>
      </div>
    );
  }

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
              {/* `.btn` sets its own display, so the wrapper carries the breakpoint */}
              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => setPreviewing((v) => !v)}
                  className="btn btn-outline btn-responsive"
                >
                  {previewing ? t("editor.edit") : t("editor.preview")}
                </button>
              </div>
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
                    aria-label={t("a11y.moreOptions")}
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
                    </div>
                  )}
                </div>
              )}
            </>
          }
        />

        {/* An empty chart: pasting one is the quickest way in */}
        {!watch("content").trim() && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-accent-muted px-4 py-3">
            <p className="min-w-40 flex-1 text-sm text-text">{t("chartImport.emptyHint")}</p>
            <button
              type="button"
              onClick={() => setShowPasteChart(true)}
              className="btn btn-primary"
            >
              {t("chartImport.pasteButton")}
            </button>
          </div>
        )}
        <AttachmentsPanel
          attachments={watch("attachments") ?? []}
          onChange={(attachments) => setValue("attachments", attachments, { shouldDirty: true })}
        />
      </div>

      {/* Desktop: side-by-side grid | Mobile: stacked */}
      <form
        id="song-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid flex-1 content-start gap-4 transition-[grid-template-columns] duration-200 ease-in-out lg:min-h-0 lg:grid-cols-[1fr_var(--panel-w)] lg:content-stretch"
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
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-2">
            <div className={`${previewing ? "hidden" : "flex"} min-h-0 flex-1 flex-col lg:flex`}>
              <ChordProEditor
                register={register}
                value={watch("content")}
                error={errors.content?.message}
                onContentChange={(content) => setValue("content", content, { shouldDirty: true })}
                toolbar={
                  <button
                    type="button"
                    onClick={() => setShowPasteChart(true)}
                    className="btn btn-ghost btn-sm"
                  >
                    {t("chartImport.pasteButton")}
                  </button>
                }
              />
            </div>
            <ChartPreview
              content={watch("content")}
              transposition={watch("transposition")}
              displayPrefs={displayPrefs}
              className={previewing ? "" : "hidden lg:block"}
            />
          </div>
          <ChordProHelp />
        </div>

        {/* Metadata — mobile: one accordion per block | desktop: side drawer */}
        <div className="order-1 lg:order-none lg:min-h-0">
          <div className="lg:hidden">
            <MetadataPanel
              stacked
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
                  {!isNew && (
                    <div className="mt-8">
                      <DeleteSongCard onDelete={() => setConfirmDelete(true)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Private, device-only note: kept outside the song form so it is never saved/synced */}
      {!isNew && (
        <div className="mt-4 shrink-0">
          <MyNotePanel profileId={profileId} songId={songDbId} />
        </div>
      )}

      {!isNew && (
        <div className="mt-8 lg:hidden">
          <DeleteSongCard onDelete={() => setConfirmDelete(true)} />
        </div>
      )}

      {showLookup && (
        <SongLookupModal onSelect={onLookupSelect} onClose={() => setShowLookup(false)} />
      )}

      {showPasteChart && (
        <PasteChartModal
          existing={getValues("content")}
          filled={getValues()}
          onInsert={(content) => {
            setValue("content", content, { shouldDirty: true });
            setShowPasteChart(false);
          }}
          onClose={() => setShowPasteChart(false)}
        />
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
      {unsavedModal}
    </div>
  );
}
