import type { BaseColor, CombatEffectEvent } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak = 0.18,
    delay = 0,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playScanBeep() {
    this.playTone(880, 1320, 0.08, 'sine', 0.12);
  }

  public playAttributeHit(color: BaseColor | 'lantern' | 'void', isBoost = false) {
    const pitchScale = isBoost ? 1.22 : 1.0;
    if (color === 'red') {
      this.playTone(170 * pitchScale, 55, 0.24, 'sawtooth', 0.22);
      this.playTone(95, 42, 0.28, 'triangle', 0.2);
    } else if (color === 'green') {
      this.playTone(540 * pitchScale, 240, 0.1, 'triangle', 0.16);
      this.playTone(720 * pitchScale, 320, 0.11, 'sine', 0.14, 0.06);
    } else if (color === 'blue') {
      this.playTone(392 * pitchScale, 784 * pitchScale, 0.22, 'sine', 0.16);
      this.playTone(587 * pitchScale, 1174, 0.24, 'triangle', 0.1, 0.04);
    } else if (color === 'lantern') {
      this.playTone(440, 880, 0.45, 'sawtooth', 0.16);
      this.playTone(659, 1318, 0.48, 'triangle', 0.18, 0.05);
      this.playTone(110, 55, 0.5, 'sine', 0.22, 0.05);
    } else {
      this.playTone(140, 60, 0.3, 'sawtooth', 0.2);
    }
  }

  public playShieldBreak() {
    this.playTone(920, 260, 0.22, 'square', 0.16);
    this.playTone(1480, 620, 0.28, 'triangle', 0.14, 0.04);
  }

  public playBossCounter() {
    this.playTone(120, 38, 0.36, 'sawtooth', 0.24);
    this.playTone(180, 52, 0.32, 'square', 0.12, 0.05);
  }

  public playDiceRoll() {
    this.playTone(460, 620, 0.05, 'triangle', 0.08, 0);
    this.playTone(520, 410, 0.05, 'triangle', 0.08, 0.06);
    this.playTone(680, 840, 0.07, 'sine', 0.1, 0.12);
  }

  public playEffect(ev: CombatEffectEvent) {
    switch (ev.kind) {
      case 'card_hit':
        this.playAttributeHit(ev.color, false);
        break;
      case 'boost_chain':
        this.playAttributeHit(ev.color, true);
        break;
      case 'shield_break':
        this.playShieldBreak();
        break;
      case 'lantern_beam':
        this.playAttributeHit('lantern', false);
        break;
      case 'boss_counter':
        this.playBossCounter();
        break;
      case 'dice_roll':
        this.playDiceRoll();
        break;
      case 'boss_unstable':
        this.playTone(330, 660, 0.25, 'sine', 0.14);
        break;
      case 'boss_enrage':
        this.playTone(220, 140, 0.28, 'sawtooth', 0.16);
        break;
      case 'blocked':
        this.playTone(260, 180, 0.14, 'square', 0.14);
        break;
      case 'exhaustion':
        this.playTone(293, 146, 0.35, 'triangle', 0.16);
        break;
      case 'challenge_clear':
        this.playTone(523, 784, 0.2, 'sine', 0.14);
        break;
    }
  }
}

export const sfx = new SoundEngine();
