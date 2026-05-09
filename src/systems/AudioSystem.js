// ============================================================
// REVESVOIR — Audio & Haptics System
// Generative ambient audio + interaction sounds + haptic feedback
// All synthesized in real-time, no audio files needed
// ============================================================

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.droneGain = null;
    this.droneOscillators = [];
    this.muted = false;
    this.initialized = false;
    this.droneRunning = false;
  }

  // Must be called from a user gesture (click/touch)
  init() {
    if (this.initialized) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0;
      this.droneGain.connect(this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.log('Audio not available:', e);
    }
  }

  // Resume context if suspended (browsers require user gesture)
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // === AMBIENT DRONE ===
  // Low, evolving tones that create a sense of depth
  startDrone() {
    if (!this.initialized || this.droneRunning) return;
    this.droneRunning = true;

    const now = this.ctx.currentTime;

    // Base drone: very low frequency, barely audible
    const freqs = [55, 82.5, 110, 165]; // A1, E2, A2, E3 — open fifths
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;
      // Gentle detune for organic feel
      osc.detune.value = (Math.random() - 0.5) * 8;

      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(
        i === 0 ? 0.08 : i === 1 ? 0.04 : 0.02,
        now + 3 + i * 0.5
      );

      osc.connect(gain);
      gain.connect(this.droneGain);
      osc.start(now);

      this.droneOscillators.push({ osc, gain });
    });

    // Fade in the drone channel
    this.droneGain.gain.linearRampToValueAtTime(1, now + 4);

    // Slow LFO modulation on the drone volume for breathing feel
    this._droneBreathInterval = setInterval(() => {
      if (!this.droneRunning || this.muted) return;
      const t = this.ctx.currentTime;
      const breath = 0.7 + Math.sin(t * 0.15) * 0.3; // very slow
      this.droneGain.gain.linearRampToValueAtTime(breath, t + 2);
    }, 2000);
  }

  stopDrone() {
    if (!this.initialized) return;
    this.droneRunning = false;

    const now = this.ctx.currentTime;
    this.droneGain.gain.linearRampToValueAtTime(0, now + 3);

    clearInterval(this._droneBreathInterval);

    setTimeout(() => {
      this.droneOscillators.forEach(({ osc }) => {
        try { osc.stop(); } catch (e) {}
      });
      this.droneOscillators = [];
    }, 4000);
  }

  // === INTERACTION SOUNDS ===

  // Soft tonal ping — used for linking words, depositing fragments
  playLink() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Random note from a pentatonic scale for variety
    const notes = [440, 523.25, 587.33, 659.25, 783.99]; // A4 C5 D5 E5 G5
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
    osc.type = 'sine';

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  // Deeper, warmer tone — used when AI generates a new word
  playEmerge() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    // Two harmonically related tones for richness
    [261.63, 392].forEach((freq, i) => { // C4, G4
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.value = freq;
      osc.type = i === 0 ? 'sine' : 'triangle';

      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.1 : 0.04, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.6);
    });
  }

  // Quick, satisfying tick — used for pile sort, card sorting
  playTick() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.value = 800 + Math.random() * 200;
    osc.type = 'sine';

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Rising tone — used for completing an exercise, revelation moments
  playReveal() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    [220, 277.18, 329.63, 440].forEach((freq, i) => { // A3 C#4 E4 A4 — A major chord ascending
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const delay = i * 0.15;

      osc.frequency.value = freq;
      osc.type = 'sine';

      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.08, now + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + delay);
      osc.stop(now + delay + 2.1);
    });
  }

  // Timer tick — subtle pulse for countdown
  playTimerTick() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.value = 600;
    osc.type = 'sine';

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.03, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Ripple sound — maps to water ripple visual
  playRipple(strength = 0.5) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = 150 + strength * 100;
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);

    filter.type = 'lowpass';
    filter.frequency.value = 400;

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05 * strength, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  // === MUTE CONTROL ===
  toggleMute() {
    this.muted = !this.muted;
    if (this.initialized) {
      this.masterGain.gain.linearRampToValueAtTime(
        this.muted ? 0 : 0.3,
        this.ctx.currentTime + 0.5
      );
    }
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.initialized) {
      this.masterGain.gain.linearRampToValueAtTime(
        this.muted ? 0 : 0.3,
        this.ctx.currentTime + 0.5
      );
    }
  }
}

// === HAPTIC FEEDBACK ===
export const haptics = {
  // Light tap — word selection, button press
  tap() {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  },

  // Medium pulse — linking words, depositing
  pulse() {
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }
  },

  // Double tap — new word emerging
  doubleTap() {
    if (navigator.vibrate) {
      navigator.vibrate([15, 50, 15]);
    }
  },

  // Rising pattern — exercise complete, reveal
  reveal() {
    if (navigator.vibrate) {
      navigator.vibrate([10, 30, 15, 30, 20, 30, 30]);
    }
  },

  // Subtle tick — timer, sorting
  tick() {
    if (navigator.vibrate) {
      navigator.vibrate(5);
    }
  },
};
