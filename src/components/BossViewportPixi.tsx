import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BaseColor, BossState, CombatEffectEvent, DiceRollSummary } from '../types/game';
import { sfx } from '../audio/sfx';

interface BossViewportPixiProps {
  boss: BossState;
  effectQueue: CombatEffectEvent[];
  lastDiceRoll: DiceRollSummary | null;
}

interface Particle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleDecay: number;
}

interface SlashFx {
  gfx: Graphics;
  life: number;
  maxLife: number;
  expandSpeed: number;
}

interface FloatingLabel {
  text: Text;
  vy: number;
  life: number;
  maxLife: number;
}

const COLOR_HEX: Record<BaseColor | 'lantern' | 'void', number> = {
  red: 0xff4d4f,
  green: 0x36d399,
  blue: 0x38bdf8,
  lantern: 0xfbbf24,
  void: 0xc084fc,
};

const DICE_COLOR_BADGE: Record<string, { label: string; cls: string }> = {
  red: { label: '힘 +2', cls: 'die-red' },
  green: { label: '기교 +2', cls: 'die-green' },
  blue: { label: '지혜 +2', cls: 'die-blue' },
  wild: { label: '별빛 +2', cls: 'die-wild' },
  blank: { label: '공백 +0', cls: 'die-blank' },
};

