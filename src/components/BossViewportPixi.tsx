import { useEffect, useRef, useState } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from 'pixi.js';
import type {
  BaseColor,
  BossId,
  BossState,
  CombatEffectEvent,
  DiceRollSummary,
  ScanLogEntry,
  TemporalStance,
} from '../types/game';
import { sfx } from '../audio/sfx';

interface BossViewportPixiProps {
  boss: BossState;
  effectQueue: CombatEffectEvent[];
  lastDiceRoll: DiceRollSummary | null;
  latestLog?: ScanLogEntry | null;
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

const PRIMER_META: Record<BaseColor, { title: string; comboHint: string; cls: string }> = {
  red: {
    title: '불꽃 대기',
    comboHint: '+파랑=융해 · +초록=파쇄',
    cls: 'primer-red',
  },
  green: {
    title: '기교 대기',
    comboHint: '+빨강=파쇄 · +파랑=균열',
    cls: 'primer-green',
  },
  blue: {
    title: '지혜 대기',
    comboHint: '+빨강=융해 · +초록=균열',
    cls: 'primer-blue',
  },
};

function getReactionHues(ev: CombatEffectEvent): [number, number] {
  if (ev.label.includes('융해')) return [COLOR_HEX.red, COLOR_HEX.blue];
  if (ev.label.includes('균열')) return [COLOR_HEX.blue, COLOR_HEX.green];
  if (ev.label.includes('파쇄')) return [COLOR_HEX.red, COLOR_HEX.green];
  return [COLOR_HEX[ev.color] ?? 0xffffff, COLOR_HEX.lantern];
}

async function tryLoadTexture(url: string): Promise<Texture | null> {
  try {
    const tex = await Assets.load<Texture>(url);
    return tex ?? null;
  } catch {
    return null;
  }
}

export function BossViewportPixi({
  boss,
  effectQueue,
  lastDiceRoll,
  latestLog = null,
}: BossViewportPixiProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bossRef = useRef<BossState>(boss);
  bossRef.current = boss;

  const processedIdRef = useRef<number>(0);
  const pendingEventsRef = useRef<CombatEffectEvent[]>([]);
  const prevStanceRef = useRef<{ bossId: BossId; stance: TemporalStance | null }>({
    bossId: boss.id,
    stance: boss.temporalStance,
  });

  const [visibleCutIn, setVisibleCutIn] = useState<ScanLogEntry | null>(null);

  // Reset event tracking on raid restart / boss switch
  useEffect(() => {
    processedIdRef.current = 0;
    pendingEventsRef.current = [];
  }, [boss.id]);

  // Enqueue unseen events (and reset cursor when effectQueue restarts from id 1)
  useEffect(() => {
    if (effectQueue.length === 0) {
      processedIdRef.current = 0;
      pendingEventsRef.current = [];
      return;
    }
    const maxId = effectQueue[effectQueue.length - 1].id;
    if (maxId < processedIdRef.current) {
      processedIdRef.current = 0;
      pendingEventsRef.current = [];
    }
    const fresh = effectQueue.filter((e) => e.id > processedIdRef.current);
    if (fresh.length > 0) {
      processedIdRef.current = fresh[fresh.length - 1].id;
      pendingEventsRef.current.push(...fresh);
      fresh.forEach((ev) => sfx.playEffect(ev));
    }
  }, [effectQueue]);

  // Subtle temporal chime when Chronos Wyrm flips stance
  useEffect(() => {
    const prev = prevStanceRef.current;
    if (
      prev.bossId === boss.id &&
      boss.id === 'chronos_wyrm' &&
      boss.temporalStance &&
      prev.stance !== boss.temporalStance
    ) {
      sfx.playTemporalShift(boss.temporalStance);
    }
    prevStanceRef.current = { bossId: boss.id, stance: boss.temporalStance };
  }, [boss.id, boss.temporalStance]);

  // Auto-fading skill cut-in toast
  useEffect(() => {
    if (!latestLog) {
      setVisibleCutIn(null);
      return;
    }
    setVisibleCutIn(latestLog);
    const timer = window.setTimeout(() => {
      setVisibleCutIn((cur) => (cur?.id === latestLog.id ? null : cur));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [latestLog?.id]);

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
      const backdropLayer = new Container();
      const bgLayer = new Graphics();
      const bossLayer = new Container();
      const phase2Aura = new Graphics();
      const gearOuter = new Graphics();
      const gearInner = new Graphics();
      const bossBody = new Graphics();
      const bossArtHolder = new Container();
      const bossMask = new Graphics();
      bossMask.circle(0, 0, 72).fill({ color: 0xffffff });
      bossArtHolder.mask = bossMask;
      const bossFlashOverlay = new Graphics();
      bossFlashOverlay.circle(0, 0, 72).fill({ color: 0xffffff, alpha: 0.72 });
      bossFlashOverlay.visible = false;
      const barrierGfx = new Graphics();
      const staggerRingGfx = new Graphics();
      const fxLayer = new Container();
      const labelLayer = new Container();

      bossLayer.addChild(
        phase2Aura,
        gearOuter,
        gearInner,
        bossBody,
        bossMask,
        bossArtHolder,
        bossFlashOverlay,
        barrierGfx,
        staggerRingGfx,
      );
      world.addChild(backdropLayer, bgLayer, bossLayer, fxLayer, labelLayer);
      app.stage.addChild(world);

      let arenaBgSprite: Sprite | null = null;
      const bossTextures: Partial<Record<BossId, Texture>> = {};
      let activeSpriteBossId: BossId | null = null;
      let activeBossSprite: Sprite | null = null;

      void Promise.all([
        tryLoadTexture('./assets/arena_bg.jpg'),
        tryLoadTexture('./assets/vainglory_core.jpg'),
        tryLoadTexture('./assets/kalos_prime.jpg'),
        tryLoadTexture('./assets/chronos_wyrm.jpg'),
      ]).then(([bgTex, vainTex, kalosTex, chronoTex]) => {
        if (destroyed) return;
        if (bgTex) {
          arenaBgSprite = new Sprite(bgTex);
          arenaBgSprite.anchor.set(0.5);
          arenaBgSprite.alpha = 0.9;
          arenaBgSprite.tint = 0xffffff;
          backdropLayer.addChild(arenaBgSprite);
        }
        if (vainTex) bossTextures.vainglory_core = vainTex;
        if (kalosTex) bossTextures.kalos_prime = kalosTex;
        if (chronoTex) bossTextures.chronos_wyrm = chronoTex;
      });

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
        secondaryHex?: number,
      ) => {
        const g = new Graphics();
        g.x = cx;
        g.y = cy;

        if (kind === 'lantern_beam') {
          g.rect(-24, -220, 48, 440).fill({ color: 0xfef08a, alpha: 0.9 });
          g.rect(-56, -220, 112, 440).fill({ color: hex, alpha: 0.35 });
          g.circle(0, 0, 68).stroke({ width: 5, color: 0xffffff, alpha: 0.95 });
        } else if (kind === 'elemental_reaction') {
          const hue2 = secondaryHex ?? 0xfbbf24;
          g.circle(0, 0, 46).stroke({ width: 6, color: hex, alpha: 0.95 });
          g.circle(0, 0, 64).stroke({ width: 5, color: hue2, alpha: 0.9 });
          g.circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.35 });
        } else if (kind === 'synergy_ultimate') {
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const rayColor = i % 3 === 0 ? 0xfbbf24 : i % 3 === 1 ? 0x38bdf8 : 0xf472b6;
            g.moveTo(0, 0)
              .lineTo(Math.cos(a) * 140, Math.sin(a) * 140)
              .stroke({ width: 5, color: rayColor, alpha: 0.9 });
          }
          g.circle(0, 0, 56).stroke({ width: 6, color: 0xfef08a, alpha: 0.95 });
          g.circle(0, 0, 82).stroke({ width: 4, color: 0x38bdf8, alpha: 0.85 });
        } else if (kind === 'chain_finisher') {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const rayColor = i % 2 === 0 ? hex : 0xfbbf24;
            g.moveTo(0, 0)
              .lineTo(Math.cos(a) * 118, Math.sin(a) * 118)
              .stroke({ width: 5, color: rayColor, alpha: 0.92 });
          }
          g.circle(0, 0, 52).stroke({ width: 6, color: hex, alpha: 0.95 });
          g.circle(0, 0, 74).stroke({ width: 4, color: 0xfef08a, alpha: 0.88 });
        } else if (kind === 'phase_two' || kind === 'boss_stagger') {
          g.circle(0, 0, 58).fill({ color: hex, alpha: 0.28 });
          g.circle(0, 0, 70).stroke({ width: 7, color: hex, alpha: 0.95 });
          g.circle(0, 0, 92).stroke({ width: 4, color: 0xfef08a, alpha: 0.8 });
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

        const life =
          kind === 'lantern_beam' || kind === 'synergy_ultimate'
            ? 0.62
            : kind === 'elemental_reaction' ||
                kind === 'phase_two' ||
                kind === 'boss_stagger' ||
                kind === 'chain_finisher'
              ? 0.48
              : 0.32;
        const expandSpeed =
          kind === 'synergy_ultimate'
            ? 2.8
            : kind === 'elemental_reaction' ||
                kind === 'phase_two' ||
                kind === 'boss_stagger' ||
                kind === 'chain_finisher' ||
                kind === 'shield_break'
              ? 3.2
              : 1.4;

        fxLayer.addChild(g);
        slashes.push({
          gfx: g,
          life,
          maxLife: life,
          expandSpeed,
        });
      };

