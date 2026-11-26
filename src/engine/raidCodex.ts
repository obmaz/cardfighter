import type { BossClearRecord, BossId, GameState, RaidRank } from '../types/game';

const CODEX_STORAGE_KEY = 'aetheria_raid_codex_v1';

const RANK_ORDER: Record<RaidRank, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

export function computeRaidGrade(state: GameState): {
  rank: RaidRank;
  score: number;
  label: string;
} {
  if (state.phase !== 'victory') {
    const score = Math.min(
      45,
      state.stats.reactionsTriggered * 5 + state.boss.staggerCount * 8,
    );
    return { rank: 'C', score, label: '토벌 실패' };
  }

  const exhaustCount =
    state.players[0].exhaustionCount + state.players[1].exhaustionCount;
  const score = Math.max(
    0,
    50 +
      (state.maxRounds - state.round) * 8 +
      state.teamHp * 3 +
      state.stats.reactionsTriggered * 5 +
      state.boss.staggerCount * 10 -
      exhaustCount * 6,
  );

  if (score >= 95) {
    return { rank: 'S', score, label: '완벽한 공명' };
  }
  if (score >= 75) {
    return { rank: 'A', score, label: '탁월한 토벌' };
  }
  if (score >= 55) {
    return { rank: 'B', score, label: '치열한 승리' };
  }
  return { rank: 'C', score, label: '아슬아슬한 결착' };
}

export function loadRaidCodex(): Partial<Record<BossId, BossClearRecord>> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(CODEX_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function recordVictoryToCodex(
  state: GameState,
): Partial<Record<BossId, BossClearRecord>> {
  const codex = loadRaidCodex();
  if (state.phase !== 'victory') {
    return codex;
  }

  const grade = computeRaidGrade(state);
  const bossId = state.boss.id;
  const prev = codex[bossId];

  const bestRank =
    prev && RANK_ORDER[prev.bestRank] > RANK_ORDER[grade.rank]
      ? prev.bestRank
      : grade.rank;
  const bestRounds = prev
    ? Math.min(prev.bestRounds, state.round)
    : state.round;
  const bestScore = prev
    ? Math.max(prev.bestScore, grade.score)
    : grade.score;

  const updated: Partial<Record<BossId, BossClearRecord>> = {
    ...codex,
    [bossId]: {
      bossId,
      clears: (prev?.clears ?? 0) + 1,
      bestRank,
      bestRounds,
      bestScore,
      lastRelicId: state.relicId,
      updatedAt: new Date().toISOString(),
    },
  };

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CODEX_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
  }

  return updated;
}
