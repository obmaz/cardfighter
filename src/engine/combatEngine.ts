import { BOSS_TEMPLATES, createInitialBossState } from '../data/bosses';
import { CARD_BY_ID, SEEKER_ROSTER, getAllowedColors } from '../data/cards';
import type {
  AiCardAction,
  BaseColor,
  BossId,
  CardDef,
  ChallengeCard,
  CombatEffectEvent,
  DiceDieResult,
  DiceRollSummary,
  GameState,
  PlayerState,
  SeekerId,
} from '../types/game';

export type RngFn = () => number;

const COLOR_LABEL: Record<BaseColor | 'lantern', string> = {
  red: '빨강(힘)',
  green: '초록(기교)',
  blue: '파랑(지혜)',
  lantern: '킨파이어 랜턴',
};

function createPlayer(slot: 0 | 1, seekerId: SeekerId): PlayerState {
  const meta = SEEKER_ROSTER[seekerId];
  return {
    slot,
    seekerId,
    name: meta.name,
    primaryColor: meta.primaryColor,
    lanternCharged: false,
    exhaustionCount: 0,
    maxHandSize: 7,
    cardsInHandEstimate: 7,
    actedThisRound: false,
  };
}

export function createInitialGameState(
  bossId: BossId = 'vainglory_core',
  p1Seeker: SeekerId = 'khor',
  p2Seeker: SeekerId = 'asha',
): GameState {
  return {
    boss: createInitialBossState(bossId),
    round: 1,
    maxRounds: BOSS_TEMPLATES[bossId].maxRounds,
    phase: 'coop_turn',
    teamHp: 10,
    maxTeamHp: 10,
    teamProtection: 0,
    players: [createPlayer(0, p1Seeker), createPlayer(1, p2Seeker)],
    activeChain: {
      ownerSlot: 0,
      mainCard: null,
      resolvedColor: null,
      boostCards: [],
    },
    roundColorCounts: { red: 0, green: 0, blue: 0 },
    lastDiceRoll: null,
    lastAiAction: null,
    pendingColorChoice: null,
    logs: [],
    effectQueue: [
      {
        id: 1,
        kind: 'boss_enrage',
        color: bossId === 'kalos_prime' ? 'void' : 'red',
        label: `${BOSS_TEMPLATES[bossId].name} 조우! 1라운드 시작`,
      },
    ],
    nextEventId: 2,
    endReason: null,
  };
}

export function rollDice(
  count: number,
  targetColor: BaseColor | 'lantern',
  nextId: number,
  rng: RngFn = Math.random,
): DiceRollSummary | null {
  if (count <= 0) return null;
  const clamped = Math.min(4, count);
  const faces: Array<BaseColor | 'wild' | 'blank'> = [
    'red',
    'green',
    'blue',
    'wild',
    'wild',
    'blank',
  ];
  const results: DiceDieResult[] = [];
  let totalBonus = 0;

  for (let i = 0; i < clamped; i++) {
    const face = faces[Math.floor(rng() * faces.length)] ?? 'blank';
    let bonusPower = 0;
    if (face === 'wild') {
      bonusPower = 2;
    } else if (face !== 'blank' && (face === targetColor || targetColor === 'lantern')) {
      bonusPower = 2;
    } else if (face !== 'blank') {
      bonusPower = 1;
    }
    totalBonus += bonusPower;
    results.push({ index: i, face, bonusPower });
  }

  return {
    id: nextId,
    results,
    totalBonus,
  };
}

function pushEvent(
  state: GameState,
  event: Omit<CombatEffectEvent, 'id'>,
): GameState {
  const id = state.nextEventId;
  return {
    ...state,
    nextEventId: id + 1,
    effectQueue: [...state.effectQueue.slice(-14), { ...event, id }],
  };
}

function createWellChallenges(): ChallengeCard[] {
  return [
    {
      id: 'CH_ABYSS_1',
      name: '심연의 톱니 쐐기',
      requiredColor: 'green',
      penaltyDamage: 2,
      description: '초록 카드로 제거 필요 (미제거 시 반격 페이즈 팀 체력 -2)',
    },
    {
      id: 'CH_ABYSS_2',
      name: '과부하 방해 장치',
      requiredColor: 'green',
      penaltyDamage: 2,
      description: '초록 카드로 제거 필요 (미제거 시 반격 페이즈 팀 체력 -2)',
    },
  ];
}