export function BossViewportPixi({
  boss,
  effectQueue,
  lastDiceRoll,
}: BossViewportPixiProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bossRef = useRef<BossState>(boss);
  bossRef.current = boss;

  const processedIdRef = useRef<number>(0);
  const pendingEventsRef = useRef<CombatEffectEvent[]>([]);

  // Enqueue unseen events
  useEffect(() => {
    const fresh = effectQueue.filter((e) => e.id > processedIdRef.current);
    if (fresh.length > 0) {
      processedIdRef.current = fresh[fresh.length - 1].id;
      pendingEventsRef.current.push(...fresh);
      fresh.forEach((ev) => sfx.playEffect(ev));
    }
  }, [effectQueue]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    const app = new Application();

    const particles: Particle[] = [];
    const slashes: SlashFx[] = [];
    const floaters: FloatingLabel[] = [];

    let shakeTimer = 0;
    let shakeStrength = 0;
    let flashTimer = 0;
    let bossRecoil = 0;
    let elapsed = 0;

    const initPixi = async () => {
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        resizeTo: host,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      host.innerHTML = '';
      host.appendChild(app.canvas);
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';

      const world = new Container();
      const bgLayer = new Graphics();
      const bossLayer = new Container();
      const gearOuter = new Graphics();
      const gearInner = new Graphics();
      const bossBody = new Graphics();
      const barrierGfx = new Graphics();
      const fxLayer = new Container();
      const labelLayer = new Container();

      bossLayer.addChild(gearOuter, gearInner, bossBody, barrierGfx);
      world.addChild(bgLayer, bossLayer, fxLayer, labelLayer);
      app.stage.addChild(world);

      const spawnParticles = (
        cx: number,
        cy: number,
        hex: number,
        count: number,
        speed = 260,
      ) => {
        for (let i = 0; i < count; i++) {
          const g = new Graphics();
          const r = 2.5 + Math.random() * 4.5;
          g.circle(0, 0, r).fill({ color: hex, alpha: 0.95 });
          g.x = cx + (Math.random() - 0.5) * 24;
          g.y = cy + (Math.random() - 0.5) * 24;
          const angle = Math.random() * Math.PI * 2;
          const spd = speed * (0.35 + Math.random() * 0.85);
          fxLayer.addChild(g);
          particles.push({
            gfx: g,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 0.45 + Math.random() * 0.35,
            maxLife: 0.8,
            scaleDecay: 0.96,
          });
        }
      };

      const spawnSlash = (
        cx: number,
        cy: number,
        hex: number,
        kind: CombatEffectEvent['kind'],
      ) => {
        const g = new Graphics();
        g.x = cx;
        g.y = cy;

        if (kind === 'lantern_beam') {
          g.rect(-24, -220, 48, 440).fill({ color: 0xfef08a, alpha: 0.9 });
          g.rect(-56, -220, 112, 440).fill({ color: hex, alpha: 0.35 });
          g.circle(0, 0, 68).stroke({ width: 5, color: 0xffffff, alpha: 0.95 });
        } else if (kind === 'shield_break' || kind === 'boss_unstable') {
          g.circle(0, 0, 52).stroke({ width: 6, color: hex, alpha: 0.95 });
          g.circle(0, 0, 32).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
        } else if (kind === 'boss_counter') {
          g.circle(0, 0, 74).fill({ color: hex, alpha: 0.25 });
          g.circle(0, 0, 74).stroke({ width: 6, color: hex, alpha: 0.95 });
        } else {
          const rot = (Math.random() - 0.5) * 1.4;
          g.rotation = rot;
          g.moveTo(-95, -24)
            .quadraticCurveTo(0, 18, 95, -24)
            .quadraticCurveTo(0, -4, -95, -24)
            .fill({ color: 0xffffff, alpha: 0.95 });
          g.moveTo(-110, -30)
            .quadraticCurveTo(0, 26, 110, -30)
            .stroke({ width: 5, color: hex, alpha: 0.95 });
        }

        fxLayer.addChild(g);
        slashes.push({
          gfx: g,
          life: kind === 'lantern_beam' ? 0.55 : 0.32,
          maxLife: kind === 'lantern_beam' ? 0.55 : 0.32,
          expandSpeed: kind === 'shield_break' ? 3.2 : 1.4,
        });
      };

      const spawnFloater = (cx: number, cy: number, textStr: string, hex: number) => {
        const style = new TextStyle({
          fontFamily: 'Pretendard, Inter, system-ui, sans-serif',
          fontSize: 18,
          fontWeight: '800',
          fill: hex,
          stroke: { color: 0x090d16, width: 4 },
          dropShadow: {
            color: 0x000000,
            blur: 4,
            distance: 2,
            alpha: 0.8,
          },
        });
        const txt = new Text({ text: textStr, style });
        txt.anchor.set(0.5);
        txt.x = cx + (Math.random() - 0.5) * 40;
        txt.y = cy - 45 + (Math.random() - 0.5) * 20;
        labelLayer.addChild(txt);
        floaters.push({
          text: txt,
          vy: -52,
          life: 1.15,
          maxLife: 1.15,
        });
      };

      const drawBoss = (w: number, h: number, b: BossState) => {
        const cx = w * 0.5;
        const cy = h * 0.48;

        // Arena radial floor glow
        bgLayer.clear();
        const auraHex =
          b.id === 'kalos_prime'
            ? 0x7e22ce
            : b.isOverheated
              ? 0xef4444
              : b.isUnstable
                ? 0x38bdf8
                : 0xd97706;

        bgLayer.ellipse(cx, cy + 72, 145, 30).fill({ color: auraHex, alpha: 0.16 });
        bgLayer.ellipse(cx, cy + 72, 96, 18).stroke({
          width: 1.5,
          color: auraHex,
          alpha: 0.45,
        });

        bossLayer.x = cx + (Math.random() - 0.5) * bossRecoil * 12;
        bossLayer.y = cy + Math.sin(elapsed * 2.4) * 5;

        gearOuter.clear();
        gearInner.clear();
        bossBody.clear();
        barrierGfx.clear();

        if (b.id === 'vainglory_core') {
          // Outer rotating clockwork teeth
          const teeth = 12;
          for (let i = 0; i < teeth; i++) {
            const a = (i / teeth) * Math.PI * 2;
            const x1 = Math.cos(a) * 66;
            const y1 = Math.sin(a) * 66;
            const x2 = Math.cos(a) * 80;
            const y2 = Math.sin(a) * 80;
            gearOuter.moveTo(x1, y1).lineTo(x2, y2).stroke({
              width: 8,
              color: b.isOverheated ? 0xf97316 : 0xb45309,
              alpha: 0.85,
            });
          }
          gearOuter.circle(0, 0, 66).stroke({
            width: 5,
            color: 0xf59e0b,
            alpha: 0.75,
          });
          gearOuter.rotation = elapsed * (b.isOverheated ? 1.1 : 0.4);

          // Inner counter-rotating ring
          gearInner.circle(0, 0, 48).stroke({
            width: 3,
            color: b.isUnstable ? 0x38bdf8 : 0xfde68a,
            alpha: 0.8,
          });
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            gearInner
              .circle(Math.cos(a) * 48, Math.sin(a) * 48, 4)
              .fill({ color: 0xfef3c7 });
          }
          gearInner.rotation = -elapsed * 0.65;

          // Golem core crystal
          const coreColor =
            flashTimer > 0
              ? 0xffffff
              : b.isOverheated
                ? 0xff4d4f
                : b.isUnstable
                  ? 0x38bdf8
                  : 0xf59e0b;

          bossBody
            .moveTo(0, -40)
            .lineTo(32, -10)
            .lineTo(24, 34)
            .lineTo(-24, 34)
            .lineTo(-32, -10)
            .closePath()
            .fill({ color: 0x1e293b, alpha: 0.96 })
            .stroke({ width: 3, color: coreColor });

          bossBody
            .circle(0, 0, 16 + Math.sin(elapsed * 5) * 2)
            .fill({ color: coreColor, alpha: 0.9 });
          bossBody.circle(0, 0, 7).fill({ color: 0xffffff, alpha: 0.95 });
        } else {
          // Kalos Prime: Void Alchemist
          gearOuter.circle(0, 0, 74).stroke({
            width: 2,
            color: 0xa855f7,
            alpha: 0.55,
          });
          // 3 Orbiting Flasks / Void Orbs
          for (let i = 0; i < 3; i++) {
            const a = elapsed * 0.9 + (i * Math.PI * 2) / 3;
            const ox = Math.cos(a) * 74;
            const oy = Math.sin(a) * 52;
            const isFilled = i < b.voidGauge;
            gearOuter
              .circle(ox, oy, 9)
              .fill({ color: isFilled ? 0xe879f9 : 0x1e1b4b, alpha: 0.95 })
              .stroke({ width: 2, color: 0x38bdf8 });
          }

          // Hooded alchemist silhouette
          const bodyGlow = flashTimer > 0 ? 0xffffff : 0xa855f7;
          bossBody
            .moveTo(0, -46)
            .lineTo(36, 26)
            .lineTo(0, 42)
            .lineTo(-36, 26)
            .closePath()
            .fill({ color: 0x17153b, alpha: 0.96 })
            .stroke({ width: 3, color: bodyGlow });

          bossBody
            .circle(-10, -8, 4.5)
            .fill({ color: 0x38bdf8 })
            .circle(10, -8, 4.5)
            .fill({ color: 0x38bdf8 });

          // Invulnerability Hex Barrier
          if (b.invulnerable) {
            for (let i = 0; i < 6; i++) {
              const a1 = (i / 6) * Math.PI * 2 + elapsed * 0.25;
              const a2 = ((i + 1) / 6) * Math.PI * 2 + elapsed * 0.25;
              barrierGfx
                .moveTo(Math.cos(a1) * 62, Math.sin(a1) * 62)
                .lineTo(Math.cos(a2) * 62, Math.sin(a2) * 62)
                .stroke({ width: 3, color: 0xc084fc, alpha: 0.78 });
            }
            barrierGfx.circle(0, 0, 62).fill({ color: 0xa855f7, alpha: 0.1 });
          }
        }
      };

      app.ticker.add((ticker) => {
        if (destroyed) return;
        const dt = ticker.deltaMS / 1000;
        elapsed += dt;

        const w = app.screen.width;
        const h = app.screen.height;
        const cx = w * 0.5;
        const cy = h * 0.48;

        // Process queued FX events
        while (pendingEventsRef.current.length > 0) {
          const ev = pendingEventsRef.current.shift()!;
          const hex = COLOR_HEX[ev.color] ?? 0xffffff;
          if (ev.kind === 'card_hit' || ev.kind === 'boost_chain') {
            shakeTimer = 0.2;
            shakeStrength = ev.kind === 'boost_chain' ? 9 : 6;
            flashTimer = 0.08;
            bossRecoil = 1.0;
            spawnSlash(cx, cy, hex, ev.kind);
            spawnParticles(cx, cy, hex, ev.kind === 'boost_chain' ? 36 : 24, 280);
            spawnFloater(cx, cy, ev.label, hex);
          } else if (ev.kind === 'lantern_beam') {
            shakeTimer = 0.4;
            shakeStrength = 14;
            flashTimer = 0.14;
            bossRecoil = 1.5;
            spawnSlash(cx, cy, 0xfbbf24, 'lantern_beam');
            spawnParticles(cx, cy, 0xfbbf24, 56, 360);
            spawnFloater(cx, cy, ev.label, 0xfef08a);
          } else if (ev.kind === 'shield_break') {
            shakeTimer = 0.25;
            shakeStrength = 8;
            spawnSlash(cx, cy, hex, 'shield_break');
            spawnParticles(cx, cy, hex, 32, 310);
            spawnFloater(cx, cy - 20, ev.label, 0xffffff);
          } else if (ev.kind === 'boss_counter') {
            shakeTimer = 0.35;
            shakeStrength = 11;
            spawnSlash(cx, cy, hex, 'boss_counter');
            spawnParticles(cx, cy, hex, 30, 260);
            spawnFloater(cx, cy, ev.label, 0xff6b6b);
          } else {
            spawnParticles(cx, cy, hex, 16, 180);
            spawnFloater(cx, cy - 16, ev.label, hex);
          }
        }

        // Camera shake
        if (shakeTimer > 0) {
          shakeTimer = Math.max(0, shakeTimer - dt);
          world.x = (Math.random() - 0.5) * shakeStrength * 2;
          world.y = (Math.random() - 0.5) * shakeStrength * 2;
        } else {
          world.x = 0;
          world.y = 0;
        }

        flashTimer = Math.max(0, flashTimer - dt);
        bossRecoil = Math.max(0, bossRecoil - dt * 5);

        drawBoss(w, h, bossRef.current);

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= dt;
          p.gfx.x += p.vx * dt;
          p.gfx.y += p.vy * dt;
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.gfx.alpha = Math.max(0, p.life / p.maxLife);
          p.gfx.scale.set(p.gfx.scale.x * p.scaleDecay);
          if (p.life <= 0) {
            p.gfx.destroy();
            particles.splice(i, 1);
          }
        }

        // Update slashes
        for (let i = slashes.length - 1; i >= 0; i--) {
          const s = slashes[i];
          s.life -= dt;
          const progress = 1 - s.life / s.maxLife;
          s.gfx.scale.set(1 + progress * s.expandSpeed * 0.45);
          s.gfx.alpha = Math.max(0, s.life / s.maxLife);
          if (s.life <= 0) {
            s.gfx.destroy();
            slashes.splice(i, 1);
          }
        }

        // Update floating labels
        for (let i = floaters.length - 1; i >= 0; i--) {
          const f = floaters[i];
          f.life -= dt;
          f.text.y += f.vy * dt;
          f.text.alpha = Math.min(1, (f.life / f.maxLife) * 1.4);
          if (f.life <= 0) {
            f.text.destroy();
            floaters.splice(i, 1);
          }
        }
      });
    };

    void initPixi();

    return () => {
      destroyed = true;
      try {
        app.destroy(true);
      } catch {
        // Ignore teardown race if init was aborted mid-flight
      }
    };
  }, []);

  return (
    <div className="boss-viewport">
      <div ref={hostRef} className="boss-pixi-canvas" />

      {/* Shield Slots Overlay */}
      <div className="shield-bar-overlay">
        <ShieldPill
          label="RED"
          value={boss.shields.red}
          max={boss.maxShields.red}
          color="red"
        />
        <ShieldPill
          label="GREEN"
          value={boss.shields.green}
          max={boss.maxShields.green}
          color="green"
        />
        <ShieldPill
          label={boss.id === 'kalos_prime' ? 'BLUE · 플라스크' : 'BLUE'}
          value={boss.shields.blue}
          max={boss.maxShields.blue}
          color="blue"
        />
      </div>

      {/* Boss Badges */}
      <div className="boss-state-badges">
        {boss.invulnerable && (
          <span className="status-chip chip-void">무적 결계</span>
        )}
        {boss.isUnstable && (
          <span className="status-chip chip-unstable">불안정 ×1.5</span>
        )}
        {boss.isOverheated && (
          <span className="status-chip chip-overheat">과열 +2</span>
        )}
        {boss.id === 'kalos_prime' && boss.voidGauge > 0 && (
          <span className="status-chip chip-void">
            공허 {boss.voidGauge}/3
          </span>
        )}
      </div>

      {/* 4-Dice Auto Roll Result Overlay */}
      {lastDiceRoll && (
        <div key={lastDiceRoll.id} className="dice-tray-overlay">
          <span className="dice-tray-title">주사위 +{lastDiceRoll.totalBonus}</span>
          <div className="dice-list">
            {lastDiceRoll.results.map((die) => {
              const info = DICE_COLOR_BADGE[die.face] ?? DICE_COLOR_BADGE.blank;
              return (
                <span key={die.index} className={`die-chip ${info.cls}`}>
                  {info.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldPill({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: BaseColor;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`shield-pill shield-${color} ${value === 0 ? 'shield-broken' : ''}`}>
      <div className="shield-pill-top">
        <span>{label}</span>
        <strong>{value === 0 ? '파괴!' : `${value}/${max}`}</strong>
      </div>
      <div className="shield-progress-track">
        <div className="shield-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
