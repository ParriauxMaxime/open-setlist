import { COMPANION_ERROR, CompanionError, probeCompanion } from "@domain/midi/companion";
import {
  loadScanSubnet,
  normalizeSubnet,
  type ScanFound,
  saveScanSubnet,
  scanSubnet,
} from "@domain/midi/scan";
import {
  displayCompanionAddress,
  MIDI_TRANSPORT,
  normalizeCompanionAddress,
  otherScheme,
  saveMidiSettings,
} from "@domain/midi/settings";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardRow, Disclosure } from "../../design-system/components/card";
import { Input } from "../../design-system/components/form";

function pair(base: string) {
  saveMidiSettings({ companion: base, companionPaused: false, transport: MIDI_TRANSPORT.wifi });
}

/** The companion's own page over HTTPS, where a browser can be told to trust its certificate. */
export function securePage(base: string): string {
  return `${base.startsWith("https://") ? base : otherScheme(base)}/`;
}

type Scan =
  | { type: "idle" }
  | { type: "scanning"; done: number }
  | { type: "done" }
  | { type: "error"; message: string };

/** Finds the companion programs on one subnet; a tap on one pairs this device with it. */
function ScanCard() {
  const { t } = useTranslation();
  const [subnet, setSubnet] = useState(loadScanSubnet);
  const [scan, setScan] = useState<Scan>({ type: "idle" });
  const [found, setFound] = useState<ScanFound[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    const normalized = normalizeSubnet(subnet);
    if (!normalized) {
      return setScan({ type: "error", message: t("companion.pair.scan.badSubnet") });
    }
    saveScanSubnet(normalized);
    setSubnet(normalized);
    setFound([]);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setScan({ type: "scanning", done: 0 });
    await scanSubnet(normalized, {
      signal: controller.signal,
      onFound: (companion) => setFound((list) => [...list, companion]),
      onProgress: (done) => setScan({ type: "scanning", done }),
    });
    if (!controller.signal.aborted) setScan({ type: "done" });
  };

  const scanning = scan.type === "scanning";

  return (
    <Card title={t("companion.pair.scan.heading")}>
      <CardRow
        label={t("companion.pair.scan.subnet")}
        description={t("companion.pair.scan.hint")}
        stacked
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Input
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              inputMode="decimal"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label={t("companion.pair.scan.subnet")}
            />
          </div>
          <span className="text-sm text-text-faint" aria-hidden="true">
            .1 – .254
          </span>
          {scanning ? (
            <button
              type="button"
              onClick={() => {
                abort.current?.abort();
                setScan({ type: "done" });
              }}
              className="btn btn-outline"
            >
              {t("common.cancel")}
            </button>
          ) : (
            <button type="button" onClick={start} className="btn btn-primary">
              {t("companion.pair.scan.start")}
            </button>
          )}
        </div>
        <div aria-live="polite" className="mt-2 min-h-5 text-sm">
          {scanning && (
            <span className="text-text-muted">
              {t("companion.pair.scan.progress", { done: scan.done })}
            </span>
          )}
          {scan.type === "done" && found.length === 0 && (
            <span className="text-text-muted">{t("companion.pair.scan.none")}</span>
          )}
          {scan.type === "error" && <span className="text-danger">{scan.message}</span>}
        </div>
      </CardRow>
      {found.map(({ base, status }) => (
        <CardRow key={base} label={status.name} description={displayCompanionAddress(base)}>
          <button type="button" onClick={() => pair(base)} className="btn btn-primary btn-sm">
            {t("companion.pair.use")}
          </button>
        </CardRow>
      ))}
    </Card>
  );
}

type Check = { type: "idle" } | { type: "busy" } | { type: "error"; message: string };

/** The address typed by hand, for when the scan cannot run. */
function ManualEntry() {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [check, setCheck] = useState<Check>({ type: "idle" });
  const typed = normalizeCompanionAddress(address);

  const connect = async () => {
    if (!typed) return setCheck({ type: "error", message: t("midi.errors.badAddress") });
    setCheck({ type: "busy" });
    try {
      const { base } = await probeCompanion(typed);
      pair(base);
    } catch (err) {
      const kind = err instanceof CompanionError ? err.kind : COMPANION_ERROR.unreachable;
      setCheck({ type: "error", message: t(`midi.errors.${kind}`) });
    }
  };

  return (
    <Disclosure summary={t("companion.pair.manual.heading")}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.168.1.20"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={t("midi.wifi.address")}
          />
        </div>
        <button type="submit" className="btn btn-outline" disabled={check.type === "busy"}>
          {t("companion.connection.connect")}
        </button>
      </form>
      <div aria-live="polite" className="mt-2 min-h-5 text-sm">
        {check.type === "busy" && (
          <span className="text-text-muted">{t("companion.pair.manual.busy")}</span>
        )}
        {check.type === "error" && <span className="text-danger">{check.message}</span>}
      </div>
      <p className="mt-1 text-xs text-text-faint">
        {t("midi.wifi.trust")}{" "}
        {typed && (
          <a href={securePage(typed)} target="_blank" rel="noopener" className="link-accent">
            {t("midi.wifi.openPage")}
          </a>
        )}
      </p>
    </Disclosure>
  );
}

/** Pairing this device with a companion program: scan, QR code, or the address by hand. */
export function Pairing() {
  const { t } = useTranslation();
  return (
    <>
      <ScanCard />
      <Card title={t("companion.pair.qr.heading")}>
        <p className="px-4 py-3 text-sm text-text-muted">{t("companion.pair.qr.hint")}</p>
      </Card>
      <ManualEntry />
    </>
  );
}
