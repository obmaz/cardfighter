import type { BossId, BossState, ShieldPool } from '../types/game';

export interface BossTemplate {
  id: BossId;
  name: string;
  subtitle: string;
  difficulty: string;
  maxHp: number;
  maxRounds: number;
  baseShields: ShieldPool;
  baseCounterAttack: number;
  gimmickSummary: string[];
}

export const BOSS_TEMPLATES: Record<BossId, BossTemplate> = {
  vainglory_core: {
    id: 'vainglory_core',
    name: '바인글로리 코어',
    subtitle: '심연의 태엽 골렘',
    difficulty: '입문 / 밸런스형',
    maxHp: 50,
    maxRounds: 8,
    baseShields: { red: 4, green: 2, blue: 3 },
    baseCounterAttack: 2,
    gimmickSummary: [
      '단일 라운드 내 동일 속성 3장 이상 스캔 시, 다음 라운드 해당 보호막 +3 및 과열 반격(+2) 발동',
      '빨강·초록·파랑 3속성을 모두 사용하면 [불안정] 상태 돌입 (받는 피해 +50%)',
      '체력 25 이하 시 [우물의 심연]: 방해 챌린지 2장 생성 (초록 카드로 제거, 미제거 시 장당 팀 체력 -2)',
    ],
  },
  kalos_prime: {
    id: 'kalos_prime',
    name: '칼로스 프라임',
    subtitle: '공허의 연금술사',
    difficulty: '기믹 / 퍼즐형',
    maxHp: 45,
    maxRounds: 8,
    baseShields: { red: 3, green: 2, blue: 4 },
    baseCounterAttack: 2,
    gimmickSummary: [
      '기본 [무적 보호막] 전개: 충전된 킨파이어 랜턴을 스캔해야 본체 무적을 관통해 피해 부여 가능',
      '파랑 보호막(실험 플라스크) 파괴 시 탐구자의 랜턴 즉시 충전!',
      '탐구자가 [탈진] 선언 시 공허 게이지 +1 (3칸 누적 시 즉시 팀 전체 -4 피해)',
    ],
  },
};

export function createInitialBossState(bossId: BossId): BossState {
  const tpl = BOSS_TEMPLATES[bossId];
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
        ? '잔여 보호막 합계 + 기본 반격(2) 피해 준비'
        : '무적 결계 전개 중 · 파랑 플라스크를 깨서 랜턴을 충전하라',
    baseCounterAttack: tpl.baseCounterAttack,
  };
}
