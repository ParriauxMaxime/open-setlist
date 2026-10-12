import type { SongAttachment } from "@db";
import { useDb } from "@db/provider";
import { ATTACHMENT_KIND, attachmentKind } from "@domain/attachments";
import { useLiveQuery } from "dexie-react-hooks";
import type { PDFDocumentProxy, PDFWorker } from "pdfjs-dist";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** Canvas pixels per page: sharp on a tablet, within iOS canvas memory limits. */
const MAX_CANVAS_PIXELS = 5_000_000;
const A4_RATIO = 297 / 210;

// One worker for every document: a loading task only destroys a worker it created itself
let sharedWorker: PDFWorker | undefined;

async function openPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!sharedWorker) {
    const port = new Worker(
      new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    // pdf.js types `port` as null, but documents it as a Worker
    sharedWorker = new pdfjs.PDFWorker({ port: port as unknown as null });
  }
  return pdfjs.getDocument({ data, worker: sharedWorker });
}

interface ScoreViewProps {
  attachment: SongAttachment;
  /** The musician's private note card, shown above the sheet. */
  note?: ReactNode;
}

/** Sheet music of a song (PDF pages or an image), full width, scrolled like a chart. */
export function ScoreView({ attachment, note }: ScoreViewProps) {
  const { t } = useTranslation();
  const db = useDb();
  const file = useLiveQuery(
    async () => (await db.files.get(attachment.id)) ?? null,
    [db, attachment.id],
  );

  if (file === undefined) return <p className="text-text-faint">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {note}
      {file === null ? (
        <p className="text-text-faint italic">
          {t("attachments.missingFile", { name: attachment.name })}
        </p>
      ) : attachmentKind(attachment) === ATTACHMENT_KIND.pdf ? (
        <PdfPages data={file.data} />
      ) : (
        <ImagePage data={file.data} name={attachment.name} />
      )}
    </div>
  );
}

function ImagePage({ data, name }: { data: Blob; name: string }) {
  const url = useMemo(() => URL.createObjectURL(data), [data]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={name} className="score-page w-full" />;
}

function PdfPages({ data }: { data: Blob }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setDoc(null);
    setFailed(false);
    data
      .arrayBuffer()
      .then(openPdf)
      .then((task) => {
        destroy = () => task.destroy();
        if (cancelled) destroy();
        return task.promise;
      })
      .then((pdf) => {
        if (!cancelled) setDoc(pdf);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("PDF load failed", error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [data]);

  if (failed) return <p className="text-danger">{t("attachments.unreadable")}</p>;
  if (!doc) return <p className="text-text-faint">{t("common.loading")}</p>;

  return (
    <div className="-mx-4 flex flex-col gap-2">
      {Array.from({ length: doc.numPages }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pages are identified by their position
        <PdfPage key={i} doc={doc} number={i + 1} eager={i === 0} />
      ))}
    </div>
  );
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  number: number;
  /** Rendered even off screen: the first page must be there when the song slides in. */
  eager: boolean;
}

function PdfPage({ doc, number, eager }: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(A4_RATIO);
  const [near, setNear] = useState(eager);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => setWidth(Math.round(wrapper.clientWidth));
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(wrapper);
    if (eager) return () => resize.disconnect();
    // Pages within one screen of the viewport; the others free their canvas
    const visibility = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      // The scrolling panel: with the viewport as root, the panel would clip the margin away
      root: wrapper.closest("[data-song-panel]"),
      rootMargin: "100% 0px",
    });
    visibility.observe(wrapper);
    return () => {
      resize.disconnect();
      visibility.disconnect();
    };
  }, [eager]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !near || width === 0) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;

    doc.getPage(number).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const wanted = (width / base.width) * (window.devicePixelRatio || 1);
      const largest = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
      const viewport = page.getViewport({ scale: Math.min(wanted, largest) });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const task = page.render({ canvas, viewport });
      cancelRender = () => task.cancel();
      // A cancelled render rejects: nothing to report
      task.promise.catch(() => {});
    });

    return () => {
      cancelled = true;
      cancelRender?.();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [doc, number, near, width]);

  return (
    <div
      ref={wrapperRef}
      className="score-page mx-auto w-full max-w-[68rem]"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