export function resolveCardOwnerSlot(state: GameState, card: CardDef): 0 | 1 {
  if (card.seeker === 'shared') {
    if (state.players[0].lanternCharged) return 0;
    if (state.players[1].lanternCharged) return 1;
    return state.activeChain.ownerSlot;
  }
  const matchIdx = state.players.findIndex((p) => p.seekerId === card.seeker);
  if (matchIdx === 0 || matchIdx === 1) return matchIdx;
  return state.activeChain.ownerSlot;
}

export function clearPendingColorChoice(state: GameState): GameState {
  return { ...state, pendingColorChoice: null };
}

export function commitCurrentChain(state: GameState): GameState {
  if (!state.activeChain.mainCard) return state;
  const ownerSlot = state.activeChain.ownerSlot;
  const nextSlot: 0 | 1 = ownerSlot === 0 ? 1 : 0;
  const players: [PlayerState, PlayerState] = [
    state.players[0].slot === ownerSlot
      ? { ...state.players[0], actedThisRound: true }
      : state.players[0],
    state.players[1].slot === ownerSlot
      ? { ...state.players[1], actedThisRound: true }
      : state.players[1],
  ];

  return {
    ...state,
    players,
    activeChain: {
      ownerSlot: players[nextSlot].actedThisRound ? ownerSlot : nextSlot,
      mainCard: null,
      resolvedColor: null,
      boostCards: [],
    },
  };
}

export function scanCard(
  prevState: GameState,
  rawQrCode: string,
  chosenColor?: BaseColor,
  rng: RngFn = Math.random,
): { state: GameState; error?: string } {
  const qrCode = rawQrCode.trim().toUpperCase();
  const card = CARD_BY_ID[qrCode];
  if (!card) {
    return {
      state: prevState,
      error: `등록되지 않은 카드 QR 코드입니다: ${qrCode}`,
    };
  }
  return resolveCardExecution(prevState, qrCode, card, chosenColor, rng);
}

export function applyAiCardAction(
  prevState: GameState,
  action: AiCardAction,
  rng: RngFn = Math.random,
): { state: GameState; error?: string } {
  const safeDamage = Math.max(1, Math.min(15, Math.round(action.damage)));
  const safeGuard = Math.max(0, Math.min(5, Math.round(action.guard)));
  const virtualCard: CardDef = {
    id: `AI_VISION_${action.color.toUpperCase()}`,
    seeker: 'shared',
    name: action.skillTitle || action.cardName,
    color: action.color,
    power: safeDamage,
    boostValue: Math.max(1, Math.min(5, Math.round(safeDamage * 0.6))),
    protection: safeGuard,
    diceCount: 0,
    keywords: action.disruptChallenge ? ['disrupt'] : ['strike'],
    description: action.specialNote || action.battleCry,
  };

  const result = resolveCardExecution(
    prevState,
    `AI:${action.cardName}`,
    virtualCard,
    action.color === 'lantern' ? undefined : action.color,
    rng,
  );
  return {
    state: {
      ...result.state,
      lastAiAction: action,
    },
    error: result.error,
  };
}

