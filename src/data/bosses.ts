import type {
  BossId,
  BossIntent,
  BossIntentType,
  BossState,
  RngFn,
  ShieldPool,
} from '../types/game';

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
  } else if (bossId === 'kalos_prime') {
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
};

export function createInitialBossState(bossId: BossId): BossState {
  const tpl = BOSS_TEMPLATES[bossId];
  const initialIntent = createBossIntent(bossId, 1, 1);
  return {
    id: tpl.id,
    name: tpl.name,
    subtitle: tpl.subtitle,
    hp: tpl.maxHp,
    maxHp: tpl.maxHp,
    shields: { ...tpl.baseShields },
    maxShields: { ...tpl.baseShields },
    nextShieldBonus: { red: 0, green: 0, blue: 0 },
    isUnstable: false,
    isOverheated: false,
    overheatedColor: null,
    invulnerable: bossId === 'kalos_prime',
    voidGauge: 0,
    wellTriggered: false,
    challenges: [],
    nextIntentText:
      bossId === 'vainglory_core'
        ? `${initialIntent.title} · ${initialIntent.description}`
        : '무적 결계 전개 중 · 파랑 플라스크를 깨서 랜턴을 충전하라',
    baseCounterAttack: tpl.baseCounterAttack,
    phase: 1,
    phase2Triggered: false,
    primedElement: null,
    counterWeakened: 0,
    intent: initialIntent,
  };
}
