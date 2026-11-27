import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bot,
  Flame,
  Gem,
  Heart,
  HelpCircle,
  QrCode,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  BOSS_TEMPLATES,
  DIFFICULTY_META,
  GAUNTLET_ORDER,
  getScaledBossStats,
} from './data/bosses';
import { SEEKER_ROSTER } from './data/cards';
import { RELIC_CATALOG, RELIC_LIST } from './data/relics';
import {
  advanceGauntletStage,
  applyAiCardAction,
  clearPendingColorChoice,
  commitCurrentChain,
  createInitialGameState,
  declareExhaustion,
  estimateBossCounter,
  getTacticalHint,
  proceedToMaintenance,
  resolveBossCounterPhase,
  scanCard,
  startNextRound,
  triggerSynergyUltimate,
} from './engine/combatEngine';
import {
  computeRaidGrade,
  loadRaidCodex,
  recordVictoryToCodex,
} from './engine/raidCodex';
import {
  clearAiGrimoire,
  loadAiGrimoire,
  recordAiCardToGrimoire,
} from './engine/aiGrimoire';
import { clearUndoStack, popUndoSnapshot, pushUndoSnapshot } from './engine/undoHistory';
import {
  analyzeCardWithAI,
  isAiConfigured,
  loadAiConfig,
  saveAiConfig,
  type AiAgentConfig,
} from './ai/visionAgent';
import { BossViewportPixi } from './components/BossViewportPixi';
import { QrVisionScanner } from './components/QrVisionScanner';
import { QrTestDrawer } from './components/QrTestDrawer';
import { AiSettingsModal } from './components/AiSettingsModal';
import {
  ElementEmblemSvg,
  GearEmblemSvg,
  HourglassSvg,
  RubyHeartSvg,
  ShieldCrestSvg,
  SkullEmblemSvg,
} from './components/FantasyIcons';
import { sfx } from './audio/sfx';
import type {
  AiCardAction,
  BaseColor,
  BossClearRecord,
  BossId,
  CardColor,
  DifficultyTier,
  DiscoveredAiCard,
  GameState,
  RelicId,
  RoundPhase,
  SeekerId,
} from './types/game';

function getCardArtUrl(color: CardColor): string {
  switch (color) {
    case 'red':
    case 'dual_rg':
    case 'dual_rb':
      return './assets/card_red.jpg';
    case 'green':
    case 'dual_gb':
      return './assets/card_green.jpg';
    case 'blue':
      return './assets/card_blue.jpg';
    case 'lantern':
    case 'colorless':
      return './assets/card_lantern.jpg';
  }
}

function getSeekerPortraitUrl(seekerId: SeekerId): string {
  return `./assets/seeker_${seekerId}.jpg`;
}

function getBossPortraitUrl(bossId: BossId): string {
  return `./assets/${bossId}.jpg`;
}

const PHASE_LABEL: Record<RoundPhase, string> = {
  boss_stance: '보스 태세',
  coop_turn: '협력 턴',
  boss_counter: '보스 반격',
  maintenance: '정비 · 탈진',
  victory: '승리!',
  defeat: '패배',
};

const COLOR_KO: Record<BaseColor | 'lantern', string> = {
  red: '빨강',
  green: '초록',
  blue: '파랑',
  lantern: '랜턴',
};