function resolveCardExecution(
  prevState: GameState,
  qrCode: string,
  card: CardDef,
  chosenColor?: BaseColor,
  rng: RngFn = Math.random,
): { state: GameState; error?: string } {
  if (prevState.phase !== 'coop_turn') {
    return {
      state: prevState,
      error: '현재는 [탐구자 협력 턴] 페이즈가 아닙니다.',
    };
  }

  let state: GameState = { ...prevState, pendingColorChoice: null };

  // Handle Kinfire Lantern scan
  if (card.color === 'lantern') {
    const chargedPlayerIdx = state.players.findIndex((p) => p.lanternCharged);
    if (chargedPlayerIdx === -1) {
      return {
        state: pushEvent(state, {
          kind: 'blocked',
          color: 'lantern',
          label: '랜턴이 아직 충전되지 않았습니다!',
        }),
        error: '충전된 킨파이어 랜턴이 없습니다. 보호막을 파괴해 충전하세요.',
      };
    }

    const casterIdx = chargedPlayerIdx as 0 | 1;
    const dice = rollDice(card.diceCount, 'lantern', state.nextEventId, rng);
    const totalPower = card.power + (dice?.totalBonus ?? 0);
    const multiplier = state.boss.isUnstable ? 1.5 : 1;
    const damage = Math.ceil(totalPower * multiplier);

    const players: [PlayerState, PlayerState] = [
      casterIdx === 0 ? { ...state.players[0], lanternCharged: false } : state.players[0],
      casterIdx === 1 ? { ...state.players[1], lanternCharged: false } : state.players[1],
    ];

    const newBossHp = Math.max(0, state.boss.hp - damage);
    const brokeInvuln = state.boss.invulnerable;

    state = {
      ...state,
      players,
      teamProtection: state.teamProtection + card.protection,
      lastDiceRoll: dice,
      boss: {
        ...state.boss,
        hp: newBossHp,
        invulnerable: false,
      },
      logs: [
        {
          id: state.nextEventId,
          round: state.round,
          qrCode,
          cardName: card.name,
          playerName: players[casterIdx].name,
          resolvedColor: 'lantern' as const,
          isBoost: false,
          damageDealt: damage,
          shieldBroken: brokeInvuln,
          note: brokeInvuln ? '무적 결계 관통! 직격 피해' : '랜턴 궁극기 직격',
        },
        ...state.logs,
      ].slice(0, 30),
    };

    state = pushEvent(state, {
      kind: 'lantern_beam',
      color: 'lantern',
      amount: damage,
      label: `킨파이어 랜턴 해방! -${damage} HP`,
    });

    if (state.boss.id === 'vainglory_core' && newBossHp <= 25 && newBossHp > 0 && !state.boss.wellTriggered) {
      state = {
        ...state,
        boss: {
          ...state.boss,
          wellTriggered: true,
          challenges: createWellChallenges(),
        },
      };
      state = pushEvent(state, {
        kind: 'boss_enrage',
        color: 'red',
        label: '[우물의 심연] 방해 챌린지 2장 출현!',
      });
    }

    if (newBossHp <= 0) {
      return {
        state: {
          ...state,
          phase: 'victory',
          endReason: `${state.boss.name}을(를) ${state.round}라운드 만에 격파했습니다!`,
        },
      };
    }

    return { state };
  }

  // Standard / Dual / Colorless cards
  const allowedColors = getAllowedColors(card.color);
  const currentChain = state.activeChain;

  // Determine whether this scan continues the active chain as Boost or starts a new Main Card
  let isBoost = false;
  let resolvedColor: BaseColor | null = null;

  if (currentChain.mainCard && currentChain.resolvedColor && currentChain.resolvedColor !== 'lantern') {
    const chainColor = currentChain.resolvedColor;
    const canMatchChain = allowedColors.includes(chainColor);
    const hasBoostRoom = currentChain.boostCards.length < 2;

    if (canMatchChain && hasBoostRoom) {
      isBoost = true;
      resolvedColor = chosenColor && allowedColors.includes(chosenColor) ? chosenColor : chainColor;
      // If a dual/colorless card matches the active chain color, auto-boost unless user explicitly picks another
      if (resolvedColor !== chainColor && hasBoostRoom) {
        // User intentionally picked a different color -> commit previous chain and start new main!
        isBoost = false;
      }
    } else {
      // Auto-commit previous chain if full or mismatched color
      state = commitCurrentChain(state);
    }
  }

  if (!isBoost) {
    if (allowedColors.length === 1) {
      resolvedColor = allowedColors[0];
    } else if (chosenColor && allowedColors.includes(chosenColor)) {
      resolvedColor = chosenColor;
    } else {
      return {
        state: {
          ...state,
          pendingColorChoice: {
            qrCode,
            card,
            allowedColors,
          },
        },
      };
    }
  }

  if (!resolvedColor) {
    return { state, error: '속성 결정에 실패했습니다.' };
  }

  const ownerSlot = isBoost
    ? state.activeChain.ownerSlot === 0
      ? 1
      : 0
    : resolveCardOwnerSlot(state, card);

  const dice = rollDice(card.diceCount, resolvedColor, state.nextEventId, rng);
  const baseValue = isBoost ? card.boostValue : card.power;
  const rawAttack = baseValue + (dice?.totalBonus ?? 0);

  // Decrement estimated hand count for scanned player
  const actingPlayer = state.players[ownerSlot];
  const updatedPlayers: [PlayerState, PlayerState] = [
    ownerSlot === 0
      ? {
          ...state.players[0],
          cardsInHandEstimate: Math.max(0, state.players[0].cardsInHandEstimate - 1),
        }
      : state.players[0],
    ownerSlot === 1
      ? {
          ...state.players[1],
          cardsInHandEstimate: Math.max(0, state.players[1].cardsInHandEstimate - 1),
        }
      : state.players[1],
  ];

  // Heal keyword
  const healAmount = card.keywords.includes('heal') ? 1 : 0;
  const nextTeamHp = Math.min(state.maxTeamHp, state.teamHp + healAmount);

  // Challenge disruption (Green or disrupt keyword)
  let challenges = [...state.boss.challenges];
  let clearedChallenge: ChallengeCard | null = null;
  if (
    challenges.length > 0 &&
    (resolvedColor === 'green' || card.keywords.includes('disrupt'))
  ) {
    clearedChallenge = challenges.shift() ?? null;
  }

  // Apply damage to matching color Shield first, overflow to Boss HP
  const currentShield = state.boss.shields[resolvedColor];
  let shieldDamage = 0;
  let overflowPower = rawAttack;
  let newShieldValue = currentShield;
  let shieldBrokenNow = false;

  if (currentShield > 0) {
    shieldDamage = Math.min(currentShield, rawAttack);
    newShieldValue = currentShield - shieldDamage;
    overflowPower = rawAttack - shieldDamage;
    if (newShieldValue === 0) {
      shieldBrokenNow = true;
    }
  }

  let hpDamage = 0;
  let blockedByInvuln = false;
  if (overflowPower > 0) {
    if (state.boss.invulnerable) {
      blockedByInvuln = true;
    } else {
      const mult = state.boss.isUnstable ? 1.5 : 1;
      hpDamage = Math.ceil(overflowPower * mult);
    }
  }

  const nextShields = {
    ...state.boss.shields,
    [resolvedColor]: newShieldValue,
  };

  // Lantern charging triggers
  let lanternChargedMsg = '';
  const finalPlayers: [PlayerState, PlayerState] = [{ ...updatedPlayers[0] }, { ...updatedPlayers[1] }];

  if (state.boss.id === 'kalos_prime' && resolvedColor === 'blue' && shieldBrokenNow) {
    finalPlayers[ownerSlot].lanternCharged = true;
    lanternChargedMsg = ' · 실험 플라스크 파쇄 → 랜턴 충전!';
  } else if (
    state.boss.id === 'vainglory_core' &&
    shieldBrokenNow &&
    nextShields.red === 0 &&
    nextShields.green === 0 &&
    nextShields.blue === 0
  ) {
    finalPlayers[ownerSlot].lanternCharged = true;
    lanternChargedMsg = ' · 전 보호막 붕괴 → 랜턴 충전!';
  }

  const newBossHp = Math.max(0, state.boss.hp - hpDamage);

  // Adaptive AI tracking
  const nextColorCounts = {
    ...state.roundColorCounts,
    [resolvedColor]: state.roundColorCounts[resolvedColor] + 1,
  };

  let isUnstable = state.boss.isUnstable;
  let justBecameUnstable = false;
  if (
    state.boss.id === 'vainglory_core' &&
    !isUnstable &&
    nextColorCounts.red >= 1 &&
    nextColorCounts.green >= 1 &&
    nextColorCounts.blue >= 1
  ) {
    isUnstable = true;
    justBecameUnstable = true;
  }

  let isOverheated = state.boss.isOverheated;
  let overheatedColor = state.boss.overheatedColor;
  const nextShieldBonus = { ...state.boss.nextShieldBonus };
  let justOverheated = false;

  if (
    state.boss.id === 'vainglory_core' &&
    nextColorCounts[resolvedColor] >= 3 &&
    overheatedColor !== resolvedColor
  ) {
    isOverheated = true;
    overheatedColor = resolvedColor;
    nextShieldBonus[resolvedColor] = 3;
    justOverheated = true;
  }

  // Update activeChain
  const nextChain = isBoost
    ? {
        ...state.activeChain,
        boostCards: [...state.activeChain.boostCards, card],
      }
    : {
        ownerSlot,
        mainCard: card,
        resolvedColor,
        boostCards: [],
      };

  const totalEffectiveDamage = shieldDamage + hpDamage;
  const logNoteParts: string[] = [];
  if (isBoost) logNoteParts.push(`부스트 +${card.boostValue}`);
  if (dice && dice.totalBonus > 0) logNoteParts.push(`주사위 +${dice.totalBonus}`);
  if (card.protection > 0) logNoteParts.push(`보호 +${card.protection}`);
  if (shieldBrokenNow) logNoteParts.push(`${COLOR_LABEL[resolvedColor]} 보호막 파쇄!`);
  if (blockedByInvuln) logNoteParts.push('본체 무적에 막힘 (랜턴 필요)');
  if (clearedChallenge) logNoteParts.push(`챌린지 [${clearedChallenge.name}] 제거`);

  state = {
    ...state,
    teamHp: nextTeamHp,
    teamProtection: state.teamProtection + card.protection,
    players: finalPlayers,
    activeChain: nextChain,
    roundColorCounts: nextColorCounts,
    lastDiceRoll: dice ?? state.lastDiceRoll,
    boss: {
      ...state.boss,
      hp: newBossHp,
      shields: nextShields,
      nextShieldBonus,
      isUnstable,
      isOverheated,
      overheatedColor,
      challenges,
    },
    logs: [
      {
        id: state.nextEventId,
        round: state.round,
        qrCode,
        cardName: card.name,
        playerName: actingPlayer.name,
        resolvedColor,
        isBoost,
        damageDealt: totalEffectiveDamage,
        shieldBroken: shieldBrokenNow,
        note: (logNoteParts.join(' · ') || '일반 타격') + lanternChargedMsg,
      },
      ...state.logs,
    ].slice(0, 30),
  };

  // Emit visual FX events
  if (dice) {
    state = pushEvent(state, {
      kind: 'dice_roll',
      color: resolvedColor,
      amount: dice.totalBonus,
      label: `주사위 ${dice.results.length}개 (+${dice.totalBonus})`,
    });
  }

  state = pushEvent(state, {
    kind: isBoost ? 'boost_chain' : 'card_hit',
    color: resolvedColor,
    amount: totalEffectiveDamage,
    label: blockedByInvuln && shieldDamage === 0
      ? '무적 결계 방어!'
      : `${card.name} -${totalEffectiveDamage}`,
  });

  if (shieldBrokenNow) {
    state = pushEvent(state, {
      kind: 'shield_break',
      color: resolvedColor,
      label: `${COLOR_LABEL[resolvedColor]} 보호막 파괴!`,
    });
  }
  if (clearedChallenge) {
    state = pushEvent(state, {
      kind: 'challenge_clear',
      color: 'green',
      label: `방해 챌린지 해제: ${clearedChallenge.name}`,
    });
  }
  if (justBecameUnstable) {
    state = pushEvent(state, {
      kind: 'boss_unstable',
      color: 'blue',
      label: '3색 균형 공격! 보스 [불안정] (피해 +50%)',
    });
  }
  if (justOverheated) {
    state = pushEvent(state, {
      kind: 'boss_enrage',
      color: resolvedColor,
      label: `과열 경고! ${COLOR_LABEL[resolvedColor]} 과다 사용 → 반격 강화`,
    });
  }

  if (
    state.boss.id === 'vainglory_core' &&
    newBossHp <= 25 &&
    newBossHp > 0 &&
    !state.boss.wellTriggered
  ) {
    state = {
      ...state,
      boss: {
        ...state.boss,
        wellTriggered: true,
        challenges: createWellChallenges(),
      },
    };
    state = pushEvent(state, {
      kind: 'boss_enrage',
      color: 'red',
      label: '[우물의 심연] 방해 챌린지 2장 출현!',
    });
  }

  if (newBossHp <= 0) {
    return {
      state: {
        ...state,
        phase: 'victory',
        endReason: `${state.boss.name}을(를) ${state.round}라운드 만에 격파했습니다!`,
      },
    };
  }

  return { state };
}

