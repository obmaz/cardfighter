import { describe, expect, it } from 'vitest';
import {
  applyAiCardAction,
  createInitialGameState,
  declareExhaustion,
  proceedToMaintenance,
  resolveBossCounterPhase,
  scanCard,
  startNextRound,
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
});
