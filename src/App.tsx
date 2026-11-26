import { useCallback, useState } from 'react';
import {
  Flame,
  Heart,
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
import {
  clearPendingColorChoice,
  commitCurrentChain,
  createInitialGameState,
  declareExhaustion,
  proceedToMaintenance,
  resolveBossCounterPhase,
  scanCard,
  startNextRound,
} from './engine/combatEngine';
import { BossViewportPixi } from './components/BossViewportPixi';
import { QrVisionScanner } from './components/QrVisionScanner';
import { QrTestDrawer } from './components/QrTestDrawer';
import { sfx } from './audio/sfx';
import type { BaseColor, BossId, GameState, RoundPhase, SeekerId } from './types/game';

const PHASE_LABEL: Record<RoundPhase, string> = {
  boss_stance: '1. 보스 태세 전개',
  coop_turn: '2. 탐구자 협력 턴',
  boss_counter: '3. 보스 반격 / 기믹',
  maintenance: '4. 정비 & 탈진 판정',
  victory: '레이드 승리!',
  defeat: '레이드 패배',
};

const COLOR_KO: Record<BaseColor | 'lantern', string> = {
  red: '빨강 (힘)',
  green: '초록 (기교)',
  blue: '파랑 (지혜)',
  lantern: '랜턴',
};

export function App() {
  const [bossId, setBossId] = useState<BossId>('vainglory_core');
  const [p1Seeker, setP1Seeker] = useState<SeekerId>('khor');
  const [p2Seeker, setP2Seeker] = useState<SeekerId>('asha');

  const [game, setGame] = useState<GameState>(() =>
    createInitialGameState('vainglory_core', 'khor', 'asha'),
  );
  const [muted, setMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const handleToggleMute = () => {
    const next = !muted;
    sfx.muted = next;
    setMuted(next);
  };

  const handleRestart = (
    nextBoss: BossId = bossId,
    nextP1: SeekerId = p1Seeker,
    nextP2: SeekerId = p2Seeker,
  ) => {
    setBossId(nextBoss);
    setP1Seeker(nextP1);
    setP2Seeker(nextP2);
    setGame(createInitialGameState(nextBoss, nextP1, nextP2));
    setScanStatus({ text: '새 레이드가 시작되었습니다. 카드를 스캔하세요!' });
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
            text: `${res.state.pendingColorChoice.card.name}: 사용할 속성을 선택하세요.`,
          });
        } else {
          const latest = res.state.logs[0];
          setScanStatus({
            text: latest
              ? `[${latest.cardName}] 스캔 완료 (${latest.note})`
              : `스캔 완료: ${qrCode}`,
          });
        }
        return res.state;
      });
    },
    [],
  );

  const handleColorPick = (color: BaseColor) => {
    const pending = game.pendingColorChoice;
    if (!pending) return;
    handleScanCode(pending.qrCode, color);
  };

  const bossTpl = BOSS_TEMPLATES[game.boss.id];
  const bossHpPct = Math.max(0, Math.round((game.boss.hp / game.boss.maxHp) * 100));
  const teamHpPct = Math.max(0, Math.round((game.teamHp / game.maxTeamHp) * 100));

  const remainingShieldSum =
    game.boss.shields.red + game.boss.shields.green + game.boss.shields.blue;
  const estimatedCounter =
    game.boss.baseCounterAttack +
    remainingShieldSum +
    (game.boss.isOverheated ? 2 : 0) +
    game.boss.challenges.reduce((s, c) => s + c.penaltyDamage, 0);

  return (
    <div className="raid-shell">
      {/* TOP BAR */}
      <header className="top-bar">
        <div className="boss-header-info">
          <div className="boss-title-row">
            <span className="boss-name">{game.boss.name}</span>
            <span className="boss-sub">{game.boss.subtitle}</span>
          </div>
          <div className="boss-hp-track">
            <div className="boss-hp-fill" style={{ width: `${bossHpPct}%` }} />
            <span className="boss-hp-text">
              HP {game.boss.hp} / {game.boss.maxHp}
            </span>
          </div>
        </div>

        <div className="round-phase-cluster">
          <div className="round-pill">
            라운드 <strong>{game.round}</strong> / {game.maxRounds}
          </div>
          <div className={`phase-pill phase-${game.phase}`}>
            {PHASE_LABEL[game.phase]}
          </div>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSetupOpen(true)}
          >
            <RotateCcw size={14} />
            보스/덱 설정
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleToggleMute}
            aria-label="사운드 토글"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      {/* MAIN 3-COLUMN ARENA */}
      <main className="arena-grid">
        {/* LEFT: BOSS INTENT & CHALLENGES */}
        <aside className="side-panel left-panel">
          <section className="panel-card">
            <h2 className="panel-heading">
              <Swords size={15} /> 보스 행동 예고
            </h2>
            <p className="intent-highlight">{game.boss.nextIntentText}</p>
            <div className="counter-forecast">
              <span>예상 반격 피해</span>
              <strong>
                {estimatedCounter} 데미지{' '}
                <small>(보호 {game.teamProtection} 차감 예정)</small>
              </strong>
            </div>
            <ul className="gimmick-list">
              {bossTpl.gimmickSummary.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="panel-card">
            <h2 className="panel-heading">
              <Zap size={15} /> 방해 챌린지 카드 ({game.boss.challenges.length})
            </h2>
            {game.boss.challenges.length === 0 ? (
              <p className="empty-hint">활성화된 방해 챌린지가 없습니다.</p>
            ) : (
              <div className="challenge-list">
                {game.boss.challenges.map((ch) => (
                  <div key={ch.id} className="challenge-card">
                    <div className="challenge-head">
                      <strong>{ch.name}</strong>
                      <span className="badge-green">초록으로 제거</span>
                    </div>
                    <p>{ch.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* CENTER: PIXI BOSS VIEWPORT + QR/VISION VIEWFINDER */}
        <section className="center-stage">
          <BossViewportPixi
            boss={game.boss}
            effectQueue={game.effectQueue}
            lastDiceRoll={game.lastDiceRoll}
          />
          <QrVisionScanner
            onScan={(code) => handleScanCode(code)}
            onOpenTestDeck={() => setDrawerOpen(true)}
            disabled={game.phase !== 'coop_turn'}
            lastScanStatus={scanStatus}
          />
        </section>

        {/* RIGHT: COMBO CHAIN & SCAN LOG */}
        <aside className="side-panel right-panel">
          <section className="panel-card">
            <div className="panel-heading-row">
              <h2 className="panel-heading">
                <Sparkles size={15} /> 현재 협력 콤보
              </h2>
              {game.activeChain.mainCard && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setGame((g) => commitCurrentChain(g))}
                >
                  세트 확정
                </button>
              )}
            </div>

            <div className="chain-box">
              {game.activeChain.mainCard ? (
                <>
                  <div className="chain-slot chain-main">
                    <span className="slot-tag">메인 카드</span>
                    <strong>{game.activeChain.mainCard.name}</strong>
                    <span
                      className={`color-dot dot-${game.activeChain.resolvedColor ?? 'red'}`}
                    >
                      {game.activeChain.resolvedColor
                        ? COLOR_KO[game.activeChain.resolvedColor]
                        : ''}
                    </span>
                  </div>
                  <div className="chain-boost-row">
                    {[0, 1].map((idx) => {
                      const b = game.activeChain.boostCards[idx];
                      return (
                        <div
                          key={idx}
                          className={`chain-slot chain-boost ${b ? 'filled' : ''}`}
                        >
                          <span className="slot-tag">부스트 {idx + 1}</span>
                          <strong>{b ? `${b.name} (+${b.boostValue})` : '대기 중'}</strong>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="empty-hint">
                  메인 카드 1장을 스캔하면 동료가 동일 색상 부스트를 최대 2장 연계할 수 있습니다.
                </p>
              )}
            </div>

            <div className="round-color-tracker">
              <span>이번 라운드 속성 분포:</span>
              <div className="color-counts">
                <span className="cnt-red">R {game.roundColorCounts.red}</span>
                <span className="cnt-green">G {game.roundColorCounts.green}</span>
                <span className="cnt-blue">B {game.roundColorCounts.blue}</span>
              </div>
            </div>
          </section>

          <section className="panel-card log-panel">
            <h2 className="panel-heading">스캔 카드 히스토리</h2>
            <div className="scan-log-list">
              {game.logs.length === 0 ? (
                <p className="empty-hint">아직 스캔된 카드가 없습니다.</p>
              ) : (
                game.logs.map((entry) => (
                  <div key={entry.id} className={`log-item log-${entry.resolvedColor}`}>
                    <div className="log-top">
                      <strong>
                        {entry.isBoost ? '↳ [부스트] ' : ''}
                        {entry.cardName}
                      </strong>
                      <span className="log-dmg">
                        {entry.damageDealt > 0 ? `-${entry.damageDealt}` : '효과'}
                      </span>
                    </div>
                    <div className="log-sub">
                      <span>
                        R{entry.round} · {entry.playerName}
                      </span>
                      <span>{entry.note}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </main>

      {/* BOTTOM PLAYER & PHASE BAR */}
      <footer className="bottom-bar">
        <div className="team-vital-box">
          <div className="vital-header">
            <span className="vital-title">
              <Heart size={15} className="heart-icon" /> 공유 팀 체력
            </span>
            <strong>
              {game.teamHp} / {game.maxTeamHp}
            </strong>
          </div>
          <div className="team-hp-track">
            <div className="team-hp-fill" style={{ width: `${teamHpPct}%` }} />
          </div>
          <div className="team-prot-row">
            <Shield size={13} /> 확보한 보호: <strong>{game.teamProtection}</strong>
          </div>
        </div>

        <div className="players-strip">
          {game.players.map((player) => (
            <div
              key={player.slot}
              className={`player-card player-${player.primaryColor}`}
            >
              <div className="player-top">
                <div>
                  <span className="player-slot-badge">P{player.slot + 1}</span>
                  <strong>{player.name}</strong>
                </div>
                <span
                  className={`lantern-badge ${player.lanternCharged ? 'charged' : ''}`}
                >
                  <Flame size={13} />
                  {player.lanternCharged ? '랜턴 충전됨!' : '랜턴 미충전'}
                </span>
              </div>

              <div className="player-bottom">
                <span className="hand-meta">
                  추정 손패 {player.cardsInHandEstimate}/{player.maxHandSize} · 탈진{' '}
                  {player.exhaustionCount}회
                </span>
                <button
                  type="button"
                  className="btn-exhaust"
                  disabled={
                    game.phase !== 'maintenance' && game.phase !== 'coop_turn'
                  }
                  onClick={() => setGame((g) => declareExhaustion(g, player.slot))}
                >
                  탈진 선언 (7장 보충)
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="phase-cta-box">
          {game.phase === 'coop_turn' && (
            <button
              type="button"
              className="btn-phase-next"
              onClick={() => setGame((g) => resolveBossCounterPhase(g))}
            >
              턴 종료 · 보스 반격
            </button>
          )}
          {game.phase === 'boss_counter' && (
            <button
              type="button"
              className="btn-phase-next"
              onClick={() => setGame((g) => proceedToMaintenance(g))}
            >
              정비 &amp; 탈진 판정으로
            </button>
          )}
          {game.phase === 'maintenance' && (
            <button
              type="button"
              className="btn-phase-next btn-next-round"
              onClick={() => setGame((g) => startNextRound(g))}
            >
              {game.round >= game.maxRounds
                ? '최종 결과 판정'
                : `${game.round + 1}라운드 시작`}
            </button>
          )}
        </div>
      </footer>

      {/* DUAL / COLORLESS ATTRIBUTE PICKER MODAL */}
      {game.pendingColorChoice && (
        <div className="modal-backdrop">
          <div className="choice-modal">
            <h3>이중 / 무색 속성 선택</h3>
            <p>
              <strong>{game.pendingColorChoice.card.name}</strong> 카드를 어느 속성으로
              발동할까요?
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
                  <small>현재 보스 보호막: {game.boss.shields[col]}</small>
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

      {/* VICTORY / DEFEAT OVERLAY */}
      {(game.phase === 'victory' || game.phase === 'defeat') && (
        <div className="modal-backdrop">
          <div className={`result-modal result-${game.phase}`}>
            <h2>{game.phase === 'victory' ? '레이드 승리!' : '레이드 패배'}</h2>
            <p>{game.endReason}</p>
            <div className="result-actions">
              <button
                type="button"
                className="btn-phase-next"
                onClick={() => handleRestart()}
              >
                다시 도전하기
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSetupOpen(true)}
              >
                보스 / 탐구자 변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOSS / SEEKER SETUP MODAL */}
      {setupOpen && (
        <div className="modal-backdrop" onClick={() => setSetupOpen(false)}>
          <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>보스 및 탐구자 편성</h3>
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
                        {tpl.subtitle} · {tpl.maxHp} HP ({tpl.difficulty})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-group">
                <label>플레이어 1 탐구자</label>
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
                <label>플레이어 2 탐구자</label>
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
                onClick={() => handleRestart(bossId, p1Seeker, p2Seeker)}
              >
                이 편성으로 레이드 시작
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
    </div>
  );
}

export default App;