export function resolveBossCounterPhase(prevState: GameState): GameState {
  if (prevState.phase !== 'coop_turn') return prevState;
  let state = commitCurrentChain(prevState);

  const remainingShieldSum =
    state.boss.shields.red + state.boss.shields.green + state.boss.shields.blue;
  const overheatBonus = state.boss.isOverheated ? 2 : 0;
  const challengePenalty = state.boss.challenges.reduce(
    (sum, ch) => sum + ch.penaltyDamage,
    0,
  );
  const rawBossAttack =
    state.boss.baseCounterAttack + remainingShieldSum + overheatBonus + challengePenalty;

  const absorbed = Math.min(state.teamProtection, rawBossAttack);
  const netDamage = Math.max(0, rawBossAttack - absorbed);
  const nextTeamHp = Math.max(0, state.teamHp - netDamage);

  state = {
    ...state,
    phase: nextTeamHp <= 0 ? 'defeat' : 'boss_counter',
    teamHp: nextTeamHp,
    teamProtection: 0,
    logs: [
      {
        id: state.nextEventId,
        round: state.round,
        qrCode: 'BOSS_COUNTER',
        cardName: `${state.boss.name} 반격`,
        playerName: '보스 AI',
        resolvedColor: 'red' as const,
        isBoost: false,
        damageDealt: netDamage,
        shieldBroken: false,
        note: `총공격 ${rawBossAttack} (잔여보호막 ${remainingShieldSum} + 기본 ${state.boss.baseCounterAttack}${
          overheatBonus > 0 ? ` + 과열 ${overheatBonus}` : ''
        }${challengePenalty > 0 ? ` + 챌린지 ${challengePenalty}` : ''}) · 보호 ${absorbed} 차감 → 팀 -${netDamage} HP`,
      },
      ...state.logs,
    ].slice(0, 30),
    endReason:
      nextTeamHp <= 0 ? '탐구자 공유 체력이 0이 되어 패배했습니다.' : state.endReason,
  };

  state = pushEvent(state, {
    kind: 'boss_counter',
    color: state.boss.id === 'kalos_prime' ? 'void' : 'red',
    amount: netDamage,
    label:
      netDamage > 0
        ? `보스 반격! 팀 체력 -${netDamage} (보호 ${absorbed} 흡수)`
        : `완벽 방어! 보스 공격 ${rawBossAttack} 전량 흡수`,
  });

  return state;
}

