/**
 * ReminderSoundService
 *
 * A soft chime for reminders, generated with the native Web Audio API (no audio asset to ship, fetch or fail to load, and
 * it works offline). Reworked in Oct 2026 because the old version failed silently:
 *
 *  - Browsers keep an AudioContext "suspended" until the user has interacted with the page. After a refresh the scheduler
 *    fires overdue reminders straight away — before any click — so the chime was scheduled on a suspended context and never
 *    heard, with no sign anything was wrong. It now reports that state (`blocked` / `needs-interaction`) instead of
 *    pretending, the UI shows it, and the "Test sound" / on-off controls (a real click) unlock it.
 *  - There was no mute/volume preference at all. They are now stored (localStorage) and respected.
 *  - Every error was swallowed. Playback now returns a result and records the last failure for display.
 *  - Duplicate triggers are dropped: each reminder occurrence plays at most once, and chimes never stack on top of each other.
 *
 * It cannot override the browser or the operating system: a muted tab or device, or a browser that still refuses audio, is
 * reported as such rather than promised away.
 */

export type SoundStatus = "needs-interaction" | "ready" | "muted" | "blocked" | "unsupported" | "error";

export interface PlayResult {
  played: boolean;
  reason?: "muted" | "duplicate" | "blocked" | "unsupported" | "error" | "throttled";
  error?: string;
}

export interface SoundState {
  enabled: boolean;
  volume: number;
  status: SoundStatus;
  lastError?: string;
  lastPlayedAt?: number;
}

const PREFS_KEY = "pmo_reminder_sound_prefs_v1";
const RESUME_TIMEOUT_MS = 400;
const MIN_GAP_MS = 1500; // chimes last ~3.5s; never start a new one on top of one that has barely begun
const MAX_REMEMBERED_KEYS = 500;

type AudioCtxLike = {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(n: unknown): void;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createGain(): {
    gain: { value: number; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void };
    connect(n: unknown): void;
  };
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);

