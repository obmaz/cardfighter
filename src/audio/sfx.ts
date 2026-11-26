import type { BaseColor, CombatEffectEvent, TemporalStance } from '../types/game';

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

  public playElementalReaction(color: BaseColor | 'lantern' | 'void') {
    const base = color === 'red' ? 330 : color === 'green' ? 392 : 440;
    this.playTone(base, base * 1.5, 0.22, 'triangle', 0.18, 0);
    this.playTone(base * 1.25, base * 2, 0.26, 'sine', 0.16, 0.05);
    this.playTone(base * 0.5, base * 0.75, 0.24, 'sawtooth', 0.1, 0.02);
  }

  public playSynergyUltimate() {
    this.playTone(110, 55, 0.55, 'sawtooth', 0.2, 0);
    this.playTone(392, 523, 0.22, 'triangle', 0.16, 0.02);
    this.playTone(523, 659, 0.24, 'triangle', 0.16, 0.09);
    this.playTone(659, 1046, 0.42, 'sine', 0.2, 0.16);
    this.playTone(784, 1568, 0.45, 'sine', 0.14, 0.22);
  }

  public playPhaseTwo() {
    this.playTone(155, 48, 0.55, 'sawtooth', 0.24, 0);
    this.playTone(233, 72, 0.5, 'square', 0.14, 0.04);
    this.playTone(622, 466, 0.3, 'triangle', 0.15, 0.12);
  }

  public playTemporalShift(stance: TemporalStance) {
    if (stance === 'rewind') {
      this.playTone(784, 523, 0.18, 'sine', 0.12, 0);
      this.playTone(587, 392, 0.22, 'triangle', 0.1, 0.08);
    } else {
      this.playTone(440, 659, 0.16, 'sine', 0.12, 0);
      this.playTone(587, 880, 0.2, 'triangle', 0.1, 0.07);
    }
  }

  public playBossStagger() {
    this.playTone(880, 220, 0.26, 'square', 0.16, 0);
    this.playTone(660, 110, 0.34, 'sawtooth', 0.18, 0.04);
    this.playTone(1320, 990, 0.22, 'triangle', 0.14, 0.1);
  }

  public playChainFinisher() {
    this.playTone(440, 554, 0.14, 'triangle', 0.15, 0);
    this.playTone(554, 659, 0.15, 'triangle', 0.15, 0.06);
    this.playTone(659, 880, 0.28, 'sine', 0.19, 0.12);
    this.playTone(110, 55, 0.3, 'sine', 0.16, 0.12);
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
      case 'elemental_reaction':
        this.playElementalReaction(ev.color);
        break;
      case 'synergy_ultimate':
        this.playSynergyUltimate();
        break;
      case 'phase_two':
        this.playPhaseTwo();
        break;
      case 'boss_stagger':
        this.playBossStagger();
        break;
      case 'chain_finisher':
        this.playChainFinisher();
        break;
    }
  }
}

export const sfx = new SoundEngine();
