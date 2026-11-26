import { describe, expect, it } from 'vitest';
import { createBossIntent, getBossIntentByType } from '../../data/bosses';
import {
  applyAiCardAction,
  createInitialGameState,
  declareExhaustion,
  estimateBossCounter,
  proceedToMaintenance,
  resolveBossCounterPhase,
  scanCard,
  startNextRound,
  triggerSynergyUltimate,
} from '../combatEngine';

const zeroDiceRng = () => 0.99; // Always rolls 'blank' (0 bonus) for deterministic assertions

describe('Kinfire Delve QR Boss Raid Combat Engine', () => {
  it('initializes Vainglory Core with 50 HP, 10 Team HP, and 3-color shields', () => {
    const state = createInitialGameState('vainglory_core', 'khor', 'asha');
    expect(state.boss.hp).toBe(50);
    expect(state.teamHp).toBe(10);
    expect(state.boss.shields).toEqual({ red: 4, green: 2, blue: 3 });
    expect(state.round).toBe(1);
    expect(state.phase).toBe('coop_turn');
  });

  it('breaks matching shield and overflows damage to Boss HP', () => {
    const init = createInitialGameState('vainglory_core', 'khor', 'asha');
    // KD_KHOR_R01: red power 5. Red shield is 4 -> breaks shield + 1 overflow damage to HP!
    const { state, error } = scanCard(init, 'KD_KHOR_R01', undefined, zeroDiceRng);
    expect(error).toBeUndefined();
    expect(state.boss.shields.red).toBe(0);
    expect(state.boss.hp).toBe(49);
    expect(state.activeChain.mainCard?.id).toBe('KD_KHOR_R01');
  });

  it('chains up to 2 matching-color boost cards from ally', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    // Main card: KD_KHOR_R01 (power 5) -> breaks red shield 4, 1 HP dmg (49)
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    // Boost 1: KD_ASHA_R01 (boostValue 2) -> 2 HP dmg (47)
    state = scanCard(state, 'KD_ASHA_R01', undefined, zeroDiceRng).state;
    // Boost 2: KD_ASHA_R02 (boostValue 3) -> 3 HP dmg (44)
    state = scanCard(state, 'KD_ASHA_R02', undefined, zeroDiceRng).state;

    expect(state.activeChain.boostCards).toHaveLength(2);
    expect(state.boss.hp).toBe(44);
    // 3 red cards in one round triggers Overheat on Vainglory Core!
    expect(state.boss.isOverheated).toBe(true);
    expect(state.boss.overheatedColor).toBe('red');
    expect(state.boss.nextShieldBonus.red).toBe(3);
  });

  it('triggers Unstable (+50% dmg) when all 3 colors are played in a round', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // red
    state = scanCard(state, 'KD_ASHA_G08', undefined, zeroDiceRng).state; // green (power 5 vs 2 shield -> 3 overflow)
    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state; // blue (power 3 vs 3 shield -> breaks blue)

    expect(state.boss.isUnstable).toBe(true);
  });

  it('prompts color choice for dual/colorless cards when no color is specified', () => {
    const init = createInitialGameState('vainglory_core', 'khor', 'asha');
    const { state } = scanCard(init, 'KD_KHOR_DRG1', undefined, zeroDiceRng);
    expect(state.pendingColorChoice).not.toBeNull();
    expect(state.pendingColorChoice?.allowedColors).toEqual(['red', 'green']);

    const resolved = scanCard(state, 'KD_KHOR_DRG1', 'green', zeroDiceRng).state;
    expect(resolved.pendingColorChoice).toBeNull();
    expect(resolved.boss.shields.green).toBe(0);
  });

  it('enforces Kalos Prime invulnerability until Blue flask breaks and Lantern is scanned', () => {
    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    expect(state.boss.invulnerable).toBe(true);

    // Red attack breaks red shield (3) with 2 overflow, blocked by invulnerability
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.boss.shields.red).toBe(0);
    expect(state.boss.hp).toBe(45);

    // Blue attack (KD_ROLAND_B03 power 5) breaks Blue shield (4), charging Lantern!
    state = scanCard(state, 'KD_ROLAND_B03', undefined, zeroDiceRng).state;
    expect(state.boss.shields.blue).toBe(0);
    expect(state.players[1].lanternCharged).toBe(true);

    // Scanning Lantern pierces invulnerability and deals 12 damage!
    state = scanCard(state, 'KD_LANTERN_02', undefined, zeroDiceRng).state;
    expect(state.boss.invulnerable).toBe(false);
    expect(state.boss.hp).toBe(33);
    expect(state.players[1].lanternCharged).toBe(false);
  });

  it('charges Void Gauge on Exhaustion against Kalos Prime and triggers -4 AoE at 3 stacks', () => {
    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    state = declareExhaustion(state, 0);
    expect(state.boss.voidGauge).toBe(1);
    expect(state.teamHp).toBe(10);

    state = declareExhaustion(state, 1);
    expect(state.boss.voidGauge).toBe(2);
    expect(state.teamHp).toBe(10);

    state = declareExhaustion(state, 0);
    expect(state.boss.voidGauge).toBe(0);
    expect(state.teamHp).toBe(6);
  });

  it('applies remaining shields to Boss counterattack and advances rounds cleanly', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    // Default shields: 4 + 2 + 3 = 9, base counter = 2 -> total 11, minus protection
    state = scanCard(state, 'KD_KHOR_R06', undefined, zeroDiceRng).state; // red power 1 (red shield -> 3), protection +4
    // Remaining shields = 3 + 2 + 3 = 8, +2 base = 10, minus 4 protection = 6 dmg
    state = resolveBossCounterPhase(state);
    expect(state.teamHp).toBe(4);
    expect(state.phase).toBe('boss_counter');

    state = proceedToMaintenance(state);
    expect(state.phase).toBe('maintenance');

    state = startNextRound(state);
    expect(state.round).toBe(2);
    expect(state.phase).toBe('coop_turn');
  });

  it('executes Vision AI card action against shields, guard, and battleCry', () => {
    const init = createInitialGameState('vainglory_core', 'khor', 'asha');
    const { state, error } = applyAiCardAction(
      init,
      {
        cardName: '화염의 대검',
        color: 'red',
        skillTitle: '화염 일섬',
        damage: 6,
        guard: 2,
        disruptChallenge: false,
        specialNote: '강력한 붉은 참격',
        battleCry: '불꽃의 칼날로 붉은 방벽을 부순다!',
      },
      zeroDiceRng,
    );

    expect(error).toBeUndefined();
    expect(state.boss.shields.red).toBe(0);
    expect(state.boss.hp).toBe(48); // 6 - 4 shield = 2 HP damage
    expect(state.teamProtection).toBe(2);
    expect(state.lastAiAction?.cardName).toBe('화염의 대검');
  });

  it('triggers Melt (red+blue) elemental reaction, consumes primer, and shreds remaining shields', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'roland');
    // KD_KHOR_R06: red power 1 (red shield 4 -> 3), primes 'red'
    state = scanCard(state, 'KD_KHOR_R06', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBe('red');

    // Same color keeps primer without reaction (boostValue 2 -> red shield 3 -> 1)
    state = scanCard(state, 'KD_KHOR_R06', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBe('red');
    expect(state.lastReaction).toBeNull();

    // KD_KHOR_B01: blue power 3 -> Melt adds +3 (total 6 vs blue shield 3 -> breaks + 3 overflow)
    // and shreds all remaining shields by 1 (red 1 -> 0, green 2 -> 1, blue 0 -> 0)
    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBeNull();
    expect(state.lastReaction?.kind).toBe('melt');
    expect(state.boss.hp).toBe(47);
    expect(state.boss.shields).toEqual({ red: 0, green: 1, blue: 0 });
    expect(state.effectQueue.some((e) => e.kind === 'elemental_reaction')).toBe(true);
  });

  it('triggers Chrono (blue+green) elemental reaction, weakens counter, adds protection, and clears challenge', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    // Inject a non-green challenge so we confirm Chrono clears an extra challenge
    state = {
      ...state,
      boss: {
        ...state.boss,
        challenges: [
          {
            id: 'CH_TEST_1',
            name: '테스트 균열',
            requiredColor: 'red',
            penaltyDamage: 2,
            description: '테스트용 챌린지',
          },
          {
            id: 'CH_TEST_2',
            name: '테스트 쐐기',
            requiredColor: 'green',
            penaltyDamage: 2,
            description: '테스트용 챌린지 2',
          },
        ],
      },
    };

    // Prime green first (green card clears CH_TEST_2 via green disruption)
    state = scanCard(state, 'KD_ASHA_G08', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBe('green');
    expect(state.boss.challenges).toHaveLength(1);

    // Blue card triggers Chrono (green + blue): counterWeakened +2, teamProtection +2, clears remaining challenge
    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBeNull();
    expect(state.lastReaction?.kind).toBe('chrono');
    expect(state.boss.counterWeakened).toBe(2);
    expect(state.teamProtection).toBeGreaterThanOrEqual(2);
    expect(state.boss.challenges).toHaveLength(0);
  });

  it('triggers Shatter (red+green) elemental reaction with 1.5x attack multiplier', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    // Prime green with KD_ASHA_G08 (power 5 vs green shield 2 -> 3 HP dmg, HP 47)
    state = scanCard(state, 'KD_ASHA_G08', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBe('green');

    // Red card KD_KHOR_R01 (power 5) triggers Shatter: Math.ceil(5 * 1.5) = 8!
    // Red shield is 4 -> 4 overflow damage -> HP 47 - 4 = 43
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBeNull();
    expect(state.lastReaction?.kind).toBe('shatter');
    expect(state.boss.shields.red).toBe(0);
    expect(state.boss.hp).toBe(43);
  });

  it('accumulates Synergy Gauge to 100 and fires triggerSynergyUltimate piercing Kalos invulnerability', () => {
    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    expect(triggerSynergyUltimate(state).error).toBeDefined();

    // 1) Main red card (+15) + shield break (+15) = 30
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.synergyGauge).toBe(30);

    // 2) Blue card -> Melt reaction (+25) + Main (+15) + shield break (+15) = +55 -> 85
    state = scanCard(state, 'KD_ROLAND_B03', undefined, zeroDiceRng).state;
    expect(state.synergyGauge).toBe(85);

    // 3) Boost blue card (+20) -> capped at 100
    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state;
    expect(state.synergyGauge).toBe(100);
    expect(state.boss.invulnerable).toBe(true);

    // Fire Synergy Ultimate: resets gauge, deals 10 piercing dmg (45 -> 35), removes invuln, grants +3 protection
    const ult = triggerSynergyUltimate(state);
    expect(ult.error).toBeUndefined();
    expect(ult.state.synergyGauge).toBe(0);
    expect(ult.state.boss.hp).toBe(35);
    expect(ult.state.boss.invulnerable).toBe(false);
    expect(ult.state.teamProtection).toBeGreaterThanOrEqual(3);
    expect(ult.state.effectQueue.some((e) => e.kind === 'synergy_ultimate')).toBe(true);
  });

  it('triggers Phase 2 enrage transformation for Vainglory Core at <= 25 HP', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 26,
        shields: { red: 0, green: 0, blue: 0 },
      },
    };

    // Deal 5 dmg -> HP 21 (<= 25) -> Phase 2 triggers!
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.boss.hp).toBe(21);
    expect(state.boss.phase).toBe(2);
    expect(state.boss.phase2Triggered).toBe(true);
    expect(state.boss.subtitle).toBe('폭주 태엽 핵');
    expect(state.boss.baseCounterAttack).toBe(3);
    expect(state.boss.intent.type).toBe('abyss_overdrive');
    expect(state.boss.wellTriggered).toBe(true);
    expect(state.boss.challenges).toHaveLength(2);
    expect(state.boss.shields.red).toBe(2);
    expect(state.boss.shields.blue).toBe(2);
    expect(state.effectQueue.some((e) => e.kind === 'phase_two')).toBe(true);
  });

  it('triggers Phase 2 enrage transformation for Kalos Prime at <= 22 HP and clears Void challenge with Blue', () => {
    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 24,
        invulnerable: false,
        shields: { red: 0, green: 2, blue: 0 },
      },
    };

    // Deal 5 dmg -> HP 19 (<= 22) -> Phase 2 triggers!
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.boss.hp).toBe(19);
    expect(state.boss.phase).toBe(2);
    expect(state.boss.phase2Triggered).toBe(true);
    expect(state.boss.subtitle).toBe('공허 승천자 칼로스');
    expect(state.boss.invulnerable).toBe(true);
    expect(state.boss.intent.type).toBe('abyss_overdrive');
    expect(state.boss.challenges.some((c) => c.id === 'CH_VOID_PHASE2')).toBe(true);
    expect(state.effectQueue.some((e) => e.kind === 'phase_two')).toBe(true);

    // Blue card clears CH_VOID_PHASE2 directly
    state = scanCard(state, 'KD_ROLAND_B03', undefined, zeroDiceRng).state;
    expect(state.boss.challenges.some((c) => c.id === 'CH_VOID_PHASE2')).toBe(false);
  });

  it('rotates BossIntent deterministically and computes estimateBossCounter with counterWeakened and pierceGuard', () => {
    const r1 = createBossIntent('vainglory_core', 1, 1);
    expect(r1.type).toBe('counter_stance');

    const r2 = createBossIntent('kalos_prime', 2, 1, () => 0.9);
    expect(r2.type).toBe('void_drain');

    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    state = {
      ...state,
      teamProtection: 5,
      boss: {
        ...state.boss,
        shields: { red: 1, green: 1, blue: 1 },
        counterWeakened: 2,
        intent: getBossIntentByType('void_drain'), // bonus +1, pierceGuard 1, spawnChallenge true
      },
    };

    // raw = base(2) + shields(3) + bonus(1) - weakened(2) = 4
    // effectiveProtection = 5 - pierceGuard(1) = 4 -> absorbed = 4, net = 0
    const estimate = estimateBossCounter(state.boss, state.teamProtection);
    expect(estimate).toEqual({ raw: 4, absorbed: 4, net: 0, weakened: 2 });

    // resolveBossCounterPhase with void_drain spawns a challenge
    state = resolveBossCounterPhase(state);
    expect(state.boss.challenges).toHaveLength(1);

    // startNextRound resets counterWeakened and primedElement, and rolls Round 2 intent
    state = {
      ...state,
      boss: {
        ...state.boss,
        primedElement: 'red',
        counterWeakened: 2,
      },
    };
    state = proceedToMaintenance(state);
    state = startNextRound(state);
    expect(state.round).toBe(2);
    expect(state.boss.counterWeakened).toBe(0);
    expect(state.boss.primedElement).toBeNull();
    expect(state.boss.intent.type).not.toBe('counter_stance');
  });

  it('parses optional reactionHint and recommendedRole in Vision AI action', () => {
    const init = createInitialGameState('vainglory_core', 'khor', 'asha');
    const { state } = applyAiCardAction(
      init,
      {
        cardName: '서리 방패',
        color: 'blue',
        skillTitle: '빙결 방어',
        damage: 3,
        guard: 3,
        disruptChallenge: false,
        specialNote: '방어 및 원소 대기',
        battleCry: '파랑 원소를 부여해 융해를 준비하자!',
        reactionHint: '다음 빨강 카드로 과부하 융해 발동',
        recommendedRole: 'defender',
      },
      zeroDiceRng,
    );

    expect(state.lastAiAction?.reactionHint).toBe('다음 빨강 카드로 과부하 융해 발동');
    expect(state.lastAiAction?.recommendedRole).toBe('defender');
    expect(state.boss.primedElement).toBe('blue');
  });
});
