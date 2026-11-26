import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  analyzeCardWithAI,
  isAiConfigured,
  testAiConnection,
} from '../../ai/visionAgent';
import { createBossIntent, getBossIntentByType, getScaledBossStats } from '../../data/bosses';
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
import {
  computeRaidGrade,
  loadRaidCodex,
  recordVictoryToCodex,
} from '../raidCodex';

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
    // Boost 2: KD_ASHA_R02 (boostValue 3) + Chain Finisher (+4) -> 7 HP dmg (40)
    state = scanCard(state, 'KD_ASHA_R02', undefined, zeroDiceRng).state;

    expect(state.activeChain.boostCards).toHaveLength(2);
    expect(state.boss.hp).toBe(40);
    expect(state.effectQueue.some((e) => e.kind === 'chain_finisher')).toBe(true);
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

    // KD_KHOR_B01: blue power 3 -> Melt adds +3 (+2 from default prism_lens = total 8 vs blue shield 3 -> breaks + 5 overflow)
    // and shreds all remaining shields by 1 (red 1 -> 0, green 2 -> 1, blue 0 -> 0)
    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBeNull();
    expect(state.lastReaction?.kind).toBe('melt');
    expect(state.boss.hp).toBe(45);
    expect(state.boss.shields).toEqual({ red: 0, green: 1, blue: 0 });
    expect(state.boss.lastBark).not.toBeNull();
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

    // Red card KD_KHOR_R01 (power 5) triggers Shatter: Math.ceil(5 * 1.5) = 8 + 2 (default prism_lens) = 10!
    // Red shield is 4 -> 6 overflow damage -> HP 47 - 6 = 41
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.boss.primedElement).toBeNull();
    expect(state.lastReaction?.kind).toBe('shatter');
    expect(state.boss.shields.red).toBe(0);
    expect(state.boss.hp).toBe(41);
  });

  it('accumulates Synergy Gauge to 100 and fires triggerSynergyUltimate piercing Kalos invulnerability', () => {
    let state = createInitialGameState('kalos_prime', 'khor', 'roland');
    expect(triggerSynergyUltimate(state).error).toBeDefined();

    // 1) Main red card (+15) + shield break (+15) = 30
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state;
    expect(state.synergyGauge).toBe(30);

    // 2) Blue card -> Melt reaction (+25) + prism_lens (+5) + Main (+15) + shield break (+15) = +60 -> 90
    state = scanCard(state, 'KD_ROLAND_B03', undefined, zeroDiceRng).state;
    expect(state.synergyGauge).toBe(90);

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

  it('handles Chronos Wyrm stance shifts, accelerate counter +1, chrono flip +4, rewind heal, and Phase 2', () => {
    let state = createInitialGameState('chronos_wyrm', 'khor', 'asha', 'vision_amplifier');
    expect(state.boss.hp).toBe(48);
    expect(state.boss.shields).toEqual({ red: 3, green: 3, blue: 3 });
    expect(state.boss.temporalStance).toBe('accelerate');

    // Accelerate adds +1 to raw counter: base(2) + shields(9) + accelerate(1) = 12
    expect(estimateBossCounter(state.boss, 0).raw).toBe(12);

    // Trigger Chrono (green + blue) while in accelerate: +4 bonus damage & flips to rewind
    state = scanCard(state, 'KD_ASHA_G08', undefined, zeroDiceRng).state; // green power 5 vs 3 shield -> 2 HP dmg (46)
    expect(state.boss.hp).toBe(46);

    state = scanCard(state, 'KD_KHOR_B01', undefined, zeroDiceRng).state; // blue power 3 + 4 (chrono flip) = 7 vs 3 shield -> 4 HP dmg (42)
    expect(state.boss.temporalStance).toBe('rewind');
    expect(state.boss.hp).toBe(42);
    expect(state.boss.lastBark).toBe('시간의 궤도가 역전되었다!');

    // Rewind grants +15 synergy on boost or shield break
    const gaugeBefore = state.synergyGauge;
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // breaks red shield (3) -> +15 main + 15 break + 15 rewind = +45
    expect(state.synergyGauge).toBe(Math.min(100, gaugeBefore + 45));

    // Rewind heals boss +2 HP on counter when shields remain (restore 1 green shield & clear stagger to isolate heal test)
    state = {
      ...state,
      teamProtection: 10,
      boss: {
        ...state.boss,
        staggered: false,
        shields: { red: 0, green: 1, blue: 0 },
      },
    };
    const hpBeforeCounter = state.boss.hp;
    state = resolveBossCounterPhase(state);
    expect(state.boss.hp).toBe(hpBeforeCounter + 2);

    // startNextRound toggles temporalStance from rewind -> accelerate
    state = proceedToMaintenance(state);
    state = startNextRound(state);
    expect(state.boss.temporalStance).toBe('accelerate');

    // Phase 2 at <= 24 HP
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 25,
        shields: { red: 0, green: 0, blue: 0 },
      },
    };
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // 5 dmg -> 20 HP <= 24
    expect(state.boss.phase).toBe(2);
    expect(state.boss.phase2Triggered).toBe(true);
    expect(state.boss.subtitle).toBe('영겁의 시간 포식자');
    expect(state.boss.shields).toEqual({ red: 2, green: 2, blue: 2 });
    expect(state.boss.challenges.some((c) => c.id === 'CH_CHRONO_P2')).toBe(true);
    expect(state.boss.intent.type).toBe('abyss_overdrive');
  });

  it('applies all 4 Relic effects (prism_lens, aegis_core, chrono_dial, vision_amplifier)', () => {
    // 1. prism_lens vs non-prism reaction damage & synergy
    let prism = createInitialGameState('vainglory_core', 'khor', 'asha', 'prism_lens');
    prism = scanCard(prism, 'KD_ASHA_G08', undefined, zeroDiceRng).state;
    prism = scanCard(prism, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // Shatter + prism_lens (+2 dmg, +5 synergy)
    expect(prism.boss.hp).toBe(41);
    expect(prism.synergyGauge).toBe(90);

    // 2. aegis_core: starts with +3 teamProtection and +1 on every shield break
    let aegis = createInitialGameState('vainglory_core', 'khor', 'asha', 'aegis_core');
    expect(aegis.teamProtection).toBe(3);
    aegis = scanCard(aegis, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // 0 card protection, breaks red shield -> +1
    expect(aegis.teamProtection).toBe(4);

    // 3. chrono_dial: first boost of round gets +2 power and +10 synergy, second boost does not
    let dial = createInitialGameState('vainglory_core', 'khor', 'asha', 'chrono_dial');
    dial = scanCard(dial, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // main: breaks red (4), 1 overflow -> HP 49, gauge 30
    dial = scanCard(dial, 'KD_ASHA_R01', undefined, zeroDiceRng).state; // 1st boost (boostValue 2 + 2 dial = 4 dmg -> HP 45, gauge +20+10 = 60)
    expect(dial.boss.hp).toBe(45);
    expect(dial.synergyGauge).toBe(60);
    dial = scanCard(dial, 'KD_ASHA_R02', undefined, zeroDiceRng).state; // 2nd boost (boostValue 3 + 4 Chain Finisher -> HP 38, gauge +20 + 15 Finisher = 95)
    expect(dial.boss.hp).toBe(38);
    expect(dial.synergyGauge).toBe(95);

    // 4. vision_amplifier: AI Vision card gains +2 damage and +1 guard
    const vis = createInitialGameState('vainglory_core', 'khor', 'asha', 'vision_amplifier');
    const res = applyAiCardAction(
      vis,
      {
        cardName: '비전 화염',
        color: 'red',
        skillTitle: '증폭 화염',
        damage: 4,
        guard: 1,
        disruptChallenge: false,
        specialNote: '테스트',
        battleCry: '증폭!',
      },
      zeroDiceRng,
    );
    // 4 + 2 = 6 vs red shield 4 -> 2 overflow HP dmg (48), guard 1 + 1 = 2
    expect(res.state.boss.hp).toBe(48);
    expect(res.state.teamProtection).toBe(2);
  });

  it('staggers boss on 2 reactions in a round OR breaking all 3 shields, nullifying counter and boosting HP dmg by 1.25x', () => {
    // Path A: 2 Elemental Reactions in one round (even with shields remaining)
    let stateA = createInitialGameState('vainglory_core', 'khor', 'asha', 'vision_amplifier');
    stateA = scanCard(stateA, 'KD_KHOR_R06', undefined, zeroDiceRng).state; // primes red
    stateA = scanCard(stateA, 'KD_KHOR_B01', undefined, zeroDiceRng).state; // Reaction 1 (Melt)
    expect(stateA.boss.roundReactions).toBe(1);
    expect(stateA.boss.staggered).toBe(false);

    stateA = scanCard(stateA, 'KD_ASHA_G08', undefined, zeroDiceRng).state; // primes green
    stateA = scanCard(stateA, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // Reaction 2 (Shatter) -> Stagger!
    expect(stateA.boss.roundReactions).toBe(2);
    expect(stateA.boss.staggered).toBe(true);
    expect(stateA.boss.staggerCount).toBe(1);
    expect(stateA.effectQueue.some((e) => e.kind === 'boss_stagger')).toBe(true);

    // While staggered, incoming HP damage gets 1.25x bonus (KD_KHOR_R03 chains as boostValue 3; red shield 0, unstable + staggered = ceil(3 * 1.5 * 1.25) = 6)
    const hpBeforeStaggerHit = stateA.boss.hp;
    stateA = scanCard(stateA, 'KD_KHOR_R03', undefined, zeroDiceRng).state;
    expect(hpBeforeStaggerHit - stateA.boss.hp).toBe(6);

    // Counterattack is nullified (estimateBossCounter returns net 0; resolveBossCounterPhase deals 0)
    expect(estimateBossCounter(stateA.boss, 0)).toEqual({
      raw: 0,
      absorbed: 0,
      net: 0,
      weakened: stateA.boss.counterWeakened,
    });
    const teamHpBefore = stateA.teamHp;
    stateA = resolveBossCounterPhase(stateA);
    expect(stateA.teamHp).toBe(teamHpBefore);

    // startNextRound resets staggered and roundReactions
    stateA = proceedToMaintenance(stateA);
    stateA = startNextRound(stateA);
    expect(stateA.boss.staggered).toBe(false);
    expect(stateA.boss.roundReactions).toBe(0);
    expect(stateA.boss.staggerCount).toBe(1);

    // Path B: Breaking all 3 shields in a round (with < 2 reactions)
    let stateB = createInitialGameState('vainglory_core', 'khor', 'asha', 'vision_amplifier');
    stateB = scanCard(stateB, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // red -> 0, primes red
    stateB = scanCard(stateB, 'KD_ASHA_G08', undefined, zeroDiceRng).state; // green -> 0 (Reaction 1 Shatter)
    expect(stateB.boss.staggered).toBe(false);
    stateB = scanCard(stateB, 'KD_KHOR_B01', undefined, zeroDiceRng).state; // blue -> 0 -> all 3 shields 0 -> Stagger!
    expect(stateB.boss.shields).toEqual({ red: 0, green: 0, blue: 0 });
    expect(stateB.boss.staggered).toBe(true);
    expect(stateB.boss.staggerCount).toBe(1);
  });

  it('tracks RaidStats, computes S/A/B/C RaidRank grades, and handles codex safely', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha');
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // 5 dmg, 1 shield broken
    state = scanCard(state, 'KD_ASHA_G08', undefined, zeroDiceRng).state; // Shatter: 10 dmg (8 + 2 prism), 1 shield broken, 1 reaction
    state = applyAiCardAction(
      state,
      {
        cardName: '비전 일격',
        color: 'blue',
        skillTitle: '비전 일격',
        damage: 4,
        guard: 0,
        disruptChallenge: false,
        specialNote: '테스트',
        battleCry: '발동!',
      },
      zeroDiceRng,
    ).state; // 4 dmg, 1 shield broken -> all 3 shields broken -> stagger!

    expect(state.stats.totalDamageDealt).toBe(19);
    expect(state.stats.maxSingleHit).toBe(10);
    expect(state.stats.reactionsTriggered).toBe(1);
    expect(state.stats.shieldsBroken).toBe(3);
    expect(state.stats.aiScansCount).toBe(1);

    // Non-victory grade
    expect(computeRaidGrade(state).rank).toBe('C');
    expect(computeRaidGrade(state).label).toBe('토벌 실패');

    // Victory grade S (>=95): round 1 (max 8 -> +56), teamHp 10 (+30), base 50, reaction (+5), stagger (+10)
    const victoryState = { ...state, phase: 'victory' as const };
    const gradeS = computeRaidGrade(victoryState);
    expect(gradeS.rank).toBe('S');
    expect(gradeS.score).toBeGreaterThanOrEqual(95);

    // Grade B/C check on late victory with low HP & exhaustions
    const hardWinState = {
      ...state,
      phase: 'victory' as const,
      round: 8,
      teamHp: 2,
      stats: { ...state.stats, reactionsTriggered: 0 },
      boss: { ...state.boss, staggerCount: 0 },
      players: [
        { ...state.players[0], exhaustionCount: 1 },
        { ...state.players[1], exhaustionCount: 1 },
      ] as typeof state.players,
    };
    expect(computeRaidGrade(hardWinState).rank).toBe('C');

    // Safe localStorage guard in Node
    expect(loadRaidCodex()).toEqual({});
    expect(recordVictoryToCodex(victoryState).vainglory_core?.bestRank).toBe('S');
  });

  it('supports zero-key demo mode in visionAgent (DEFAULT_AI_CONFIG, isAiConfigured, analyzeCardWithAI)', async () => {
    expect(DEFAULT_AI_CONFIG.mode).toBe('demo');
    expect(isAiConfigured(DEFAULT_AI_CONFIG)).toBe(true);
    expect(await testAiConnection(DEFAULT_AI_CONFIG)).toContain('데모');

    const state = createInitialGameState('chronos_wyrm', 'khor', 'asha');
    const primedState = {
      ...state,
      boss: { ...state.boss, primedElement: 'red' as const },
    };

    const action = await analyzeCardWithAI(
      'data:image/jpeg;base64,AAAA',
      primedState.boss,
      DEFAULT_AI_CONFIG,
    );
    expect(action.color).toBe('blue'); // complements primed 'red' for Melt
    expect(action.damage).toBeGreaterThanOrEqual(1);
    expect(action.reactionHint).toBeTruthy();
  });

  it('scales boss HP, shields, baseCounterAttack, Phase 2 threshold, and RaidGrade score across Heroic and Abyss difficulties', () => {
    const heroicStats = getScaledBossStats('vainglory_core', 'heroic');
    expect(heroicStats.maxHp).toBe(60); // 50 * 1.2
    expect(heroicStats.phase2HpThreshold).toBe(30); // round(25 * 1.2)
    expect(heroicStats.baseShields).toEqual({ red: 4, green: 3, blue: 3 }); // lowest green +1
    expect(heroicStats.baseCounterAttack).toBe(2);

    expect(getScaledBossStats('kalos_prime', 'heroic').baseShields).toEqual({
      red: 3,
      green: 3,
      blue: 4,
    });
    expect(getScaledBossStats('chronos_wyrm', 'heroic').baseShields).toEqual({
      red: 3,
      green: 4,
      blue: 3,
    });

    const abyssState = createInitialGameState(
      'vainglory_core',
      'khor',
      'asha',
      'prism_lens',
      'abyss',
    );
    expect(abyssState.difficulty).toBe('abyss');
    expect(abyssState.boss.maxHp).toBe(68); // ceil(50 * 1.35)
    expect(abyssState.boss.shields).toEqual({ red: 5, green: 3, blue: 4 });
    expect(abyssState.boss.baseCounterAttack).toBe(3);

    // Phase 2 triggers at scaled threshold (round(25 * 1.35) = 34)
    let p2Test = {
      ...abyssState,
      boss: {
        ...abyssState.boss,
        hp: 36,
        shields: { red: 0, green: 0, blue: 0 },
      },
    };
    p2Test = scanCard(p2Test, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // 5 dmg -> 31 <= 34
    expect(p2Test.boss.phase).toBe(2);

    // startNextRound preserves Abyss shield scaling
    let roundState = resolveBossCounterPhase(abyssState);
    roundState = proceedToMaintenance(roundState);
    roundState = startNextRound(roundState);
    expect(roundState.boss.shields).toEqual({ red: 5, green: 3, blue: 4 });

    // computeRaidGrade adds +15 for heroic and +30 for abyss
    const normalWin = {
      ...createInitialGameState('vainglory_core', 'khor', 'asha', 'prism_lens', 'normal'),
      phase: 'victory' as const,
      round: 8,
      teamHp: 1,
    };
    const heroicWin = { ...normalWin, difficulty: 'heroic' as const };
    const abyssWin = { ...normalWin, difficulty: 'abyss' as const };
    const normalScore = computeRaidGrade(normalWin).score;
    expect(computeRaidGrade(heroicWin).score).toBe(normalScore + 15);
    expect(computeRaidGrade(abyssWin).score).toBe(normalScore + 30);
  });

  it('triggers Full 3-Card Chain Finisher on 2nd boost with +4 dmg, +15 synergy, bark, and chain_finisher event', () => {
    let state = createInitialGameState('vainglory_core', 'khor', 'asha', 'vision_amplifier');
    state = scanCard(state, 'KD_KHOR_R01', undefined, zeroDiceRng).state; // main red 5 -> 1 HP dmg (49), gauge 30
    state = scanCard(state, 'KD_ASHA_R01', undefined, zeroDiceRng).state; // boost 1 (2) -> HP 47, gauge 50
    expect(state.effectQueue.some((e) => e.kind === 'chain_finisher')).toBe(false);

    state = scanCard(state, 'KD_ASHA_R02', undefined, zeroDiceRng).state; // boost 2 (3) + Finisher (+4) -> 7 dmg (HP 40), gauge +20+15 = 85
    expect(state.boss.hp).toBe(40);
    expect(state.synergyGauge).toBe(85);
    expect(state.boss.lastBark).toBe('셋의 힘이 하나로 얽힌다고?!');
    expect(state.logs[0]?.note).toContain('트리플 공명 피니시! (+4)');
    expect(
      state.effectQueue.some(
        (e) => e.kind === 'chain_finisher' && e.label.includes('트리플 공명 피니시'),
      ),
    ).toBe(true);
  });
});
