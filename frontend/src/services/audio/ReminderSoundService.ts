/**
 * ReminderSoundService
 * 
 * Provides an enterprise-grade soft chime audio notification for reminders.
 * Uses the native Web Audio API, requiring zero external MP3/WAV assets,
 * ensuring fast initialization and 100% offline compatibility.
 * 
 * Future-ready for volume control, muting, and different sound themes.
 */
class ReminderSoundService {
  private audioCtx: AudioContext | null = null;
  private isEnabled = true;
  private volume = 0.7; // 70% default volume
  private isUnlocked = false;

  constructor() {
    this.setupUnlockListeners();
  }

  private setupUnlockListeners() {
    const unlock = () => {
      if (this.isUnlocked) return;
      
      try {
        this.initContext();
        if (!this.audioCtx) return;

        // Play a silent dummy sound to force unlock on strict browsers (Safari/iOS)
        const dummyOsc = this.audioCtx.createOscillator();
        const dummyGain = this.audioCtx.createGain();
        dummyGain.gain.value = 0;
        dummyOsc.connect(dummyGain);
        dummyGain.connect(this.audioCtx.destination);
        dummyOsc.start(0);
        dummyOsc.stop(this.audioCtx.currentTime + 0.01);

        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume().then(() => {
            this.isUnlocked = true;
          }).catch(() => {});
        } else {
          this.isUnlocked = true;
        }

        // Cleanup
        document.removeEventListener("click", unlock);
        document.removeEventListener("keydown", unlock);
        document.removeEventListener("touchstart", unlock);
      } catch (e) {
        // ignore
      }
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
  }

  private initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  public play(): void {
    if (!this.isEnabled) return;
    
    try {
      this.initContext();
      if (!this.audioCtx) return;

      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Helper to play a single marimba/vibraphone style note
      const playNote = (freq: number, startTime: number) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.type = "sine";
        osc.frequency.value = freq;
        
        // Percussive attack with a long, soft, natural decay (2-4 seconds)
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(this.volume / 3, startTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, startTime + 3.0);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + 3.5);
      };

      // Microsoft Outlook style soft notification chime
      // A gentle, ascending corporate arpeggio that rings out
      playNote(523.25, now);        // C5
      playNote(659.25, now + 0.15); // E5
      playNote(783.99, now + 0.30); // G5
      playNote(1046.50, now + 0.45); // C6

    } catch (error) {
      console.warn("ReminderSoundService: Audio playback failed.", error);
    }
  }

  public stop(): void {
    // Current implementation uses one-shot oscillator, so no active stop required.
    // Prepared for future looping sounds.
  }

  public mute(mute: boolean): void {
    this.isEnabled = !mute;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }
}

export const reminderSoundService = new ReminderSoundService();
