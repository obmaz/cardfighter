import rawCards from './cards.json';
import type { BaseColor, CardColor, CardDef, SeekerId } from '../types/game';

export const CARDS: CardDef[] = rawCards as CardDef[];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

export interface SeekerMeta {
  id: SeekerId;
  name: string;
  title: string;
  primaryColor: BaseColor;
  description: string;
}

export const SEEKER_ROSTER: Record<SeekerId, SeekerMeta> = {
  khor: {
    id: 'khor',
    name: '코르 (Khor)',
    title: '불꽃의 선봉장',
    primaryColor: 'red',
    description: '빨강(힘) 주력 · 단일 고위력 타격, 보호막 파쇄 및 팀 보호 특화',
  },
  asha: {
    id: 'asha',
    name: '아샤 (Asha)',
    title: '그림자 곡예사',
    primaryColor: 'green',
    description: '초록(기교) 주력 · 다중 주사위 연타 및 방해 챌린지 파훼 특화',
  },
  roland: {
    id: 'roland',
    name: '롤랜드 (Roland)',
    title: '성좌의 학자',
    primaryColor: 'blue',
    description: '파랑(지혜) 주력 · 마법 타격, 회복 지원 및 플라스크/기믹 공략 특화',
  },
};

export function getAllowedColors(color: CardColor): BaseColor[] {
  switch (color) {
    case 'red':
    case 'green':
    case 'blue':
      return [color];
    case 'dual_rg':
      return ['red', 'green'];
    case 'dual_gb':
      return ['green', 'blue'];
    case 'dual_rb':
      return ['red', 'blue'];
    case 'colorless':
      return ['red', 'green', 'blue'];
    case 'lantern':
      return [];
  }
}

export function getCardsForSeeker(seekerId: SeekerId): CardDef[] {
  return CARDS.filter((c) => c.seeker === seekerId);
}
