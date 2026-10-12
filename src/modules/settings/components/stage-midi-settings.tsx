import { BLE_STATE, connectBleMidi, disconnectBleMidi } from "@domain/midi/bluetooth";
import {
  COMPANION_ERROR,
  CompanionError,
  type CompanionStatus,
  companionStatus,
} from "@domain/midi/companion";
import {
  MIDI_ENCODING,
  MIDI_ENCODING_VALUES,
  parsePatchCode,
  patchMessages,
} from "@domain/midi/patch";
import { sendMidi } from "@domain/midi/send";
import {
  displayCompanionAddress,
  MIDI_TRANSPORT,
  MIDI_TRANSPORT_VALUES,
  normalizeCompanionAddress,
  patchEncoding,
  saveMidiSettings,
} from "@domain/midi/settings";
import { PART_VALUES } from "@domain/parts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input, Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";
import { useBleMidi, useMidiSettings } from "../../shared/hooks/use-midi-settings";

type Check =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "ok"; message: string }
  | { type: "error"; message: string };

function choiceClass(selected: boolean): string {
  return [
    "rounded-md border px-3 py-1.5 text-sm transition-colors",
    selected
      ? "border-accent bg-accent-muted text-accent"
      : "border-border text-text-muted hover:border-text-faint hover:text-text",
  ].join(" ");
}

