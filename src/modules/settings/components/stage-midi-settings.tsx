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
import { Input, Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";
import { useBleMidi, useMidiSettings } from "../../shared/hooks/use-midi-settings";
import { Choice, SettingRow, SettingsGroup, ToggleRow } from "./setting-row";

type Check =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "ok"; message: string }
  | { type: "error"; message: string };

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

  const checkMessage = (
    <div aria-live="polite" className="min-h-5 text-sm">
      {check.type === "busy" && <span className="text-text-muted">{t("midi.test.busy")}</span>}
      {check.type === "ok" && <span className="text-accent">{check.message}</span>}
      {check.type === "error" && <span className="text-danger">{check.message}</span>}
    </div>
  );

  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("midi.role.label")} description={t("midi.role.hint")}>
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
        </SettingRow>
        <ToggleRow
          label={t("midi.enabled")}
          checked={settings.enabled}
          onChange={(enabled) => saveMidiSettings({ enabled })}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t("midi.transport.label")}>
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
        </SettingRow>

        {overWifi ? (
          <SettingRow label={t("midi.wifi.address")} description={t("midi.wifi.desc")} stacked>
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
            {checkMessage}
          </SettingRow>
        ) : ble.state === BLE_STATE.unsupported ? (
          <div className="px-4 py-3 text-sm text-warning">{t("midi.bluetooth.unsupported")}</div>
        ) : (
          <SettingRow
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
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("midi.test.label")}>
        <SettingRow label={t("midi.test.code")} description={t("midi.test.desc")} stacked>
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
          {!overWifi && checkMessage}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("midi.advanced.label")}>
        <SettingRow label={t("midi.advanced.channel")}>
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
        </SettingRow>
        <SettingRow label={t("midi.advanced.encoding")}>
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
        </SettingRow>
        {encoding.encoding === MIDI_ENCODING.ccPair ? (
          <>
            <SettingRow label={t("midi.advanced.ccBank")}>
              <Input
                type="number"
                min={0}
                max={127}
                value={settings.ccBank}
                onChange={(e) => saveMidiSettings({ ccBank: Number(e.target.value) })}
                aria-label={t("midi.advanced.ccBank")}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label={t("midi.advanced.ccSlot")}>
              <Input
                type="number"
                min={0}
                max={127}
                value={settings.ccSlot}
                onChange={(e) => saveMidiSettings({ ccSlot: Number(e.target.value) })}
                aria-label={t("midi.advanced.ccSlot")}
                className="w-24"
              />
            </SettingRow>
          </>
        ) : (
          <ToggleRow
            label={t("midi.advanced.programFromOne")}
            checked={settings.programFromOne}
            onChange={(programFromOne) => saveMidiSettings({ programFromOne })}
          />
        )}
      </SettingsGroup>
    </>
  );
}
