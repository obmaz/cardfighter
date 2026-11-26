import type {
  BaseColor,
  BossId,
  BossIntent,
  BossIntentType,
  BossState,
  DifficultyTier,
  RngFn,
  ShieldPool,
} from '../types/game';

export const GAUNTLET_ORDER: BossId[] = [
  'vainglory_core',
  'kalos_prime',
  'chronos_wyrm',
];

export const DIFFICULTY_META: Record<
  DifficultyTier,
  {
    id: DifficultyTier;
    label: string;
    hpMultiplier: number;
    scoreBonus: number;
    description: string;
  }
> = {
  normal: {
    id: 'normal',
    label: '표준 (Normal)',
    hpMultiplier: 1.0,
    scoreBonus: 0,
    description: '기본 밸런스 레이드',
  },
  heroic: {
    id: 'heroic',
    label: '영웅 (Heroic)',
    hpMultiplier: 1.2,
    scoreBonus: 15,
    description: '보스 체력 +20%, 취약 보호막 +1, 클리어 점수 +15',
  },
  abyss: {
    id: 'abyss',
    label: '심연 (Abyss)',
    hpMultiplier: 1.35,
    scoreBonus: 30,
    description: '보스 체력 +35%, 전 보호막 +1, 기본 반격 +1, 클리어 점수 +30',
  },
};

export interface BossTemplate {
  id: BossId;
  name: string;
  subtitle: string;
  phase2HpThreshold: number;
  phase2Title: string;
  difficulty: string;
  maxHp: number;
  maxRounds: number;
  baseShields: ShieldPool;
  baseCounterAttack: number;
  gimmickSummary: string[];
}

export const BOSS_INTENT_CATALOG: Record<BossIntentType, BossIntent> = {
  counter_stance: {
    type: 'counter_stance',
    title: '반격 태세',
    description: '잔여 보호막 합계 + 기본 반격 피해',
    bonusDamage: 0,
    shieldRegen: 0,
    spawnChallenge: false,
    pierceGuard: 0,
  },
  heavy_slam: {
    type: 'heavy_slam',
    title: '대지 강타',
    description: '기본 반격 +2 추가 피해',
    bonusDamage: 2,
    shieldRegen: 0,
    spawnChallenge: false,
    pierceGuard: 0,
  },
  shield_regen: {
    type: 'shield_regen',
    title: '장갑 재생',
    description: '반격 시 모든 보호막 +1 재생 (다음 라운드 반영)',
    bonusDamage: 0,
    shieldRegen: 1,
    spawnChallenge: false,
    pierceGuard: 0,
  },
  void_drain: {
    type: 'void_drain',
    title: '공허 침식',
    description: '반격 +1, 방어 1 관통, 챌린지 1장 소환',
    bonusDamage: 1,
    shieldRegen: 0,
    spawnChallenge: true,
    pierceGuard: 1,
  },
  abyss_overdrive: {
    type: 'abyss_overdrive',
    title: '심연 폭주 파동',
    description: '강력한 전체 반격 +3 피해',
    bonusDamage: 3,
    shieldRegen: 0,
    spawnChallenge: false,
    pierceGuard: 0,
  },
};

export function getBossIntentByType(type: BossIntentType): BossIntent {
  return { ...BOSS_INTENT_CATALOG[type] };
}

export function createBossIntent(
  bossId: BossId,
  round: number,
  phase: 1 | 2,
  rng?: RngFn,
): BossIntent {
  if (round <= 1 && phase === 1) {
    return getBossIntentByType('counter_stance');
  }

  let pool: BossIntentType[];
  if (phase === 2) {
    pool = ['abyss_overdrive', 'heavy_slam', 'shield_regen', 'void_drain'];
  } else if (bossId === 'kalos_prime' || bossId === 'chronos_wyrm') {
    pool = ['heavy_slam', 'shield_regen', 'void_drain'];
  } else {
    pool = ['heavy_slam', 'shield_regen', 'counter_stance'];
  }

  const index = rng
    ? Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)))
    : (round + phase) % pool.length;

  return getBossIntentByType(pool[index]);
}