export class ReminderSoundService {
  private audioCtx: AudioCtxLike | null = null;
  private enabled = true;
  private volume = 0.7;
  private status: SoundStatus = "needs-interaction";
  private lastError: string | undefined;
  private lastPlayedAt: number | undefined;
  private lastStartedAt = -Infinity;
  private playedKeys: string[] = [];
  private listeners = new Set<() => void>();
  private snapshot: SoundState;
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
    this.loadPrefs();
    this.status = this.computeIdleStatus();
    this.snapshot = this.buildSnapshot();
    this.setupUnlockListeners();
  }

  // ── state for the UI ────────────────────────────────────────────────────
  getState(): SoundState {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private buildSnapshot(): SoundState {
    return { enabled: this.enabled, volume: this.volume, status: this.status, lastError: this.lastError, lastPlayedAt: this.lastPlayedAt };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot(); // a new object each change, so useSyncExternalStore re-renders
    this.listeners.forEach((listener) => listener());
  }

  private contextRunning(): boolean {
    return this.audioCtx?.state === "running";
  }

  private computeIdleStatus(): SoundStatus {
    if (!this.enabled) return "muted";
    if (!this.getAudioContextClass()) return "unsupported";
    return this.contextRunning() ? "ready" : "needs-interaction";
  }

  // ── preferences ─────────────────────────────────────────────────────────
  private loadPrefs(): void {
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { enabled?: unknown; volume?: unknown };
      if (typeof parsed.enabled === "boolean") this.enabled = parsed.enabled;
      if (typeof parsed.volume === "number" && Number.isFinite(parsed.volume)) this.volume = Math.max(0, Math.min(1, parsed.volume));
    } catch {
      // keep defaults
    }
  }

  private savePrefs(): void {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      // not persisted; still applies for this page's life
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.savePrefs();
    this.status = this.computeIdleStatus();
    this.publish();
  }

  /** Back-compat name: mute(true) turns the sound off. */
  mute(mute: boolean): void {
    this.setEnabled(!mute);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.savePrefs();
    this.publish();
  }

  // ── audio context + browser autoplay rules ──────────────────────────────
  private getAudioContextClass(): (new () => AudioCtxLike) | null {
    const g = globalThis as unknown as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  }

  private ensureContext(): AudioCtxLike | null {
    if (this.audioCtx) return this.audioCtx;
    const Ctor = this.getAudioContextClass();
    if (!Ctor) return null;
    try {
      this.audioCtx = new Ctor();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.audioCtx = null;
    }
    return this.audioCtx;
  }

  /** Tries to get the context running. Only a real user gesture (or an already-active user) lets this succeed. */
  private async resumeContext(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    try {
      await withTimeout(ctx.resume(), RESUME_TIMEOUT_MS);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    return ctx.state === "running";
  }

  private setupUnlockListeners(): void {
    if (typeof document === "undefined") return;
    const events = ["pointerdown", "click", "keydown", "touchstart"] as const;
    const unlock = () => {
      void this.resumeContext().then((running) => {
        if (!running) return;
        events.forEach((name) => document.removeEventListener(name, unlock, true));
        this.status = this.computeIdleStatus();
        this.lastError = undefined;
        this.publish();
      });
    };
    events.forEach((name) => document.addEventListener(name, unlock, true));
  }

  // ── playback ────────────────────────────────────────────────────────────
  /**
   * Plays the chime for reminder occurrences that just fired. Each key plays at most once, ever (so repeated polling, a second
   * mounted listener or a re-render can never replay it), and the call is dropped while muted.
   */
  async playForReminders(keys: string[]): Promise<PlayResult> {
    if (!this.enabled) return this.finish({ played: false, reason: "muted" });
    const fresh = keys.filter((key) => !this.playedKeys.includes(key));
    if (keys.length > 0 && fresh.length === 0) return { played: false, reason: "duplicate" };
    const result = await this.chime();
    if (result.played) {
      this.playedKeys.push(...fresh);
      if (this.playedKeys.length > MAX_REMEMBERED_KEYS) this.playedKeys.splice(0, this.playedKeys.length - MAX_REMEMBERED_KEYS);
    }
    return result;
  }

  /** The "Test sound" button. Must be called from a click handler so the browser permits audio. Honors mute. */
  async test(): Promise<PlayResult> {
    if (!this.enabled) return this.finish({ played: false, reason: "muted" });
    return this.chime(true);
  }

  private finish(result: PlayResult): PlayResult {
    this.status = result.played ? "ready" : result.reason === "muted" ? "muted" : result.reason === "blocked" ? "blocked" : result.reason === "unsupported" ? "unsupported" : result.reason === "error" ? "error" : this.computeIdleStatus();
    if (result.played) {
      this.lastError = undefined;
      this.lastPlayedAt = this.clock();
    } else if (result.error) {
      this.lastError = result.error;
    }
    this.publish();
    return result;
  }

  private async chime(force = false): Promise<PlayResult> {
    if (!this.getAudioContextClass()) return this.finish({ played: false, reason: "unsupported" });
    const now = this.clock();
    if (!force && now - this.lastStartedAt < MIN_GAP_MS) return { played: false, reason: "throttled" };

    let running: boolean;
    try {
      running = await this.resumeContext();
    } catch (error) {
      return this.finish({ played: false, reason: "error", error: error instanceof Error ? error.message : String(error) });
    }
    if (!running || !this.audioCtx) {
      // Not an error in the code: the browser has not allowed audio yet. Say so, so the user can act on it.
      return this.finish({ played: false, reason: "blocked", error: "The browser blocked audio until you click or press a key on the page." });
    }

    try {
      this.lastStartedAt = now;
      const ctx = this.audioCtx;
      const start = ctx.currentTime;
      const note = (freq: number, at: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(this.volume / 3, at + 0.05);
        gain.gain.linearRampToValueAtTime(0, at + 3.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 3.5);
      };
      // A gentle ascending arpeggio (C5 E5 G5 C6)
      note(523.25, start);
      note(659.25, start + 0.15);
      note(783.99, start + 0.3);
      note(1046.5, start + 0.45);
      return this.finish({ played: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("ReminderSoundService: audio playback failed.", error);
      return this.finish({ played: false, reason: "error", error: message });
    }
  }

  stop(): void {
    // One-shot oscillators end themselves; nothing to stop. Kept for API compatibility.
  }
}

export const reminderSoundService = new ReminderSoundService();
