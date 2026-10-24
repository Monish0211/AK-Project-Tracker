import type { SoundState } from "./ReminderSoundService";

/** What to tell the user about the reminder sound right now — plain words, and what to do if it is not working. */
export function describeSoundState(state: SoundState): string {
  switch (state.status) {
    case "muted":
      return "Reminder sound is off.";
    case "ready":
      return "Reminder sound is on and your browser is allowing audio.";
    case "needs-interaction":
      return "Your browser only plays sound after you interact with the page. Click “Test sound” once to enable it.";
    case "blocked":
      return "Your browser blocked the last reminder sound. Click “Test sound” to enable it. (Also check that this tab and your device are not muted.)";
    case "unsupported":
      return "This browser cannot play the reminder sound.";
    case "error":
      return `The reminder sound could not be played${state.lastError ? `: ${state.lastError}` : "."}`;
  }
}
