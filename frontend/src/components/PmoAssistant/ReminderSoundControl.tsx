import React, { useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { reminderSoundService } from "../../services/audio/ReminderSoundService";
import { describeSoundState } from "../../services/audio/reminderSoundText";

/**
 * On/off, volume and a "Test sound" button for the reminder chime. Browsers will not play audio until the user has interacted
 * with the page, so the Test button doubles as the one-click way to allow it, and the line under it always says what state
 * the sound is in instead of failing silently. It cannot override a muted tab/device or a browser-level block.
 */
export const ReminderSoundControl: React.FC = () => {
  const state = useSyncExternalStore(
    (listener) => reminderSoundService.subscribe(listener),
    () => reminderSoundService.getState(),
    () => reminderSoundService.getState()
  );
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestNote(null);
    const result = await reminderSoundService.test(); // started synchronously inside this click, as browsers require
    setTesting(false);
    setTestNote(
      result.played
        ? "Played — if you heard nothing, check the volume and that this tab and your device are not muted."
        : result.reason === "muted"
          ? "Turn the sound on first."
          : null
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-2.5 space-y-2" data-testid="reminder-sound-control">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
          {state.enabled ? <Volume2 size={13} aria-hidden="true" /> : <VolumeX size={13} aria-hidden="true" />}
          Reminder sound
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={state.enabled}
            aria-label="Reminder sound"
            onClick={() => reminderSoundService.setEnabled(!state.enabled)}
            className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${state.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${state.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-60"
          >
            {testing ? "Playing…" : "Test sound"}
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
        Volume
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(state.volume * 100)}
          onChange={(e) => reminderSoundService.setVolume(Number(e.target.value) / 100)}
          aria-label="Reminder sound volume"
          className="flex-1 accent-blue-600"
          disabled={!state.enabled}
        />
        <span className="w-8 text-right tabular-nums">{Math.round(state.volume * 100)}%</span>
      </label>
      <p className="text-[10.5px] leading-snug text-slate-500 dark:text-slate-400" role="status" data-sound-status={state.status}>
        {describeSoundState(state)} {testNote}
      </p>
    </div>
  );
};