export function proceedToMaintenance(state: GameState): GameState {
  if (state.phase !== 'boss_counter') return state;
  return {
    ...state,
    phase: 'maintenance',
  };
}

export function declareExhaustion(prevState: GameState, playerSlot: 0 | 1): GameState {
  if (prevState.phase !== 'maintenance' && prevState.phase !== 'coop_turn') {
    return prevState;
  }

  let state = prevState;
  const target = state.players[playerSlot];
  const nextMaxHand = Math.max(4, target.maxHandSize - 1);

  const players: [PlayerState, PlayerState] = [
    playerSlot === 0
      ? {
          ...state.players[0],
          exhaustionCount: state.players[0].exhaustionCount + 1,
          maxHandSize: nextMaxHand,
          cardsInHandEstimate: 7,
        }
      : state.players[0],
    playerSlot === 1
      ? {
          ...state.players[1],
          exhaustionCount: state.players[1].exhaustionCount + 1,
          maxHandSize: nextMaxHand,
          cardsInHandEstimate: 7,
        }
      : state.players[1],
  ];

  // Vainglory Core exhaustion penalty: -1 Team HP
  // Kalos Prime exhaustion reaction: +1 Void Gauge -> at 3, -4 Team HP AoE
  let teamHp = state.teamHp;
  let voidGauge = state.boss.voidGauge;
  let note = `손패 7장 보충 (최대 핸드 ${nextMaxHand})`;

  if (state.boss.id === 'kalos_prime') {
    voidGauge += 1;
    if (voidGauge >= 3) {
      voidGauge = 0;
      teamHp = Math.max(0, teamHp - 4);
      note += ' · 공허 게이지 3칸 폭발! 팀 체력 -4!';
    } else {
      note += ` · 공허 게이지 ${voidGauge}/3 누적`;
    }
  } else {
    teamHp = Math.max(0, teamHp - 1);
    note += ' · 탈진 반동 팀 체력 -1';
  }

  state = {
    ...state,
    players,
    teamHp,
    boss: {
      ...state.boss,
      voidGauge,
    },
    phase: teamHp <= 0 ? 'defeat' : state.phase,
    endReason: teamHp <= 0 ? '탈진 대미지로 팀 체력이 0이 되었습니다.' : state.endReason,
    logs: [
      {
        id: state.nextEventId,
        round: state.round,
        qrCode: 'EXHAUSTION',
        cardName: '탈진 선언',
        playerName: target.name,
        resolvedColor: 'blue' as const,
        isBoost: false,
        damageDealt: 0,
        shieldBroken: false,
        note,
      },
      ...state.logs,
    ].slice(0, 30),
  };

  state = pushEvent(state, {
    kind: 'exhaustion',
    color: 'void',
    label: `${target.name} 탈진! 손패 7장 보충`,
  });

  return state;
}

