import type { RelicDef, RelicId } from '../types/game';

export const RELIC_CATALOG: Record<RelicId, RelicDef> = {
  prism_lens: {
    id: 'prism_lens',
    name: '프리즘 렌즈',
    subtitle: '반응 증폭',
    description: '원소 반응 발동 시 위력 +2 및 공명 게이지 +5 추가 획득',
  },
  aegis_core: {
    id: 'aegis_core',
    name: '아이기스 심장',
    subtitle: '수호 강화',
    description: '레이드 시작 시 팀 방어막 +3, 보스 보호막 파쇄마다 팀 방어막 +1',
  },
  chrono_dial: {
    id: 'chrono_dial',
    name: '시간의 나침반',
    subtitle: '체인 가속',
    description: '라운드 첫 부스트 체인 시 부스트 위력 +2 및 공명 게이지 +10 추가',
  },
  vision_amplifier: {
    id: 'vision_amplifier',
    name: '비전 증폭기',
    subtitle: 'AI 카드 공명',
    description: 'AI 비전 인식으로 발동한 카드에 위력 +2 및 팀 방어막 +1 추가',
  },
};

export const RELIC_LIST: RelicDef[] = [
  RELIC_CATALOG.prism_lens,
  RELIC_CATALOG.aegis_core,
  RELIC_CATALOG.chrono_dial,
  RELIC_CATALOG.vision_amplifier,
];