export const BOSS_TEMPLATES: Record<BossId, BossTemplate> = {
  vainglory_core: {
    id: 'vainglory_core',
    name: '바인글로리 코어',
    subtitle: '심연의 태엽 골렘',
    phase2HpThreshold: 25,
    phase2Title: '폭주 태엽 핵',
    difficulty: '입문 / 밸런스형',
    maxHp: 50,
    maxRounds: 8,
    baseShields: { red: 4, green: 2, blue: 3 },
    baseCounterAttack: 2,
    gimmickSummary: [
      '원소 공명: 빨강+파랑=[과부하 융해](+3·전보호막-1) · 파랑+초록=[시간 균열](반격-2·방어+2·해제) · 빨강+초록=[파쇄 치명타](1.5x)',
      '단일 라운드 동일 속성 3장 이상 시 [과열], 3속성 모두 사용 시 [불안정(피해 +50%)] 발동 · 합동 게이지 100% 시 [성좌 공명] 발동',
      '체력 25 이하 시 [PHASE 2: 폭주 태엽 핵] 각성 — 반격 강화, 심연 폭주 파동 전환 및 방해 챌린지 2장·보호막 보강',
    ],
  },
  kalos_prime: {
    id: 'kalos_prime',
    name: '칼로스 프라임',
    subtitle: '공허의 연금술사',
    phase2HpThreshold: 22,
    phase2Title: '공허 승천자 칼로스',
    difficulty: '기믹 / 퍼즐형',
    maxHp: 45,
    maxRounds: 8,
    baseShields: { red: 3, green: 2, blue: 4 },
    baseCounterAttack: 2,
    gimmickSummary: [
      '기본 [무적 결계] 전개: 파랑(지혜) 보호막 파괴로 랜턴을 충전하거나, 합동 궁극기 [성좌 공명]으로 무적을 관통',
      '원소 공명(융해/시간 균열/파쇄)과 AI 보스 인텐트(공허 침식·방어 관통)에 맞춰 공략 조합을 설계',
      '체력 22 이하 시 [PHASE 2: 공허 승천자 칼로스] 각성 — 무적 결계 재전개 및 공허 승천 결계 소환 · 탈진 3회 시 팀 -4 피해',
    ],
  },
  chronos_wyrm: {
    id: 'chronos_wyrm',
    name: '크로노스 웜',
    subtitle: '시간의 포식자',
    phase2HpThreshold: 24,
    phase2Title: '영겁의 시간 포식자',
    difficulty: '전략 / 태세 전환형',
    maxHp: 48,
    maxRounds: 8,
    baseShields: { red: 3, green: 3, blue: 3 },
    baseCounterAttack: 2,
    gimmickSummary: [
      '[시간 태세 전환]: 매 라운드 [가속] ↔ [역행] 태세를 교대합니다.',
      '[가속 태세]: 반격 피해 +1. [시간 균열(파랑+초록)] 발동 시 추가 피해 +4를 입히고 즉시 [역행]으로 전환합니다.',
      '[역행 태세]: 부스트 체인/보호막 파쇄 시 공명 게이지 +15 추가! 단, 반격 시 보호막이 남아있으면 보스 체력 +2 회복!',
      '[PHASE 2 (HP 24 이하)]: 영겁의 시간 포식자 각성 — 전 보호막 +2, 시간 왜곡 챌린지(초록 해제) 출현.',
    ],
  },
};

export function getScaledBossStats(
  bossId: BossId,
  difficulty: DifficultyTier = 'normal',
): {
  maxHp: number;
  phase2HpThreshold: number;
  baseShields: ShieldPool;
  baseCounterAttack: number;
} {
  const tpl = BOSS_TEMPLATES[bossId];
  const meta = DIFFICULTY_META[difficulty];

  const maxHp =
    difficulty === 'normal'
      ? tpl.maxHp
      : Math.ceil(tpl.maxHp * meta.hpMultiplier);
  const phase2HpThreshold =
    difficulty === 'normal'
      ? tpl.phase2HpThreshold
      : Math.round(tpl.phase2HpThreshold * meta.hpMultiplier);

  let baseShields: ShieldPool = { ...tpl.baseShields };
  if (difficulty === 'heroic') {
    const tieOrder: BaseColor[] = ['green', 'blue', 'red'];
    let lowestColor: BaseColor = 'green';
    for (const c of tieOrder) {
      if (baseShields[c] < baseShields[lowestColor]) {
        lowestColor = c;
      }
    }
    baseShields = {
      ...baseShields,
      [lowestColor]: baseShields[lowestColor] + 1,
    };
  } else if (difficulty === 'abyss') {
    baseShields = {
      red: baseShields.red + 1,
      green: baseShields.green + 1,
      blue: baseShields.blue + 1,
    };
  }

  const baseCounterAttack =
    tpl.baseCounterAttack + (difficulty === 'abyss' ? 1 : 0);

  return {
    maxHp,
    phase2HpThreshold,
    baseShields,
    baseCounterAttack,
  };
}

export function createInitialBossState(
  bossId: BossId,
  difficulty: DifficultyTier = 'normal',
): BossState {
  const tpl = BOSS_TEMPLATES[bossId];
  const scaled = getScaledBossStats(bossId, difficulty);
  const initialIntent = createBossIntent(bossId, 1, 1);
  const nextIntentText =
    bossId === 'kalos_prime'
      ? '무적 결계 전개 중 · 파랑 플라스크를 깨서 랜턴을 충전하라'
      : bossId === 'chronos_wyrm'
        ? `가속 태세 (+1 반격) · ${initialIntent.title} (${initialIntent.description})`
        : `${initialIntent.title} · ${initialIntent.description}`;

  return {
    id: tpl.id,
    name: tpl.name,
    subtitle: tpl.subtitle,
    hp: scaled.maxHp,
    maxHp: scaled.maxHp,
    shields: { ...scaled.baseShields },
    maxShields: { ...scaled.baseShields },
    nextShieldBonus: { red: 0, green: 0, blue: 0 },
    isUnstable: false,
    isOverheated: false,
    overheatedColor: null,
    invulnerable: bossId === 'kalos_prime',
    voidGauge: 0,
    wellTriggered: false,
    challenges: [],
    nextIntentText,
    baseCounterAttack: scaled.baseCounterAttack,
    phase: 1,
    phase2Triggered: false,
    primedElement: null,
    counterWeakened: 0,
    intent: initialIntent,
    temporalStance: bossId === 'chronos_wyrm' ? 'accelerate' : null,
    lastBark: null,
    staggered: false,
    roundReactions: 0,
    staggerCount: 0,
  };
}