export function startNextRound(prevState: GameState): GameState {
  if (prevState.phase !== 'maintenance' && prevState.phase !== 'boss_counter') {
    return prevState;
  }

  if (prevState.round >= prevState.maxRounds) {
    return {
      ...prevState,
      phase: 'defeat',
      endReason: `제한 라운드(${prevState.maxRounds}라운드) 내에 ${prevState.boss.name}을(를) 처치하지 못했습니다.`,
    };
  }

  const nextRound = prevState.round + 1;
  const tpl = BOSS_TEMPLATES[prevState.boss.id];
  const nextShields = {
    red: tpl.baseShields.red + prevState.boss.nextShieldBonus.red,
    green: tpl.baseShields.green + prevState.boss.nextShieldBonus.green,
    blue: tpl.baseShields.blue + prevState.boss.nextShieldBonus.blue,
  };

  let state: GameState = {
    ...prevState,
    round: nextRound,
    phase: 'coop_turn',
    roundColorCounts: { red: 0, green: 0, blue: 0 },
    activeChain: {
      ownerSlot: 0,
      mainCard: null,
      resolvedColor: null,
      boostCards: [],
    },
    players: [
      { ...prevState.players[0], actedThisRound: false },
      { ...prevState.players[1], actedThisRound: false },
    ],
    boss: {
      ...prevState.boss,
      shields: nextShields,
      maxShields: { ...nextShields },
      nextShieldBonus: { red: 0, green: 0, blue: 0 },
      isUnstable: false,
      isOverheated: false,
      overheatedColor: null,
      invulnerable: prevState.boss.id === 'kalos_prime',
      nextIntentText:
        prevState.boss.id === 'kalos_prime'
          ? '무적 결계 재전개 · 파랑 플라스크 파쇄로 랜턴 충전'
          : `보호막 R${nextShields.red} / G${nextShields.green} / B${nextShields.blue} 전개`,
    },
  };

  state = pushEvent(state, {
    kind: 'boss_enrage',
    color: prevState.boss.id === 'kalos_prime' ? 'void' : 'red',
    label: `${nextRound}라운드 시작 · 보스 태세 전개!`,
  });

  return state;
}