      const spawnFloater = (
        cx: number,
        cy: number,
        textStr: string,
        hex: number,
        fontSize = 18,
      ) => {
        const style = new TextStyle({
          fontFamily: 'Pretendard, Inter, system-ui, sans-serif',
          fontSize,
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
          life: 1.25,
          maxLife: 1.25,
        });
      };

      const drawBoss = (w: number, h: number, b: BossState) => {
        const cx = w * 0.5;
        const cy = h * 0.48;
        const isPhase2 = b.phase === 2;
        const speedMult = isPhase2 ? 1.85 : 1;

        if (arenaBgSprite) {
          const texW = arenaBgSprite.texture.width || 1;
          const texH = arenaBgSprite.texture.height || 1;
          const scale = Math.max(w / texW, h / texH);
          arenaBgSprite.x = w * 0.5;
          arenaBgSprite.y = h * 0.5;
          arenaBgSprite.scale.set(scale);
          arenaBgSprite.tint = isPhase2
            ? b.id === 'kalos_prime'
              ? 0xf3e8ff
              : b.id === 'chronos_wyrm'
                ? 0xe0f2fe
                : 0xffe4e6
            : 0xffffff;
        }

        // Sync optional boss portrait sprite inside circular medallion
        const tex = bossTextures[b.id];
        if (tex && activeSpriteBossId !== b.id) {
          bossArtHolder.removeChildren().forEach((c) => c.destroy());
          const spr = new Sprite(tex);
          spr.anchor.set(0.5);
          const scale = 152 / Math.min(tex.width || 152, tex.height || 152);
          spr.scale.set(scale);
          bossArtHolder.addChild(spr);
          activeBossSprite = spr;
          activeSpriteBossId = b.id;
        } else if (!tex && activeBossSprite && activeSpriteBossId !== b.id) {
          bossArtHolder.removeChildren().forEach((c) => c.destroy());
          activeBossSprite = null;
          activeSpriteBossId = null;
        }

        if (activeBossSprite) {
          activeBossSprite.tint = isPhase2
            ? b.id === 'kalos_prime'
              ? 0xe9d5ff
              : b.id === 'chronos_wyrm'
                ? 0xbae6fd
                : 0xffd1c1
            : 0xffffff;
        }
        const hasSprite = Boolean(activeBossSprite);
        bossFlashOverlay.visible = flashTimer > 0;

        // Arena radial floor glow
        bgLayer.clear();
        const auraHex = isPhase2
          ? b.id === 'kalos_prime'
            ? 0xa855f7
            : b.id === 'chronos_wyrm'
              ? 0x0ea5e9
              : 0xef4444
          : b.id === 'kalos_prime'
            ? 0x7e22ce
            : b.id === 'chronos_wyrm'
              ? b.temporalStance === 'rewind'
                ? 0x38bdf8
                : 0xf59e0b
              : b.isOverheated
                ? 0xef4444
                : b.isUnstable
                  ? 0x38bdf8
                  : 0xd97706;

        bgLayer.ellipse(cx, cy + 74, 155, 32).fill({
          color: auraHex,
          alpha: isPhase2 ? 0.26 : 0.16,
        });
        bgLayer.ellipse(cx, cy + 74, 102, 20).stroke({
          width: isPhase2 ? 2.5 : 1.5,
          color: auraHex,
          alpha: isPhase2 ? 0.72 : 0.45,
        });

        bossLayer.x = cx + (Math.random() - 0.5) * bossRecoil * 12;
        bossLayer.y =
          cy +
          (b.staggered ? 6 : Math.sin(elapsed * (isPhase2 ? 3.8 : 2.4)) * 5);

        phase2Aura.clear();
        gearOuter.clear();
        gearInner.clear();
        bossBody.clear();
        barrierGfx.clear();
        staggerRingGfx.clear();

        if (b.staggered) {
          staggerRingGfx
            .ellipse(0, -56, 36, 10)
            .stroke({ width: 2.5, color: 0xfbbf24, alpha: 0.9 });
          for (let i = 0; i < 3; i++) {
            const a = elapsed * 3.8 + (i * Math.PI * 2) / 3;
            const sx = Math.cos(a) * 36;
            const sy = -56 + Math.sin(a) * 10;
            staggerRingGfx.circle(sx, sy, 4).fill({ color: 0xfef08a, alpha: 0.98 });
          }
        }

        if (isPhase2) {
          const pulseR = 96 + Math.sin(elapsed * 6) * 6;
          const p2Color =
            b.id === 'kalos_prime'
              ? 0xc084fc
              : b.id === 'chronos_wyrm'
                ? 0x38bdf8
                : 0xff4d4f;
          phase2Aura.circle(0, 0, pulseR).stroke({
            width: 3,
            color: p2Color,
            alpha: 0.55 + Math.sin(elapsed * 6) * 0.2,
          });
          phase2Aura.circle(0, 0, pulseR - 10).fill({
            color: p2Color,
            alpha: 0.1,
          });
        }

        if (b.id === 'vainglory_core') {
          const teeth = 12;
          for (let i = 0; i < teeth; i++) {
            const a = (i / teeth) * Math.PI * 2;
            const x1 = Math.cos(a) * 86;
            const y1 = Math.sin(a) * 86;
            const x2 = Math.cos(a) * 98;
            const y2 = Math.sin(a) * 98;
            gearOuter.moveTo(x1, y1).lineTo(x2, y2).stroke({
              width: 7,
              color: b.isOverheated || isPhase2 ? 0xf97316 : 0xd97706,
              alpha: 0.92,
            });
          }
          gearOuter.circle(0, 0, 86).stroke({
            width: 4,
            color: isPhase2 ? 0xff4d4f : 0xf59e0b,
            alpha: 0.88,
          });
          gearOuter.rotation = elapsed * (b.isOverheated ? 1.1 : 0.4) * speedMult;

          gearInner.circle(0, 0, 77).stroke({
            width: 2.5,
            color: b.isUnstable ? 0x38bdf8 : isPhase2 ? 0xfca5a5 : 0xfde68a,
            alpha: 0.9,
          });
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            gearInner
              .circle(Math.cos(a) * 77, Math.sin(a) * 77, 4)
              .fill({ color: 0xfef3c7 });
          }
          gearInner.rotation = -elapsed * 0.65 * speedMult;

          if (!hasSprite) {
            const coreColor =
              flashTimer > 0
                ? 0xffffff
                : b.isOverheated || isPhase2
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
            bossBody.circle(0, 0, 73).stroke({
              width: 3.5,
              color: isPhase2 ? 0xff4d4f : 0xf59e0b,
              alpha: 0.95,
            });
          }
        } else if (b.id === 'chronos_wyrm') {
          // Chronos Wyrm: Concentric golden-cyan time rings + hourglass core
          const dir = b.temporalStance === 'rewind' ? -1 : 1;
          const primaryRing = b.temporalStance === 'rewind' ? 0x38bdf8 : 0xfbbf24;
          const secondaryRing = b.temporalStance === 'rewind' ? 0xfbbf24 : 0x38bdf8;

          gearOuter.circle(0, 0, 92).stroke({
            width: 3,
            color: primaryRing,
            alpha: 0.82,
          });
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const inner = i % 3 === 0 ? 82 : 87;
            gearOuter
              .moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
              .lineTo(Math.cos(a) * 95, Math.sin(a) * 95)
              .stroke({ width: i % 3 === 0 ? 3 : 1.5, color: primaryRing, alpha: 0.92 });
          }
          gearOuter.rotation = elapsed * 0.55 * dir * speedMult;

