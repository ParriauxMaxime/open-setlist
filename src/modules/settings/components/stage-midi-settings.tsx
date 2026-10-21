import { BLE_STATE, connectBleMidi, disconnectBleMidi } from "@domain/midi/bluetooth";
import { COMPANION_ERROR, CompanionError, probeCompanion } from "@domain/midi/companion";
import {
  fitsSevenBits,
  MIDI_ENCODING,
  MIDI_ENCODING_VALUES,
  noteName,
  parsePatchCode,
  patchMessages,
} from "@domain/midi/patch";
import { sendMidi } from "@domain/midi/send";
import {
  displayCompanionAddress,
  MIDI_TRANSPORT,
  MIDI_TRANSPORT_VALUES,
  normalizeCompanionAddress,
  otherScheme,
  patchEncoding,
  saveMidiSettings,
} from "@domain/midi/settings";
import { PART_VALUES } from "@domain/parts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardRow, Choice, ToggleRow } from "../../design-system/components/card";
import { Input, Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";
import { useBleMidi, useMidiSettings } from "../../shared/hooks/use-midi-settings";

type Check =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "ok"; message: string }
  | { type: "error"; message: string };

function numberOrUndefined(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

/** The companion's own page over HTTPS, where a browser can be told to trust its certificate. */
function securePage(base: string): string {
  return `${base.startsWith("https://") ? base : otherScheme(base)}/`;
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
  const overCc = encoding.encoding === MIDI_ENCODING.controlChange;
  const overNotes = encoding.encoding === MIDI_ENCODING.note;
  const testParsed = parsePatchCode(testCode);
  const testNote =
    overNotes && testParsed && fitsSevenBits(testParsed) ? noteName(testParsed.value) : undefined;

  const describe = (err: unknown): string => {
    const kind = err instanceof CompanionError ? err.kind : COMPANION_ERROR.unreachable;
    return t(overWifi ? `midi.errors.${kind}` : "midi.errors.bluetooth");
  };

  const testCompanion = async () => {
    const typed = normalizeCompanionAddress(address);
    if (!typed) return setCheck({ type: "error", message: t("midi.errors.badAddress") });
    saveMidiSettings({ companion: typed });
    setCheck({ type: "busy" });
    try {
      const { base, status } = await probeCompanion(typed);
      saveMidiSettings({ companion: base });
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

  const sendTest = () => {
    const parsed = parsePatchCode(testCode || "1");
    const messages = parsed && patchMessages(parsed, encoding);
    if (!messages) {
      return setCheck({
        type: "error",
        message: t(overCc ? "midi.errors.badCc" : "midi.errors.badCode"),
      });
    }
    send(messages);
  };

  const checkMessage = (
    <div aria-live="polite" className="min-h-5 text-sm">
      {check.type === "busy" && <span className="text-text-muted">{t("midi.test.busy")}</span>}
      {check.type === "ok" && <span className="text-accent">{check.message}</span>}
      {check.type === "error" && <span className="text-danger">{check.message}</span>}
    </div>
  );

  return (
    <>
      <Card>
        <CardRow label={t("midi.role.label")} description={t("midi.role.hint")}>
          <Select
            value={settings.role ?? ""}
            onChange={(e) => saveMidiSettings({ role: e.target.value || undefined })}
            aria-label={t("midi.role.label")}
          >
            <option value="">—</option>
            {PART_VALUES.map((part) => (
              <option key={part} value={part}>
                {partLabel(part, t, false)}
              </option>
            ))}
          </Select>
        </CardRow>
        <ToggleRow
          label={t("midi.enabled")}
          checked={settings.enabled}
          onChange={(enabled) => saveMidiSettings({ enabled })}
        />
      </Card>

      <Card>
        <CardRow label={t("midi.transport.label")}>
          {MIDI_TRANSPORT_VALUES.map((transport) => (
            <Choice
              key={transport}
              selected={settings.transport === transport}
              onClick={() => {
                saveMidiSettings({ transport });
                setCheck({ type: "idle" });
              }}
            >
              {t(`midi.transport.${transport}`)}
            </Choice>
          ))}
        </CardRow>

        {overWifi ? (
          <CardRow label={t("midi.wifi.address")} description={t("midi.wifi.desc")} stacked>
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
            <p className="text-xs text-text-faint">
              {t("midi.wifi.trust")}{" "}
              {settings.companion && (
                <a
                  href={securePage(settings.companion)}
                  target="_blank"
                  rel="noopener"
                  className="link-accent"
                >
                  {t("midi.wifi.openPage")}
                </a>
              )}
            </p>
            {checkMessage}
          </CardRow>
        ) : ble.state === BLE_STATE.unsupported ? (
          <div className="px-4 py-3 text-sm text-warning">{t("midi.bluetooth.unsupported")}</div>
        ) : (
          <CardRow
            label={t(`midi.bluetooth.state.${ble.state}`, { name: ble.deviceName ?? "" })}
            description={`${t("midi.bluetooth.desc")} ${t("midi.bluetooth.reconnect")}`}
          >
            {ble.state === BLE_STATE.disconnected ? (
              <button
                type="button"
                onClick={() => connectBleMidi().catch(() => undefined)}
                className="btn btn-outline btn-sm"
              >
                {t("midi.bluetooth.connect")}
              </button>
            ) : (
              <button type="button" onClick={disconnectBleMidi} className="btn btn-ghost btn-sm">
                {t("midi.bluetooth.disconnect")}
              </button>
            )}
          </CardRow>
        )}
      </Card>

      <Card title={t("midi.test.label")}>
        <CardRow label={t("midi.test.code")} description={t("midi.test.desc")} stacked>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="1"
              aria-label={t("midi.test.code")}
              className="max-w-28"
            />
            {testNote && <span className="text-xs text-text-faint">{testNote}</span>}
            <button type="button" onClick={sendTest} className="btn btn-outline">
              {t("midi.test.send")}
            </button>
          </div>
          {!overWifi && checkMessage}
        </CardRow>
      </Card>

      <Card title={t("midi.advanced.label")}>
        <CardRow label={t("midi.advanced.channel")}>
          <Input
            type="number"
            min={1}
            max={16}
            value={settings.channel ?? ""}
            placeholder={String(encoding.channel)}
            onChange={(e) => saveMidiSettings({ channel: numberOrUndefined(e.target.value) })}
            aria-label={t("midi.advanced.channel")}
            className="w-24"
          />
        </CardRow>
        <CardRow label={t("midi.advanced.encoding")}>
          <Select
            value={encoding.encoding}
            onChange={(e) => saveMidiSettings({ encoding: e.target.value })}
            aria-label={t("midi.advanced.encoding")}
          >
            {MIDI_ENCODING_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`midi.advanced.encodings.${value}`)}
              </option>
            ))}
          </Select>
        </CardRow>
        {overNotes ? (
          <p className="px-4 py-3 text-xs text-text-faint">{t("midi.advanced.noteHint")}</p>
        ) : overCc ? (
          <CardRow label={t("midi.advanced.cc")} description={t("midi.advanced.ccHint")}>
            <Input
              type="number"
              min={0}
              max={127}
              value={settings.cc}
              onChange={(e) => saveMidiSettings({ cc: Number(e.target.value) })}
              aria-label={t("midi.advanced.cc")}
              className="w-24"
            />
          </CardRow>
        ) : (
          <>
            <CardRow
              label={t("midi.advanced.bankSelectCc")}
              description={t("midi.advanced.bankSelectCcHint")}
            >
              <Input
                type="number"
                min={0}
                max={127}
                value={settings.bankSelectCc}
                onChange={(e) => saveMidiSettings({ bankSelectCc: Number(e.target.value) })}
                aria-label={t("midi.advanced.bankSelectCc")}
                className="w-24"
              />
            </CardRow>
            <ToggleRow
              label={t("midi.advanced.programFromOne")}
              checked={settings.programFromOne}
              onChange={(programFromOne) => saveMidiSettings({ programFromOne })}
            />
          </>
        )}
      </Card>
    </>
  );
}
