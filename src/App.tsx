import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Flame,
  Gem,
  Heart,
  HelpCircle,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { BOSS_TEMPLATES } from './data/bosses';
import { SEEKER_ROSTER } from './data/cards';
import { RELIC_CATALOG, RELIC_LIST } from './data/relics';
import {
  applyAiCardAction,
  clearPendingColorChoice,
  commitCurrentChain,
  createInitialGameState,
  declareExhaustion,
  estimateBossCounter,
  proceedToMaintenance,
  resolveBossCounterPhase,
  scanCard,
  startNextRound,
  triggerSynergyUltimate,
} from './engine/combatEngine';
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
import { sfx } from './audio/sfx';
import type {
  BaseColor,
  BossId,
  GameState,
  RelicId,
  RoundPhase,
  SeekerId,
} from './types/game';

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

  const [game, setGame] = useState<GameState>(() =>
    createInitialGameState('vainglory_core', 'khor', 'asha', 'prism_lens'),
  );
  const [muted, setMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiAgentConfig>(() => loadAiConfig());
  const [aiBusy, setAiBusy] = useState(false);
  const [scanStatus, setScanStatus] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    document.title = 'AETHERIA: 비전 보스 레이드';
  }, []);

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
        setGame((prev) => {
          const res = applyAiCardAction(prev, action);
          if (res.error) {
            setScanStatus({ text: res.error, isError: true });
          } else {
            setScanStatus({
              text: `[AI] ${action.cardName} → ${action.skillTitle} (${action.damage})`,
            });
          }
          return res.state;
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
  ) => {
    setBossId(nextBoss);
    setP1Seeker(nextP1);
    setP2Seeker(nextP2);
    setRelicId(nextRelic);
    setGame(createInitialGameState(nextBoss, nextP1, nextP2, nextRelic));
    setScanStatus({ text: '레이드 시작! 카드를 스캔하세요.' });
    setSetupOpen(false);
  };

  const handleScanCode = useCallback(
    (qrCode: string, chosenColor?: BaseColor) => {
      setGame((prev) => {
        const res = scanCard(prev, qrCode, chosenColor);
        if (res.error) {
          setScanStatus({ text: res.error, isError: true });
        } else if (res.state.pendingColorChoice) {
          setScanStatus({
            text: `${res.state.pendingColorChoice.card.name}: 속성 선택`,
          });
        } else {
          const latest = res.state.logs[0];
          setScanStatus({
            text: latest
              ? `${latest.cardName}${latest.damageDealt > 0 ? ` (-${latest.damageDealt})` : ''}`
              : `스캔: ${qrCode}`,
          });
        }
        return res.state;
      });
    },
    [],
  );

  const handleTriggerSynergy = () => {
    setGame((prev) => {
      const res = triggerSynergyUltimate(prev);
      if (res.error) {
        setScanStatus({ text: res.error, isError: true });
      } else {
        setScanStatus({ text: '성좌 공명 발동! 보스에게 관통 피해 & 팀 방어 +3' });
      }
      return res.state;
    });
  };

  const handleColorPick = (color: BaseColor) => {
    const pending = game.pendingColorChoice;
    if (!pending) return;
    handleScanCode(pending.qrCode, color);
  };

  const bossTpl = BOSS_TEMPLATES[game.boss.id];
  const activeRelic = RELIC_CATALOG[game.relicId];
  const bossHpPct = Math.max(0, Math.round((game.boss.hp / game.boss.maxHp) * 100));
  const teamHpPct = Math.max(0, Math.round((game.teamHp / game.maxTeamHp) * 100));
  const counterEst = estimateBossCounter(game.boss, game.teamProtection);
  const synergyReady = game.synergyGauge >= 100;

  return (
    <div className="raid-shell">
      {/* SLIM TOP HUD */}
      <header className="top-bar">
        <div className="brand-badge" title="AETHERIA: 비전 보스 레이드">
          <span className="brand-title">AETHERIA</span>
          <small className="brand-sub">비전 보스 레이드</small>
        </div>

        <div className="boss-header-info">
          <div className="boss-title-row">
            <span className="boss-name">{game.boss.name}</span>
            <span className="boss-sub">
              {game.boss.phase === 2 ? bossTpl.phase2Title : game.boss.subtitle}
            </span>
          </div>
          <div className="boss-hp-track">
            <div
              className={`boss-hp-fill ${game.boss.phase === 2 ? 'phase2-hp' : ''}`}
              style={{ width: `${bossHpPct}%` }}
            />
            <span className="boss-hp-text">
              {game.boss.hp} / {game.boss.maxHp} HP
            </span>
          </div>
        </div>

        <div className="round-phase-cluster">
          {game.boss.phase === 2 && (
            <div className="phase2-pill">PHASE 2</div>
          )}
          <div className="round-pill">
            R<strong>{game.round}</strong>/{game.maxRounds}
          </div>
          <div className={`phase-pill phase-${game.phase}`}>
            {PHASE_LABEL[game.phase]}
          </div>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className={`btn-ghost ${isAiConfigured(aiConfig) ? 'btn-ai-ready' : ''}`}
            onClick={() => setAiSettingsOpen(true)}
            title="AI 비전 에이전트 연결 설정"
          >
            <Bot size={15} />
            {aiConfig.mode === 'local'
              ? '로컬 AI'
              : aiConfig.mode === 'gemini'
                ? 'Gemini'
                : 'OpenAI'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setHelpOpen(true)}
            title="보스 기믹 안내"
          >
            <HelpCircle size={15} />
            기믹
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSetupOpen(true)}
          >
            <RotateCcw size={14} />
            덱/유물
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleToggleMute}
            aria-label="사운드 토글"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </header>

      {/* CLEAN 2-ZONE ARENA */}
      <main className="arena-grid">
        {/* MAIN HERO STAGE: BOSS + COMPACT CAMERA */}
        <section className="center-stage">
          <BossViewportPixi
            boss={game.boss}
            effectQueue={game.effectQueue}
            lastDiceRoll={game.lastDiceRoll}
            latestLog={game.logs[0] ?? null}
          />
          <QrVisionScanner
            onScan={(code) => handleScanCode(code)}
            onCaptureForAi={(img) => void handleCaptureForAi(img)}
            onOpenTestDeck={() => setDrawerOpen(true)}
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
        </section>

        {/* SLIM TACTICAL HUD RAIL */}
        <aside className="hud-rail">
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

          {/* Next Boss Intent & Counter Forecast */}
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

          {/* Active Combo Slots */}
          <section className="hud-block">
            <div className="hud-head-row">
              <span className="hud-label">
                <Sparkles size={14} /> 콤보 체인
              </span>
              {game.activeChain.mainCard && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setGame((g) => commitCurrentChain(g))}
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
                    <div
                      key={idx}
                      className={`combo-pill boost ${b ? 'filled' : ''}`}
                    >
                      <small>부스트 {idx + 1}</small>
                      <strong>{b ? `+${b.boostValue}` : '—'}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Compact Recent Feed (max 4) */}
          <section className="hud-block feed-block">
            <div className="hud-label">최근 액션</div>
            <div className="recent-feed">
              {game.logs.length === 0 ? (
                <span className="feed-empty">스캔 대기 중</span>
              ) : (
                game.logs.slice(0, 4).map((entry) => (
                  <div
                    key={entry.id}
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
        </aside>
      </main>

      {/* BOTTOM TACTILE BAR */}
      <footer className="bottom-bar">
        <div className="team-vital-box">
          <div className="vital-header">
            <span className="vital-title">
              <Heart size={15} className="heart-icon" /> 팀 체력
            </span>
            <strong>
              {game.teamHp}/{game.maxTeamHp}
            </strong>
          </div>
          <div className="team-hp-track">
            <div className="team-hp-fill" style={{ width: `${teamHpPct}%` }} />
          </div>
          <div className="team-prot-row">
            <Shield size={13} /> 방어막 <strong>+{game.teamProtection}</strong>
          </div>
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
                  className={`lantern-icon ${player.lanternCharged ? 'charged' : ''}`}
                  title={player.lanternCharged ? '랜턴 충전됨' : '랜턴 미충전'}
                >
                  <Flame size={14} />
                  {player.lanternCharged ? '랜턴 ON' : '랜턴'}
                </span>
              </div>

              <button
                type="button"
                className="btn-exhaust"
                disabled={
                  game.phase !== 'maintenance' && game.phase !== 'coop_turn'
                }
                onClick={() => setGame((g) => declareExhaustion(g, player.slot))}
              >
                탈진
              </button>
            </div>
          ))}
        </div>

        {/* SYNERGY ULTIMATE METER / BUTTON */}
        <div className="synergy-box">
          {synergyReady ? (
            <button
              type="button"
              className="btn-synergy-ult"
              disabled={game.phase !== 'coop_turn'}
              onClick={handleTriggerSynergy}
              title={
                game.phase === 'coop_turn'
                  ? '무적 결계 관통 10 피해 + 팀 방어 +3'
                  : '협력 턴에 발동 가능'
              }
            >
              <Sparkles size={15} />
              성좌 공명 발동!
            </button>
          ) : (
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
          )}
        </div>

        <div className="phase-cta-box">
          {game.phase === 'coop_turn' && (
            <button
              type="button"
              className="btn-phase-next"
              onClick={() => setGame((g) => resolveBossCounterPhase(g))}
            >
              턴 종료 → 보스 반격
            </button>
          )}
          {game.phase === 'boss_counter' && (
            <button
              type="button"
              className="btn-phase-next"
              onClick={() => setGame((g) => proceedToMaintenance(g))}
            >
              정비 단계로
            </button>
          )}
          {game.phase === 'maintenance' && (
            <button
              type="button"
              className="btn-phase-next btn-next-round"
              onClick={() => setGame((g) => startNextRound(g))}
            >
              {game.round >= game.maxRounds
                ? '결과 판정'
                : `${game.round + 1}라운드 시작`}
            </button>
          )}
        </div>
      </footer>

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
          <div className="choice-modal" onClick={(e) => e.stopPropagation()}>
            <span className="modal-eyebrow">AETHERIA · 비전 보스 레이드</span>
            <h3>
              {game.boss.name} · {game.boss.subtitle}
            </h3>
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
      {(game.phase === 'victory' || game.phase === 'defeat') && (
        <div className="modal-backdrop">
          <div className={`result-modal result-${game.phase}`}>
            <span className="modal-eyebrow">AETHERIA · 비전 보스 레이드</span>
            <h2>{game.phase === 'victory' ? '레이드 승리!' : '레이드 패배'}</h2>
            <p>{game.endReason}</p>
            <div className="result-actions">
              <button
                type="button"
                className="btn-phase-next"
                onClick={() => handleRestart()}
              >
                다시 도전
              </button>
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
              <label>보스 선택</label>
              <div className="setup-options">
                {(Object.keys(BOSS_TEMPLATES) as BossId[]).map((id) => {
                  const tpl = BOSS_TEMPLATES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`setup-opt ${bossId === id ? 'selected' : ''}`}
                      onClick={() => setBossId(id)}
                    >
                      <strong>{tpl.name}</strong>
                      <span>
                        {tpl.subtitle} · {tpl.maxHp} HP
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-group">
                <label>P1 카드 덱</label>
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
              <div className="setup-group">
                <label>P2 카드 덱</label>
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
                onClick={() => handleRestart(bossId, p1Seeker, p2Seeker, relicId)}
              >
                레이드 시작
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