function numberOrUndefined(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

/** Stage MIDI: what this device sends when the song changes, and through what. */
export function StageMidiSettings() {
  const { t } = useTranslation();
  const settings = useMidiSettings();
  const ble = useBleMidi();
  const encoding = patchEncoding(settings);
  const [address, setAddress] = useState(() => displayCompanionAddress(settings.companion));
  const [check, setCheck] = useState<Check>({ type: "idle" });
  const [testCode, setTestCode] = useState("");
  const overWifi = settings.transport === MIDI_TRANSPORT.wifi;
  const defaultTestCode = encoding.encoding === MIDI_ENCODING.ccPair ? "11A" : "1";

  const describe = (err: unknown): string => {
    const kind = err instanceof CompanionError ? err.kind : COMPANION_ERROR.unreachable;
    return t(overWifi ? `midi.errors.${kind}` : "midi.errors.bluetooth");
  };

  const testCompanion = async () => {
    const base = normalizeCompanionAddress(address);
    if (!base) return setCheck({ type: "error", message: t("midi.errors.badAddress") });
    saveMidiSettings({ companion: base });
    setCheck({ type: "busy" });
    try {
      const status: CompanionStatus = await companionStatus(base);
      setCheck(
        status.midiOut
          ? {
              type: "ok",
              message: t("midi.wifi.connected", { name: status.name, port: status.midiOut }),
            }
          : { type: "error", message: t("midi.errors.noMidiOutput") },
      );
    } catch (err) {
      setCheck({ type: "error", message: describe(err) });
    }
  };

  const send = async (messages: number[][]) => {
    setCheck({ type: "busy" });
    try {
      await sendMidi(settings, messages);
      setCheck({ type: "ok", message: t("midi.test.sent", { count: messages.length }) });
    } catch (err) {
      setCheck({ type: "error", message: describe(err) });
    }
  };

  const sendTest = (only?: number) => {
    const parsed = parsePatchCode(testCode || defaultTestCode);
    if (!parsed) return setCheck({ type: "error", message: t("midi.errors.badCode") });
    const messages = patchMessages(parsed, encoding);
    send(only === undefined ? messages : messages.slice(only, only + 1));
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {t("midi.role.label")}
        </legend>
        <Select
          value={settings.role ?? ""}
          onChange={(e) => saveMidiSettings({ role: e.target.value || undefined })}
          aria-label={t("midi.role.label")}
          className="max-w-xs"
        >
          <option value="">—</option>
          {PART_VALUES.map((part) => (
            <option key={part} value={part}>
              {partLabel(part, t, false)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-text-faint">{t("midi.role.hint")}</p>
      </fieldset>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => saveMidiSettings({ enabled: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span className="text-sm text-text">{t("midi.enabled")}</span>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {t("midi.transport.label")}
        </legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {MIDI_TRANSPORT_VALUES.map((transport) => (
            <button
              key={transport}
              type="button"
              aria-pressed={settings.transport === transport}
              onClick={() => {
                saveMidiSettings({ transport });
                setCheck({ type: "idle" });
              }}
              className={choiceClass(settings.transport === transport)}
            >
              {t(`midi.transport.${transport}`)}
            </button>
          ))}
        </div>

        {overWifi ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-muted">{t("midi.wifi.desc")}</p>
            <div className="flex max-w-md gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="192.168.1.20"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                aria-label={t("midi.wifi.address")}
                className="flex-1"
              />
              <button type="button" onClick={testCompanion} className="btn btn-outline">
                {t("midi.wifi.test")}
              </button>
            </div>
            <p className="text-xs text-text-faint">{t("midi.wifi.permission")}</p>
          </div>
        ) : ble.state === BLE_STATE.unsupported ? (
          <p className="text-sm text-warning">{t("midi.bluetooth.unsupported")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-muted">{t("midi.bluetooth.desc")}</p>
            <div className="flex flex-wrap items-center gap-3">
              {ble.state === BLE_STATE.disconnected ? (
                <button
                  type="button"
                  onClick={() => connectBleMidi().catch(() => undefined)}
                  className="btn btn-outline"
                >
                  {t("midi.bluetooth.connect")}
                </button>
              ) : (
                <button type="button" onClick={disconnectBleMidi} className="btn btn-ghost">
                  {t("midi.bluetooth.disconnect")}
                </button>
              )}
              <span className="text-sm text-text-muted">
                {t(`midi.bluetooth.state.${ble.state}`, { name: ble.deviceName ?? "" })}
              </span>
            </div>
            <p className="text-xs text-text-faint">{t("midi.bluetooth.reconnect")}</p>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {t("midi.test.label")}
        </legend>
        <p className="mb-2 text-sm text-text-muted">{t("midi.test.desc")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            placeholder={defaultTestCode}
            aria-label={t("midi.test.code")}
            className="max-w-28"
          />
          <button type="button" onClick={() => sendTest()} className="btn btn-outline">
            {t("midi.test.send")}
          </button>
          {encoding.encoding === MIDI_ENCODING.ccPair && (
            <>
              <button type="button" onClick={() => sendTest(0)} className="btn btn-ghost">
                {t("midi.test.bankOnly", { cc: encoding.ccBank })}
              </button>
              <button type="button" onClick={() => sendTest(1)} className="btn btn-ghost">
                {t("midi.test.slotOnly", { cc: encoding.ccSlot })}
              </button>
            </>
          )}
        </div>
        <div aria-live="polite" className="mt-2 min-h-5 text-sm">
          {check.type === "busy" && <span className="text-text-muted">{t("midi.test.busy")}</span>}
          {check.type === "ok" && <span className="text-accent">{check.message}</span>}
          {check.type === "error" && <span className="text-danger">{check.message}</span>}
        </div>
      </fieldset>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-text-muted">
          {t("midi.advanced.label")}
        </summary>
        <div className="grid max-w-md grid-cols-2 gap-3 border-t border-border px-3 py-3 text-sm">
          <Field label={t("midi.advanced.channel")}>
            <Input
              type="number"
              min={1}
              max={16}
              value={settings.channel ?? ""}
              placeholder={String(encoding.channel)}
              onChange={(e) => saveMidiSettings({ channel: numberOrUndefined(e.target.value) })}
            />
          </Field>
          <Field label={t("midi.advanced.encoding")}>
            <Select
              value={encoding.encoding}
              onChange={(e) => saveMidiSettings({ encoding: e.target.value })}
            >
              {MIDI_ENCODING_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`midi.advanced.encodings.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          {encoding.encoding === MIDI_ENCODING.ccPair ? (
            <>
              <Field label={t("midi.advanced.ccBank")}>
                <Input
                  type="number"
                  min={0}
                  max={127}
                  value={settings.ccBank}
                  onChange={(e) => saveMidiSettings({ ccBank: Number(e.target.value) })}
                />
              </Field>
              <Field label={t("midi.advanced.ccSlot")}>
                <Input
                  type="number"
                  min={0}
                  max={127}
                  value={settings.ccSlot}
                  onChange={(e) => saveMidiSettings({ ccSlot: Number(e.target.value) })}
                />
              </Field>
            </>
          ) : (
            <label className="col-span-2 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={settings.programFromOne}
                onChange={(e) => saveMidiSettings({ programFromOne: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              {t("midi.advanced.programFromOne")}
            </label>
          )}
        </div>
      </details>
    </div>
  );
}