          gearInner.circle(0, 0, 79).stroke({
            width: 2.5,
            color: secondaryRing,
            alpha: 0.88,
          });
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            gearInner
              .circle(Math.cos(a) * 79, Math.sin(a) * 79, 4.5)
              .fill({ color: secondaryRing });
          }
          gearInner.rotation = -elapsed * 0.9 * dir * speedMult;

          if (!hasSprite) {
            const coreHue = flashTimer > 0 ? 0xffffff : primaryRing;
            // Hourglass silhouette
            bossBody
              .moveTo(-26, -34)
              .lineTo(26, -34)
              .lineTo(6, 0)
              .lineTo(26, 34)
              .lineTo(-26, 34)
              .lineTo(-6, 0)
              .closePath()
              .fill({ color: 0x0f172a, alpha: 0.96 })
              .stroke({ width: 3, color: coreHue });
            bossBody.circle(0, 0, 9 + Math.sin(elapsed * 4) * 1.5).fill({
              color: secondaryRing,
              alpha: 0.95,
            });
          } else {
            bossBody.circle(0, 0, 73).stroke({
              width: 3.5,
              color: primaryRing,
              alpha: 0.95,
            });
          }
        } else {
          // Kalos Prime: Void Alchemist
          gearOuter.circle(0, 0, 90).stroke({
            width: 2.5,
            color: isPhase2 ? 0xe879f9 : 0x8b5cf6,
            alpha: 0.72,
          });
          for (let i = 0; i < 3; i++) {
            const a = elapsed * 0.9 * speedMult + (i * Math.PI * 2) / 3;
            const ox = Math.cos(a) * 90;
            const oy = Math.sin(a) * 68;
            const isFilled = i < b.voidGauge;
            gearOuter
              .circle(ox, oy, 8.5)
              .fill({ color: isFilled ? 0xe879f9 : 0xffffff, alpha: 0.95 })
              .stroke({ width: 2.5, color: 0x38bdf8 });
          }

          if (!hasSprite) {
            const bodyGlow = flashTimer > 0 ? 0xffffff : isPhase2 ? 0xe879f9 : 0xa855f7;
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
          } else {
            bossBody.circle(0, 0, 73).stroke({
              width: 3.5,
              color: isPhase2 ? 0xe879f9 : 0x8b5cf6,
              alpha: 0.95,
            });
          }

          if (b.invulnerable) {
            for (let i = 0; i < 6; i++) {
              const a1 = (i / 6) * Math.PI * 2 + elapsed * 0.25 * speedMult;
              const a2 = ((i + 1) / 6) * Math.PI * 2 + elapsed * 0.25 * speedMult;
              barrierGfx
                .moveTo(Math.cos(a1) * 84, Math.sin(a1) * 84)
                .lineTo(Math.cos(a2) * 84, Math.sin(a2) * 84)
                .stroke({ width: 3.5, color: 0x7c3aed, alpha: 0.85 });
            }
            barrierGfx.circle(0, 0, 84).fill({ color: 0xa855f7, alpha: 0.1 });
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
          } else if (ev.kind === 'elemental_reaction') {
            const [hue1, hue2] = getReactionHues(ev);
            shakeTimer = 0.34;
            shakeStrength = 12;
            flashTimer = 0.12;
            bossRecoil = 1.3;
            spawnSlash(cx, cy, hue1, 'elemental_reaction', hue2);
            spawnParticles(cx, cy, hue1, 28, 340);
            spawnParticles(cx, cy, hue2, 28, 340);
            spawnFloater(cx, cy - 10, ev.label, 0xfef08a, 21);
          } else if (ev.kind === 'synergy_ultimate') {
            shakeTimer = 0.5;
            shakeStrength = 16;
            flashTimer = 0.18;
            bossRecoil = 1.8;
            spawnSlash(cx, cy, 0xfbbf24, 'synergy_ultimate');
            spawnParticles(cx, cy, 0xfbbf24, 34, 420);
            spawnParticles(cx, cy, 0x38bdf8, 24, 380);
            spawnParticles(cx, cy, 0xf472b6, 20, 360);
            spawnFloater(cx, cy - 14, ev.label, 0xfef08a, 22);
          } else if (ev.kind === 'phase_two') {
            const p2Hex =
              bossRef.current.id === 'kalos_prime'
                ? 0xc084fc
                : bossRef.current.id === 'chronos_wyrm'
                  ? 0x38bdf8
                  : 0xff4d4f;
            shakeTimer = 0.55;
            shakeStrength = 15;
            flashTimer = 0.16;
            bossRecoil = 1.4;
            spawnSlash(cx, cy, p2Hex, 'phase_two');
            spawnParticles(cx, cy, p2Hex, 44, 360);
            spawnParticles(cx, cy, 0xfbbf24, 18, 280);
            spawnFloater(cx, cy - 16, ev.label, 0xfca5a5, 21);
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
          } else if (ev.kind === 'chain_finisher') {
            shakeTimer = 0.36;
            shakeStrength = 12;
            flashTimer = 0.14;
            bossRecoil = 1.45;
            spawnSlash(cx, cy, hex, 'chain_finisher');
            spawnParticles(cx, cy, hex, 28, 350);
            spawnParticles(cx, cy, 0xfbbf24, 16, 320);
            spawnFloater(cx, cy - 12, ev.label, 0xfef08a, 20);
          } else if (ev.kind === 'boss_stagger') {
            shakeTimer = 0.45;
            shakeStrength = 14;
            flashTimer = 0.16;
            bossRecoil = 1.6;
            spawnSlash(cx, cy, 0xfbbf24, 'boss_stagger');
            spawnParticles(cx, cy, 0xfbbf24, 40, 360);
            spawnParticles(cx, cy, 0xffffff, 18, 280);
            spawnFloater(cx, cy - 18, ev.label, 0xfef08a, 21);
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

  const primer = boss.primedElement ? PRIMER_META[boss.primedElement] : null;

  return (
    <div className={`boss-viewport ${boss.phase === 2 ? 'viewport-phase2' : ''}`}>
      <div ref={hostRef} className="boss-pixi-canvas" />

      {/* Shield Slots Overlay */}
      <div className="shield-bar-overlay">
        <ShieldPill
          label="RED"
          value={boss.shields.red}
          max={boss.maxShields.red}
          color="red"
          isWeakness={boss.weaknessColor === 'red'}
        />
        <ShieldPill
          label="GREEN"
          value={boss.shields.green}
          max={boss.maxShields.green}
          color="green"
          isWeakness={boss.weaknessColor === 'green'}
        />
        <ShieldPill
          label={boss.id === 'kalos_prime' ? 'BLUE · 플라스크' : 'BLUE'}
          value={boss.shields.blue}
          max={boss.maxShields.blue}
          color="blue"
          isWeakness={boss.weaknessColor === 'blue'}
        />
      </div>

      {/* Auto-fading Skill Cut-In Toast */}
      {visibleCutIn && (
        <div
          key={`cutin-${visibleCutIn.id}`}
          className={`skill-cutin-toast cutin-${visibleCutIn.resolvedColor}`}
        >
          <strong>{visibleCutIn.cardName}</strong>
          <span>
            {visibleCutIn.damageDealt > 0 ? `-${visibleCutIn.damageDealt} HP · ` : ''}
            {visibleCutIn.note}
          </span>
        </div>
      )}

      {/* Boss Reactive Bark */}
      {boss.lastBark && (
        <div key={`bark-${boss.lastBark}`} className="boss-bark-pill">
          <span>“{boss.lastBark}”</span>
        </div>
      )}

      {/* Boss Status, Temporal Stance & Elemental Primer Overlay */}
      <div className="boss-state-badges">
        {primer ? (
          <span className={`primer-pill ${primer.cls}`}>
            <strong>{primer.title}</strong>
            <small>{primer.comboHint}</small>
          </span>
        ) : (
          <span className="primer-pill primer-idle">
            <strong>원소 공명</strong>
            <small>속성 2종 교차 시 반응</small>
          </span>
        )}
        {boss.temporalStance && (
          <span
            className={`status-chip ${
              boss.temporalStance === 'accelerate'
                ? 'chip-stance-accel'
                : 'chip-stance-rewind'
            }`}
          >
            {boss.temporalStance === 'accelerate'
              ? '가속 태세 +1 반격'
              : '역행 태세 · 보호막 잔존 시 +2 회복'}
          </span>
        )}
        {boss.staggered && (
          <span className="status-chip chip-stagger">STAGGERED · 그로기</span>
        )}
        {boss.phase === 2 && (
          <span className="status-chip chip-phase2">PHASE 2 · 각성</span>
        )}
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
        <div key={`dice-${lastDiceRoll.id}`} className="dice-tray-overlay">
          <span className="dice-tray-title">주사위 +{lastDiceRoll.totalBonus}</span>
          <div className="dice-list">
            {lastDiceRoll.results.map((die, dieIdx) => {
              const info = DICE_COLOR_BADGE[die.face] ?? DICE_COLOR_BADGE.blank;
              return (
                <span key={`${lastDiceRoll.id}-${dieIdx}`} className={`die-chip ${info.cls}`}>
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
  isWeakness = false,
}: {
  label: string;
  value: number;
  max: number;
  color: BaseColor;
  isWeakness?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={`shield-pill shield-${color} ${value === 0 ? 'shield-broken' : ''} ${
        isWeakness ? 'shield-weakness' : ''
      }`}
    >
      <div className="shield-pill-top">
        <span>
          {label}
          {isWeakness && <em className="shield-weak-tag">약점 +2</em>}
        </span>
        <strong>{value === 0 ? '파괴!' : `${value}/${max}`}</strong>
      </div>
      <div className="shield-progress-track">
        <div className="shield-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