export function App() {
  const [bossId, setBossId] = useState<BossId>('vainglory_core');
  const [p1Seeker, setP1Seeker] = useState<SeekerId>('khor');
  const [p2Seeker, setP2Seeker] = useState<SeekerId>('asha');
  const [relicId, setRelicId] = useState<RelicId>('prism_lens');
  const [difficulty, setDifficulty] = useState<DifficultyTier>('normal');
  const [gauntletMode, setGauntletMode] = useState(false);

  const [{ game, undoStack }, setGameState] = useState<{ game: GameState; undoStack: GameState[] }>(() => ({
    game: createInitialGameState('vainglory_core', 'khor', 'asha', 'prism_lens', 'normal', false),
    undoStack: [],
  }));
  const setGame = useCallback((updater: GameState | ((g: GameState) => GameState)) => {
    setGameState((prev) => ({
      ...prev,
      game: typeof updater === 'function' ? updater(prev.game) : updater,
    }));
  }, []);
  const handleUndo = useCallback(() => {
    setGameState((prev) => {
      if (prev.game.phase !== 'coop_turn') return prev;
      const { previous, nextStack } = popUndoSnapshot(prev.undoStack);
      if (!previous) return prev;
      sfx.playUndo();
      setScanStatus({ text: '직전 행동을 되돌렸습니다.' });
      return { game: previous, undoStack: nextStack };
    });
  }, []);
  const [muted, setMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiAgentConfig>(() => loadAiConfig());
  const [aiBusy, setAiBusy] = useState(false);
  const [codex, setCodex] = useState<Partial<Record<BossId, BossClearRecord>>>(() =>
    loadRaidCodex(),
  );
  const [grimoire, setGrimoire] = useState<DiscoveredAiCard[]>(() =>
    loadAiGrimoire(),
  );
  const victoryRecordedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    document.title = 'AETHERIA: 비전 보스 레이드';
  }, []);

  useEffect(() => {
    if (game.phase === 'victory' && !victoryRecordedRef.current) {
      victoryRecordedRef.current = true;
      setCodex(recordVictoryToCodex(game));
    }
  }, [game]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (aiSettingsOpen) setAiSettingsOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (setupOpen) setSetupOpen(false);
        else if (scanSheetOpen) setScanSheetOpen(false);
        else if (infoOpen) setInfoOpen(false);
        else if (menuOpen) setMenuOpen(false);
        else if (game.pendingColorChoice) {
          setGame((g) => clearPendingColorChoice(g));
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (
          setupOpen ||
          helpOpen ||
          aiSettingsOpen ||
          drawerOpen ||
          infoOpen ||
          scanSheetOpen ||
          menuOpen ||
          game.pendingColorChoice
        ) {
          return;
        }
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        if (
          setupOpen ||
          helpOpen ||
          aiSettingsOpen ||
          drawerOpen ||
          infoOpen ||
          scanSheetOpen ||
          menuOpen ||
          game.pendingColorChoice
        ) {
          return;
        }
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'SELECT' ||
          tag === 'TEXTAREA' ||
          tag === 'BUTTON'
        ) {
          return;
        }
        if (game.phase === 'coop_turn') {
          e.preventDefault();
          setGameState((prev) => ({
            game: resolveBossCounterPhase(prev.game),
            undoStack: clearUndoStack(),
          }));
        } else if (game.phase === 'boss_counter') {
          e.preventDefault();
          setGame((g) => proceedToMaintenance(g));
        } else if (game.phase === 'maintenance') {
          e.preventDefault();
          setGameState((prev) => ({
            game: startNextRound(prev.game),
            undoStack: clearUndoStack(),
          }));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    aiSettingsOpen,
    drawerOpen,
    helpOpen,
    setupOpen,
    infoOpen,
    scanSheetOpen,
    menuOpen,
    game.pendingColorChoice,
    game.phase,
    handleUndo,
    setGame,
  ]);

  const handleSaveAiConfig = (next: AiAgentConfig) => {
    saveAiConfig(next);
    setAiConfig(next);
  };

  const handleCaptureForAi = useCallback(
    async (imageDataUrl: string) => {
      if (!isAiConfigured(aiConfig)) {
        setScanStatus({
          text: '먼저 AI 설정에서 로컬 모델 또는 API Key를 입력하세요.',
          isError: true,
        });
        setAiSettingsOpen(true);
        return;
      }

      setAiBusy(true);
      setScanStatus({ text: 'AI 에이전트가 카드를 읽고 있습니다...' });
      try {
        const action = await analyzeCardWithAI(imageDataUrl, game.boss, aiConfig);
        setGrimoire(recordAiCardToGrimoire(action));
        setGameState((prev) => {
          const res = applyAiCardAction(prev.game, action);
          if (res.error) {
            setScanStatus({ text: res.error, isError: true });
            return { ...prev, game: res.state };
          }
          setScanStatus({
            text: `[AI] ${action.cardName} → ${action.skillTitle} (${action.damage})`,
          });
          return {
            game: res.state,
            undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
          };
        });
      } catch (err) {
        setScanStatus({
          text: err instanceof Error ? err.message : 'AI 카드 인식 실패',
          isError: true,
        });
      } finally {
        setAiBusy(false);
      }
    },
    [aiConfig, game.boss],
  );

  const handleCastGrimoireCard = useCallback((card: DiscoveredAiCard) => {
    const action: AiCardAction = {
      cardName: card.cardName,
      color: card.color,
      skillTitle: card.skillTitle,
      damage: card.damage,
      guard: card.guard,
      disruptChallenge: card.disruptChallenge,
      specialNote: card.specialNote,
      battleCry: card.battleCry,
    };
    setGameState((prev) => {
      const res = applyAiCardAction(prev.game, action);
      if (res.error) {
        setScanStatus({ text: res.error, isError: true });
        return { ...prev, game: res.state };
      }
      setScanStatus({
        text: `[도감] ${action.cardName} → ${action.skillTitle} (${action.damage})`,
      });
      return {
        game: res.state,
        undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
      };
    });
    setGrimoire(recordAiCardToGrimoire(action));
  }, []);

  const handleClearGrimoire = useCallback(() => {
    clearAiGrimoire();
    setGrimoire([]);
  }, []);

  const handleToggleMute = () => {
    const next = !muted;
    sfx.muted = next;
    setMuted(next);
  };

  const handleRestart = (
    nextBoss: BossId = bossId,
    nextP1: SeekerId = p1Seeker,
    nextP2: SeekerId = p2Seeker,
    nextRelic: RelicId = relicId,
    nextDifficulty: DifficultyTier = difficulty,
    nextGauntlet: boolean = gauntletMode,
  ) => {
    victoryRecordedRef.current = false;
    setBossId(nextBoss);
    setP1Seeker(nextP1);
    setP2Seeker(nextP2);
    setRelicId(nextRelic);
    setDifficulty(nextDifficulty);
    setGauntletMode(nextGauntlet);
    setGameState({
      game: createInitialGameState(
        nextBoss,
        nextP1,
        nextP2,
        nextRelic,
        nextDifficulty,
        nextGauntlet,
      ),
      undoStack: clearUndoStack(),
    });
    setScanStatus({
      text: nextGauntlet
        ? '3연전 건틀릿 시작! 첫 번째 보스 출현!'
        : '레이드 시작! 카드를 스캔하세요.',
    });
    setSetupOpen(false);
  };

  const handleAdvanceGauntlet = () => {
    victoryRecordedRef.current = false;
    setGameState((prev) => ({
      game: advanceGauntletStage(prev.game),
      undoStack: clearUndoStack(),
    }));
    setScanStatus({ text: '다음 보스 출현! 팀 체력 +4 회복' });
  };

  const handleScanCode = useCallback(
    (qrCode: string, chosenColor?: BaseColor) => {
      setGameState((prev) => {
        const res = scanCard(prev.game, qrCode, chosenColor);
        if (res.error) {
          setScanStatus({ text: res.error, isError: true });
          return { ...prev, game: res.state };
        }
        if (res.state.pendingColorChoice) {
          setScanStatus({
            text: `${res.state.pendingColorChoice.card.name}: 속성 선택`,
          });
          return { ...prev, game: res.state };
        }
        const latest = res.state.logs[0];
        setScanStatus({
          text: latest
            ? `${latest.cardName}${latest.damageDealt > 0 ? ` (-${latest.damageDealt})` : ''}`
            : `스캔: ${qrCode}`,
        });
        return {
          game: res.state,
          undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
        };
      });
    },
    [],
  );

  const handleTriggerSynergy = () => {
    setGameState((prev) => {
      const res = triggerSynergyUltimate(prev.game);
      if (res.error) {
        setScanStatus({ text: res.error, isError: true });
        return { ...prev, game: res.state };
      }
      setScanStatus({ text: '성좌 공명 발동! 보스에게 관통 피해 & 팀 방어 +3' });
      return {
        game: res.state,
        undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
      };
    });
  };

  const handleColorPick = (color: BaseColor) => {
    const pending = game.pendingColorChoice;
    if (!pending) return;
    handleScanCode(pending.qrCode, color);
  };

  const bossTpl = BOSS_TEMPLATES[game.boss.id];
  const activeRelic = RELIC_CATALOG[game.relicId];
  const scaledCurrentBoss = getScaledBossStats(game.boss.id, game.difficulty);
  const phase2MarkerPct = Math.max(
    5,
    Math.min(
      95,
      Math.round((scaledCurrentBoss.phase2HpThreshold / game.boss.maxHp) * 100),
    ),
  );
  const bossHpPct = Math.max(0, Math.round((game.boss.hp / game.boss.maxHp) * 100));
  const counterEst = estimateBossCounter(game.boss, game.teamProtection);
  const synergyReady = game.synergyGauge >= 100;
  const raidGrade =
    game.phase === 'victory' || game.phase === 'defeat'
      ? computeRaidGrade(game)
      : null;
  const bossRecord = codex[game.boss.id];
  const activeOwner = game.players[game.activeChain.ownerSlot] ?? game.players[0];
  const activeOwnerShort = activeOwner.name.split(' ')[0];

  const getHeroCenterPrompt = (): string => {
    if (game.phase === 'boss_counter') return '보스의 반격!';
    if (game.phase === 'maintenance') return '정비 및 탈진 단계';
    if (aiBusy) return 'AI가 카드를 읽는 중...';
    if (game.activeChain.mainCard) {
      return `${game.activeChain.mainCard.name} · 부스트 ${game.activeChain.boostCards.length}/2`;
    }
    if (game.boss.staggered) return '그로기! 지금 총공격!';
    return `${activeOwnerShort}, 카드를 비추세요`;
  };

  const renderEdgeMedallion = (player: GameState['players'][0], side: 'left' | 'right') => {
    const isOwner = game.activeChain.ownerSlot === player.slot && game.phase === 'coop_turn';
    const orbSlots = game.activeChain.mainCard
      ? Math.max(0, 2 - game.activeChain.boostCards.length)
      : player.actedThisRound
        ? 0
        : 3;

    return (
      <div
        key={player.slot}
        className={`edge-medallion edge-medallion-${side} color-${player.primaryColor} ${
          isOwner ? 'is-active-turn' : ''
        }`}
      >
        <button
          type="button"
          className="medallion-frame-btn"
          onClick={() => setInfoOpen(true)}
          title={`${player.name} 상태 · 전술 정보`}
        >
          <img
            src={getSeekerPortraitUrl(player.seekerId)}
            alt={player.name}
            className="medallion-portrait"
          />
          <div className="medallion-orbs" aria-hidden="true">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className={`action-orb ${idx < orbSlots ? 'orb-lit' : 'orb-spent'}`}
              />
            ))}
          </div>
          <span className="medallion-name-tag">P{player.slot + 1}</span>
        </button>

        <div className="medallion-sub-badges">
          {player.lanternCharged && (
            <button
              type="button"
              className="medallion-lantern-btn"
              disabled={game.phase !== 'coop_turn'}
              onClick={() =>
                handleScanCode(player.slot === 0 ? 'KD_LANTERN_01' : 'KD_LANTERN_02')
              }
              title="킨파이어 랜턴 발동!"
            >
              <Flame size={13} />
              <span>랜턴</span>
            </button>
          )}
          <button
            type="button"
            className="medallion-exhaust-btn"
            disabled={game.phase !== 'maintenance' && game.phase !== 'coop_turn'}
            onClick={() =>
              setGameState((prev) => ({
                game: declareExhaustion(prev.game, player.slot),
                undoStack:
                  prev.game.phase === 'coop_turn'
                    ? pushUndoSnapshot(prev.undoStack, prev.game)
                    : prev.undoStack,
              }))
            }
            title="탈진 선언"
          >
            탈진
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fantasy-app-bg">
      <div
        className="fantasy-stage-shell"
        style={
          {
            '--pillar-plate-url': 'url(./assets/ui/pillar_plate.png)',
            '--bronze-frame-url': 'url(./assets/ui/bronze_frame.png)',
          } as CSSProperties
        }
      >
        {/* FULL-BLEED PIXI ARENA & TOWERING BOSS */}
        <div className="fantasy-canvas-layer">
          <BossViewportPixi
            boss={game.boss}
            effectQueue={game.effectQueue}
            lastDiceRoll={game.lastDiceRoll}
            latestLog={game.logs[0] ?? null}
            minimalHud
          />
          <div className="arena-vignette-overlay" />
        </div>

        {/* TOP-LEFT: SKULL BOSS HP TOKEN */}
        <button
          type="button"
          className="edge-top-left skull-hp-badge"
          onClick={() => setHelpOpen(true)}
          title={`${game.boss.name} · 클릭하여 보스 기믹 보기`}
        >
          <SkullEmblemSvg size={42} />
          <div className="skull-hp-meta">
            <div className="skull-hp-numbers">
              <strong>{game.boss.hp}</strong>
              {game.boss.phase === 2 && <span className="p2-ember-tag">P2</span>}
              {game.gauntletMode && (
                <span className="gauntlet-mini-tag">
                  {game.gauntletStage + 1}/{GAUNTLET_ORDER.length}
                </span>
              )}
            </div>
            <div className="skull-hp-bar">
              <div
                className={`skull-hp-fill ${game.boss.phase === 2 ? 'phase2-hp' : ''}`}
                style={{ width: `${bossHpPct}%` }}
              />
              {game.boss.phase === 1 && (
                <span
                  className="phase2-threshold-marker"
                  style={{ left: `${phase2MarkerPct}%` }}
                />
              )}
            </div>
          </div>
        </button>

        {/* TOP-RIGHT: ORNATE GEAR SETTINGS BUTTON & UNDO */}
        <div className="edge-top-right">
          {undoStack.length > 0 && game.phase === 'coop_turn' && (
            <button
              type="button"
              className="ornate-mini-icon-btn"
              onClick={handleUndo}
              title="직전 행동 되돌리기 (Ctrl+Z)"
              aria-label="되돌리기"
            >
              <Undo2 size={17} />
            </button>
          )}
          <button
            type="button"
            className="ornate-gear-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="메뉴 및 설정"
            title="메뉴 · 테스트 덱 · AI 설정"
          >
            <GearEmblemSvg size={50} />
          </button>
        </div>

        {/* EDGE-DOCKED SEEKER PORTRAIT MEDALLIONS */}
        {renderEdgeMedallion(game.players[0], 'left')}
        {renderEdgeMedallion(game.players[1], 'right')}

        {/* SYNERGY ULTIMATE FLOATING ORB (RIGHT EDGE BELOW P2) */}
        <button
          type="button"
          className={`edge-synergy-orb ${synergyReady ? 'is-ready' : ''}`}
          disabled={!synergyReady || game.phase !== 'coop_turn'}
          onClick={handleTriggerSynergy}
          title={
            synergyReady
              ? '성좌 공명 발동! (무적 관통 10 피해 + 방어 +3)'
              : `합동 공명 게이지 ${game.synergyGauge}%`
          }
        >
          <Sparkles size={15} />
          <span>{synergyReady ? '공명!' : `${game.synergyGauge}%`}</span>
        </button>

        {/* CENTER FLOATING FANTASY PROMPT & BARK */}
        <div className="center-hero-callout">
          {game.boss.lastBark && (
            <div key={game.boss.lastBark} className="floating-boss-bark">
              “{game.boss.lastBark}”
            </div>
          )}

          {game.lastReaction ? (
            <div
              key={game.lastReaction.id}
              className={`hero-prompt-text reaction-glow-${game.lastReaction.kind}`}
            >
              {game.lastReaction.title}!{' '}
              {game.logs[0]?.damageDealt ? `-${game.logs[0].damageDealt}` : ''}
            </div>
          ) : (
            <div className="hero-prompt-text">{getHeroCenterPrompt()}</div>
          )}

          <div className="hero-sub-status">
            {game.boss.primedElement && (
              <span className={`micro-chip chip-${game.boss.primedElement}`}>
                {COLOR_KO[game.boss.primedElement]} 대기
              </span>
            )}
            {game.fieldEcho && (
              <span className="micro-chip chip-echo">{game.fieldEcho.title}</span>
            )}
            {game.boss.invulnerable && <span className="micro-chip chip-void">무적 결계</span>}
            {game.boss.staggered && <span className="micro-chip chip-gold">그로기</span>}
            {game.boss.temporalStance && (
              <span className="micro-chip chip-blue">
                {game.boss.temporalStance === 'accelerate' ? '가속 +1' : '역행'}
              </span>
            )}
            {game.activeChain.mainCard && game.phase === 'coop_turn' && (
              <button
                type="button"
                className="micro-confirm-btn"
                onClick={() =>
                  setGameState((prev) => ({
                    game: commitCurrentChain(prev.game),
                    undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
                  }))
                }
              >
                <img
                  src={getCardArtUrl(game.activeChain.mainCard.color)}
                  alt=""
                  className="micro-card-thumb"
                />
                콤보 확정
              </button>
            )}
          </div>

          {scanStatus && (
            <div className={`hero-scan-note ${scanStatus.isError ? 'is-err' : ''}`}>
              {scanStatus.text}
            </div>
          )}
        </div>

        {/* CENTER CIRCULAR AI VISION LENS + FLANKING PHASE / COUNTER CONTROLS */}
        <div className="vision-lens-dock">
          <div className="flank-pill counter-flank" title={game.boss.intent.description}>
            <Swords size={13} />
            <span>반격 {counterEst.net}</span>
          </div>

          <button
            type="button"
            className={`vision-lens-orb ${aiBusy ? 'is-analyzing' : ''}`}
            disabled={game.phase !== 'coop_turn' || aiBusy}
            onClick={() => setScanSheetOpen(true)}
            title="카메라 / AI 카드 스캔"
            aria-label="카드 스캔 열기"
          >
            <img
              src="./assets/ui/lens.png"
              alt="카드 스캔"
              className="vision-lens-img"
              draggable={false}
            />
          </button>

          <div className="flank-actions-right">
            <button
              type="button"
              className="flank-pill deck-flank-btn"
              onClick={() => setDrawerOpen(true)}
              title="테스트 카드 덱 / 비전 샘플"
            >
              <QrCode size={13} />
              <span>덱</span>
            </button>
            {game.phase === 'coop_turn' && (
              <button
                type="button"
                className="flank-pill phase-flank-btn"
                onClick={() =>
                  setGameState((prev) => ({
                    game: resolveBossCounterPhase(prev.game),
                    undoStack: clearUndoStack(),
                  }))
                }
              >
                턴 종료
              </button>
            )}
            {game.phase === 'boss_counter' && (
              <button
                type="button"
                className="flank-pill phase-flank-btn"
                onClick={() => setGame((g) => proceedToMaintenance(g))}
              >
                정비로
              </button>
            )}
            {game.phase === 'maintenance' && (
              <button
                type="button"
                className="flank-pill phase-flank-btn"
                onClick={() =>
                  setGameState((prev) => ({
                    game: startNextRound(prev.game),
                    undoStack: clearUndoStack(),
                  }))
                }
              >
                {game.round >= game.maxRounds ? '결과' : `${game.round + 1}R`}
              </button>
            )}
          </div>
        </div>

        {/* BOTTOM-CENTER: 3 ORNATE VERTICAL SHIELD PILLARS */}
        <div className="shield-pillars-row">
          {(['red', 'green', 'blue'] as BaseColor[]).map((col) => {
            const val = game.boss.shields[col];
            const isWeak = game.boss.weaknessColor === col;
            const broken = val === 0;
            return (
              <div
                key={col}
                className={`shield-pillar pillar-${col} ${broken ? 'is-broken' : ''} ${
                  isWeak ? 'is-weakness' : ''
                }`}
              >
                {isWeak && <span className="pillar-weak-badge">약점+2</span>}
                <div className="pillar-crest">
                  <ShieldCrestSvg color={col} broken={broken} size={54} />
                </div>
                <strong className="pillar-value">{val}</strong>
                <div className="pillar-emblem-box">
                  <ElementEmblemSvg color={col} size={36} />
                </div>
              </div>
            );
          })}
        </div>

        {/* BOTTOM-LEFT: HOURGLASS ROUND BADGE */}
        <button
          type="button"
          className="edge-bottom-left hourglass-badge"
          onClick={() => setInfoOpen(true)}
          title={`라운드 ${game.round}/${game.maxRounds} · 전술 정보`}
        >
          <HourglassSvg size={40} />
          <span className="corner-stat-pill">
            {game.round}
            <small>/{game.maxRounds}</small>
          </span>
        </button>

        {/* BOTTOM-RIGHT: RUBY CRYSTAL HEART TEAM HP */}
        <button
          type="button"
          className="edge-bottom-right crystal-heart-badge"
          onClick={() => setInfoOpen(true)}
          title={`팀 체력 ${game.teamHp}/${game.maxTeamHp} · 방어막 +${game.teamProtection}`}
        >
          {game.teamProtection > 0 && (
            <span className="floating-guard-pip">
              <Shield size={11} /> +{game.teamProtection}
            </span>
          )}
          <span className="corner-stat-pill">{game.teamHp}</span>
          <RubyHeartSvg size={42} />
        </button>
      </div>

      {/* MENU SHEET */}
      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet-panel menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>메뉴</h3>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setMenuOpen(false)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheet-body menu-body">
              <div className="menu-brand-row">
                <span className="menu-brand">AETHERIA</span>
                <span className="menu-brand-sub">
                  {game.boss.name} · R{game.round}/{game.maxRounds} · {PHASE_LABEL[game.phase]}
                </span>
              </div>

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setInfoOpen(true);
                }}
              >
                <Sparkles size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>전투 정보</strong>
                  <small>콤보 · 반격 예측 · 유물 · 최근 액션</small>
                </span>
              </button>

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setDrawerOpen(true);
                }}
              >
                <QrCode size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>테스트 덱 / QR</strong>
                  <small>가상 스캔 카드 덱 (개발용)</small>
                </span>
              </button>

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setSetupOpen(true);
                }}
              >
                <RotateCcw size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>덱 / 유물</strong>
                  <small>보스·난이도·탐구자·유물 변경</small>
                </span>
              </button>

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setHelpOpen(true);
                }}
              >
                <HelpCircle size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>보스 기믹</strong>
                  <small>원소 반응표 · 보스 패턴 안내</small>
                </span>
              </button>

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setAiSettingsOpen(true);
                }}
              >
                <Bot size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>AI 설정</strong>
                  <small>
                    현재:{' '}
                    {aiConfig.mode === 'demo'
                      ? '데모 AI'
                      : aiConfig.mode === 'local'
                        ? '로컬 AI'
                        : aiConfig.mode === 'gemini'
                          ? 'Gemini'
                          : 'OpenAI'}
                  </small>
                </span>
              </button>

              <button type="button" className="menu-item" onClick={handleToggleMute}>
                {muted ? (
                  <VolumeX size={18} className="menu-icon" />
                ) : (
                  <Volume2 size={18} className="menu-icon" />
                )}
                <span className="menu-item-text">
                  <strong>사운드 {muted ? '켜기' : '끄기'}</strong>
                </span>
              </button>

              <button
                type="button"
                className="menu-item menu-item-danger"
                onClick={() => {
                  setMenuOpen(false);
                  handleRestart();
                }}
              >
                <RotateCcw size={18} className="menu-icon" />
                <span className="menu-item-text">
                  <strong>레이드 다시 시작</strong>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARD SCAN SHEET */}
      {scanSheetOpen && (
        <div className="sheet-backdrop" onClick={() => setScanSheetOpen(false)}>
          <div
            className="sheet-panel sheet-panel-tall"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h3>카드 스캔</h3>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setScanSheetOpen(false)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="scanner-sheet-body">
              <QrVisionScanner
                onScan={(code) => {
                  handleScanCode(code);
                  setScanSheetOpen(false);
                }}
                onCaptureForAi={(img) => {
                  setScanSheetOpen(false);
                  void handleCaptureForAi(img);
                }}
                onOpenTestDeck={() => {
                  setScanSheetOpen(false);
                  setDrawerOpen(true);
                }}
                onRequireAiConfig={() => {
                  setScanStatus({
                    text: '자동 인식을 사용하려면 먼저 AI 에이전트를 설정하세요.',
                    isError: true,
                  });
                  setAiSettingsOpen(true);
                }}
                aiConfigured={isAiConfigured(aiConfig)}
                aiBusy={aiBusy}
                disabled={game.phase !== 'coop_turn'}
                lastScanStatus={scanStatus}
              />
            </div>
            <div className="sheet-foot-row">
              <button
                type="button"
                className="quick-action"
                onClick={() => {
                  setScanSheetOpen(false);
                  setDrawerOpen(true);
                }}
              >
                <Sparkles size={15} />
                QR 테스트 / 가상 카드 덱
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TACTICAL INFO SHEET */}
      {infoOpen && (
        <div className="sheet-backdrop" onClick={() => setInfoOpen(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>전술 정보</h3>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setInfoOpen(false)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheet-body">
              <div className="sheet-quick-actions">
                <button
                  type="button"
                  className="quick-action"
                  onClick={() => {
                    setInfoOpen(false);
                    setDrawerOpen(true);
                  }}
                >
                  <Sparkles size={15} className="accent-amber" />
                  QR 테스트
                </button>
                <button
                  type="button"
                  className="quick-action"
                  onClick={() => {
                    setInfoOpen(false);
                    setSetupOpen(true);
                  }}
                >
                  <RotateCcw size={15} />
                  덱/유물
                </button>
                <button
                  type="button"
                  className="quick-action"
                  onClick={() => {
                    setInfoOpen(false);
                    setHelpOpen(true);
                  }}
                >
                  <HelpCircle size={15} />
                  보스 기믹
                </button>
                <button
                  type="button"
                  className="quick-action"
                  onClick={() => {
                    setInfoOpen(false);
                    setAiSettingsOpen(true);
                  }}
                >
                  <Bot size={15} className="accent-amber" />
                  {aiConfig.mode === 'demo'
                    ? '데모 AI'
                    : aiConfig.mode === 'local'
                      ? '로컬 AI'
                      : aiConfig.mode === 'gemini'
                        ? 'Gemini'
                        : 'OpenAI'}
                </button>
              </div>

              <div className="relic-badge-pill" title={activeRelic.description}>
                <Gem size={13} className="accent-amber" />
                <span className="relic-badge-name">유물 · {activeRelic.name}</span>
                <small className="relic-badge-sub">{activeRelic.subtitle}</small>
              </div>

              {game.lastReaction && (
                <section
                  key={game.lastReaction.id}
                  className={`hud-block reaction-banner reaction-${game.lastReaction.kind}`}
                >
                  <div className="reaction-head">
                    <Sparkles size={13} />
                    <strong>원소 반응 · {game.lastReaction.title}</strong>
                  </div>
                  <span className="reaction-detail">{game.lastReaction.detail}</span>
                </section>
              )}

              {game.fieldEcho && (
                <div className={`field-echo-pill echo-${game.fieldEcho.kind}`}>
                  <Sparkles size={12} />
                  <span>
                    {game.fieldEcho.title} · {game.fieldEcho.effectText}
                  </span>
                </div>
              )}

              {game.lastAiAction && (
                <section className="hud-block ai-callout-block">
                  <div className="hud-label">
                    <Bot size={14} className="accent-amber" /> AI: {game.lastAiAction.cardName}
                  </div>
                  <p className="ai-battle-cry">“{game.lastAiAction.battleCry}”</p>
                  {game.lastAiAction.reactionHint && (
                    <span className="ai-reaction-hint">{game.lastAiAction.reactionHint}</span>
                  )}
                </section>
              )}

              <section className="hud-block intent-block">
                <div className="hud-head-row">
                  <span className="hud-label">
                    <Swords size={14} /> {game.boss.intent.title}
                  </span>
                  {counterEst.weakened > 0 && (
                    <span className="intent-tag-weaken">-균열 {counterEst.weakened}</span>
                  )}
                </div>
                <div className="intent-number-row">
                  <span className="intent-dmg">{counterEst.net}</span>
                  <span className="intent-sub">
                    예상 {counterEst.raw} · 방어 -{counterEst.absorbed}
                    {game.boss.intent.pierceGuard > 0
                      ? ` (관통 ${game.boss.intent.pierceGuard})`
                      : ''}
                  </span>
                </div>
                <p className="intent-desc">{game.boss.intent.description}</p>
                {game.boss.challenges.length > 0 && (
                  <div className="challenge-chips">
                    {game.boss.challenges.map((ch) => (
                      <span key={ch.id} className="challenge-pill">
                        <Zap size={11} /> {ch.name} ({COLOR_KO[ch.requiredColor]}으로 제거)
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className="hud-block">
                <div className="hud-head-row">
                  <span className="hud-label">
                    <Flame size={14} /> 콤보 체인
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-undo"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0 || game.phase !== 'coop_turn'}
                    title="직전 스캔 취소 (Ctrl+Z)"
                  >
                    <Undo2 size={11} />
                    되돌리기
                  </button>
                  {game.activeChain.mainCard && (
                    <button
                      type="button"
                      className="btn-ghost btn-confirm-chain"
                      onClick={() =>
                        setGameState((prev) => ({
                          game: commitCurrentChain(prev.game),
                          undoStack: pushUndoSnapshot(prev.undoStack, prev.game),
                        }))
                      }
                    >
                      확정
                    </button>
                  )}
                </div>
                <div className="combo-slots">
                  <div
                    className={`combo-pill ${
                      game.activeChain.mainCard
                        ? `filled dot-${game.activeChain.resolvedColor ?? 'red'}`
                        : ''
                    }`}
                  >
                    <small>메인</small>
                    <strong>
                      {game.activeChain.mainCard
                        ? game.activeChain.mainCard.name
                        : '카드 스캔'}
                    </strong>
                  </div>
                  <div className="combo-boosts">
                    {[0, 1].map((idx) => {
                      const b = game.activeChain.boostCards[idx];
                      return (
                        <div key={idx} className={`combo-pill boost ${b ? 'filled' : ''}`}>
                          <small>부스트 {idx + 1}</small>
                          <strong>{b ? `+${b.boostValue}` : '—'}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="tactical-hint-line">{getTacticalHint(game)}</div>
              </section>

              <section className="hud-block feed-block">
                <div className="hud-label">최근 액션</div>
                <div className="recent-feed">
                  {game.logs.length === 0 ? (
                    <span className="feed-empty">스캔 대기 중</span>
                  ) : (
                    game.logs.slice(0, 4).map((entry, idx) => (
                      <div
                        key={`${entry.id}-${idx}`}
                        className={`feed-row feed-${entry.resolvedColor}`}
                      >
                        <span className="feed-name">
                          {entry.isBoost ? '↳ ' : ''}
                          {entry.cardName}
                        </span>
                        <strong className="feed-val">
                          {entry.damageDealt > 0 ? `-${entry.damageDealt}` : '발동'}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="hud-block">
                <div className="hud-head-row">
                  <span className="hud-label">
                    <Heart size={14} /> 팀
                  </span>
                  <span className="intent-sub">
                    체력 {game.teamHp}/{game.maxTeamHp} · 방어막 +{game.teamProtection}
                  </span>
                </div>
                <div className="players-strip">
                  {game.players.map((player) => (
                    <div
                      key={player.slot}
                      className={`player-card player-${player.primaryColor}`}
                    >
                      <div className="player-identity">
                        <span className="player-slot-badge">P{player.slot + 1}</span>
                        <strong>{player.name.split(' ')[0]}</strong>
                        <span
                          className={`lantern-icon ${
                            player.lanternCharged ? 'charged' : ''
                          }`}
                        >
                          <Flame size={14} />
                          {player.lanternCharged ? 'ON' : '랜턴'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-exhaust"
                        disabled={
                          game.phase !== 'maintenance' && game.phase !== 'coop_turn'
                        }
                        onClick={() =>
                          setGameState((prev) => ({
                            game: declareExhaustion(prev.game, player.slot),
                            undoStack:
                              prev.game.phase === 'coop_turn'
                                ? pushUndoSnapshot(prev.undoStack, prev.game)
                                : prev.undoStack,
                          }))
                        }
                      >
                        탈진
                      </button>
                    </div>
                  ))}
                </div>
                <div className="synergy-box">
                  <div className="synergy-meter-card">
                    <div className="synergy-meter-head">
                      <span>
                        <Sparkles size={12} /> 합동 궁극기
                      </span>
                      <strong>{game.synergyGauge}%</strong>
                    </div>
                    <div className="synergy-track">
                      <div
                        className="synergy-fill"
                        style={{ width: `${Math.min(100, game.synergyGauge)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* DUAL / COLORLESS ATTRIBUTE PICKER MODAL */}
      {game.pendingColorChoice && (
        <div className="modal-backdrop">
          <div className="choice-modal">
            <h3>속성 선택</h3>
            <p>
              <strong>{game.pendingColorChoice.card.name}</strong>을(를) 어떤
              속성으로 사용할까요?
            </p>
            <div className="color-choice-grid">
              {game.pendingColorChoice.allowedColors.map((col) => (
                <button
                  key={col}
                  type="button"
                  className={`choice-btn choice-${col}`}
                  onClick={() => handleColorPick(col)}
                >
                  {COLOR_KO[col]}
                  <small>보호막 {game.boss.shields[col]}</small>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setGame((g) => clearPendingColorChoice(g))}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* BOSS GIMMICK HELP MODAL */}
      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="choice-modal help-modal" onClick={(e) => e.stopPropagation()}>
            <span className="modal-eyebrow">AETHERIA · 비전 보스 레이드</span>
            <h3>
              {game.boss.name} · {game.boss.subtitle}
            </h3>
            <div className="reaction-cheatsheet">
              <div className="cheat-pill cheat-melt">
                <strong>빨강 + 파랑 = 과부하 융해</strong>
                <small>피해 +3 · 전 보호막 -1</small>
              </div>
              <div className="cheat-pill cheat-chrono">
                <strong>파랑 + 초록 = 시간 균열</strong>
                <small>반격 -2 · 방어 +2 · 해제</small>
              </div>
              <div className="cheat-pill cheat-shatter">
                <strong>빨강 + 초록 = 파쇄 치명타</strong>
                <small>위력 ×1.5 증폭</small>
              </div>
            </div>
            <p className="cheat-rules-line">
              그로기: 라운드 내 반응 2회 또는 3보호막 모두 파쇄 (반격 무효 · 피해 +25%) | 트리플 체인: 부스트 2장 연결 (+4 · 공명 +15)
            </p>
            <ul className="gimmick-list">
              {bossTpl.gimmickSummary.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-phase-next"
              onClick={() => setHelpOpen(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* VICTORY / DEFEAT OVERLAY */}
      {(game.phase === 'victory' || game.phase === 'defeat') && raidGrade && (
        <div className="modal-backdrop">
          <div className={`result-modal result-${game.phase}`}>
            <span className="modal-eyebrow">AETHERIA · 비전 보스 레이드</span>
            <div className="result-header-row">
              <div>
                <h2>{game.phase === 'victory' ? '레이드 승리!' : '레이드 패배'}</h2>
                <p className="result-end-reason">{game.endReason}</p>
              </div>
              <div className={`rank-badge rank-${raidGrade.rank}`}>
                <strong>{raidGrade.rank}</strong>
                <span>{raidGrade.label}</span>
                <small>{raidGrade.score}점</small>
              </div>
            </div>

            <div className="result-stats-grid">
              <div className="stat-cell">
                <small>라운드</small>
                <strong>
                  {game.round}/{game.maxRounds}
                </strong>
              </div>
              <div className="stat-cell">
                <small>팀 체력</small>
                <strong>
                  {game.teamHp}/{game.maxTeamHp}
                </strong>
              </div>
              <div className="stat-cell">
                <small>총 피해</small>
                <strong>{game.stats.totalDamageDealt}</strong>
              </div>
              <div className="stat-cell">
                <small>원소 반응</small>
                <strong>{game.stats.reactionsTriggered}</strong>
              </div>
              <div className="stat-cell">
                <small>방패 파쇄</small>
                <strong>{game.stats.shieldsBroken}</strong>
              </div>
              <div className="stat-cell">
                <small>그로기</small>
                <strong>{game.boss.staggerCount}</strong>
              </div>
            </div>

            {game.phase === 'victory' &&
              game.gauntletMode &&
              game.gauntletStage === GAUNTLET_ORDER.length - 1 && (
                <div className="gauntlet-complete-banner">
                  <Trophy size={14} />
                  <strong>
                    3연전 건틀릿 완전 제패! · 총합{' '}
                    {game.gauntletTotalScore + raidGrade.score}점
                  </strong>
                </div>
              )}

            {bossRecord && (
              <div className="codex-record-bar">
                <Trophy size={13} className="accent-amber" />
                <span>
                  {game.boss.name} 코덱스 · {bossRecord.clears}회 토벌 · 최고{' '}
                  <strong>{bossRecord.bestRank}랭크</strong> ({bossRecord.bestRounds}R)
                </span>
              </div>
            )}

            <div className="result-actions">
              {game.phase === 'victory' &&
              game.gauntletMode &&
              game.gauntletStage < GAUNTLET_ORDER.length - 1 ? (
                <button
                  type="button"
                  className="btn-phase-next btn-gauntlet-next"
                  onClick={handleAdvanceGauntlet}
                >
                  다음 보스 진격! ({game.gauntletStage + 2}/{GAUNTLET_ORDER.length})
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-phase-next"
                  onClick={() => handleRestart()}
                >
                  다시 도전
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSetupOpen(true)}
              >
                보스 변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOSS / SEEKER SETUP MODAL */}
      {setupOpen && (
        <div className="modal-backdrop" onClick={() => setSetupOpen(false)}>
          <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
            <span className="modal-eyebrow">AETHERIA · 비전 보스 레이드</span>
            <h3>보스 및 덱 편성</h3>
            <div className="setup-group">
              <label>레이드 모드</label>
              <div className="mode-toggle-row">
                <button
                  type="button"
                  className={`mode-toggle-btn ${!gauntletMode ? 'selected' : ''}`}
                  onClick={() => setGauntletMode(false)}
                >
                  단일 보스
                </button>
                <button
                  type="button"
                  className={`mode-toggle-btn ${gauntletMode ? 'selected' : ''}`}
                  onClick={() => setGauntletMode(true)}
                >
                  3연전 건틀릿 (보스 러시)
                </button>
              </div>
              {gauntletMode && (
                <div className="gauntlet-preview-strip">
                  바인글로리 코어 → 칼로스 프라임 → 크로노스 웜 (연전 시 공명·유물 유지, 팀 체력 +4 회복)
                </div>
              )}
            </div>

            <div className="setup-group">
              <label>난이도 선택</label>
              <div className="difficulty-picker-grid">
                {(['normal', 'heroic', 'abyss'] as DifficultyTier[]).map((tier) => {
                  const meta = DIFFICULTY_META[tier];
                  return (
                    <button
                      key={tier}
                      type="button"
                      className={`difficulty-opt difficulty-opt-${tier} ${
                        difficulty === tier ? 'selected' : ''
                      }`}
                      onClick={() => setDifficulty(tier)}
                      title={meta.description}
                    >
                      <strong>{meta.label}</strong>
                      <small>{meta.description}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setup-group">
              <label>보스 선택</label>
              <div className="setup-options">
                {(Object.keys(BOSS_TEMPLATES) as BossId[]).map((id) => {
                  const tpl = BOSS_TEMPLATES[id];
                  const scaled = getScaledBossStats(id, difficulty);
                  const rec = codex[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={gauntletMode}
                      className={`setup-opt ${
                        !gauntletMode && bossId === id ? 'selected' : ''
                      }`}
                      onClick={() => setBossId(id)}
                    >
                      <div className="setup-boss-row">
                        <img
                          src={getBossPortraitUrl(id)}
                          alt={tpl.name}
                          className="setup-boss-thumb"
                        />
                        <div className="setup-boss-info">
                          <div className="setup-opt-top">
                            <strong>{tpl.name}</strong>
                            {rec && (
                              <span className="codex-clear-pill">
                                최고 {rec.bestRank} · {rec.clears}승
                                {rec.bestDifficulty && rec.bestDifficulty !== 'normal'
                                  ? ` (${rec.bestDifficulty.toUpperCase()})`
                                  : ''}
                              </span>
                            )}
                          </div>
                          <span>
                            {tpl.subtitle} · {scaled.maxHp} HP · 방패 {scaled.baseShields.red}/
                            {scaled.baseShields.green}/{scaled.baseShields.blue}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-group">
                <label>P1 카드 덱</label>
                <div className="setup-seeker-select-row">
                  <img
                    src={getSeekerPortraitUrl(p1Seeker)}
                    alt={SEEKER_ROSTER[p1Seeker].name}
                    className="setup-seeker-thumb"
                  />
                  <select
                    value={p1Seeker}
                    onChange={(e) => setP1Seeker(e.target.value as SeekerId)}
                  >
                    {(Object.keys(SEEKER_ROSTER) as SeekerId[]).map((sid) => (
                      <option key={sid} value={sid}>
                        {SEEKER_ROSTER[sid].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="setup-group">
                <label>P2 카드 덱</label>
                <div className="setup-seeker-select-row">
                  <img
                    src={getSeekerPortraitUrl(p2Seeker)}
                    alt={SEEKER_ROSTER[p2Seeker].name}
                    className="setup-seeker-thumb"
                  />
                  <select
                    value={p2Seeker}
                    onChange={(e) => setP2Seeker(e.target.value as SeekerId)}
                  >
                    {(Object.keys(SEEKER_ROSTER) as SeekerId[]).map((sid) => (
                      <option key={sid} value={sid}>
                        {SEEKER_ROSTER[sid].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="setup-group">
              <label>전술 유물 선택 (1개 장착)</label>
              <div className="relic-picker-grid">
                {RELIC_LIST.map((relic) => (
                  <button
                    key={relic.id}
                    type="button"
                    className={`relic-opt ${relicId === relic.id ? 'selected' : ''}`}
                    onClick={() => setRelicId(relic.id)}
                  >
                    <div className="relic-opt-head">
                      <strong>{relic.name}</strong>
                      <span>{relic.subtitle}</span>
                    </div>
                    <small>{relic.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSetupOpen(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn-phase-next"
                onClick={() =>
                  handleRestart(
                    bossId,
                    p1Seeker,
                    p2Seeker,
                    relicId,
                    difficulty,
                    gauntletMode,
                  )
                }
              >
                {gauntletMode ? '3연전 건틀릿 시작' : '레이드 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR TEST & SIMULATOR DRAWER */}
      <QrTestDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        p1Seeker={game.players[0].seekerId}
        p2Seeker={game.players[1].seekerId}
        onSimulateScan={(code) => handleScanCode(code)}
        onSimulateAiImage={(img) => void handleCaptureForAi(img)}
        grimoire={grimoire}
        onCastGrimoireCard={handleCastGrimoireCard}
        onClearGrimoire={handleClearGrimoire}
      />

      {/* AI AGENT SETTINGS MODAL */}
      <AiSettingsModal
        open={aiSettingsOpen}
        config={aiConfig}
        onClose={() => setAiSettingsOpen(false)}
        onSave={handleSaveAiConfig}
      />
    </div>
  );
}

export default App;
