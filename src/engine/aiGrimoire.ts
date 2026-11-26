import type { AiCardAction, DiscoveredAiCard } from '../types/game';

const GRIMOIRE_STORAGE_KEY = 'aetheria_ai_grimoire_v1';
const MAX_GRIMOIRE_CARDS = 24;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function makeCardId(action: AiCardAction): string {
  return `${action.color}:${action.cardName.trim().toLowerCase()}`;
}

export function loadAiGrimoire(): DiscoveredAiCard[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(GRIMOIRE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_GRIMOIRE_CARDS);
  } catch {
    return [];
  }
}

export function recordAiCardToGrimoire(
  action: AiCardAction,
): DiscoveredAiCard[] {
  const existing = loadAiGrimoire();
  const id = makeCardId(action);
  const now = new Date().toISOString();
  const prev = existing.find((item) => item.id === id);

  const entry: DiscoveredAiCard = {
    id,
    cardName: action.cardName.trim() || '미확인 카드',
    color: action.color,
    skillTitle: action.skillTitle,
    damage: action.damage,
    guard: action.guard,
    disruptChallenge: action.disruptChallenge,
    specialNote: action.specialNote,
    battleCry: action.battleCry,
    timesUsed: (prev?.timesUsed ?? 0) + 1,
    lastSeenAt: now,
  };

  const updated = [entry, ...existing.filter((item) => item.id !== id)]
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, MAX_GRIMOIRE_CARDS);

  if (canUseStorage()) {
    try {
      localStorage.setItem(GRIMOIRE_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota issues
    }
  }

  return updated;
}

export function clearAiGrimoire(): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    localStorage.removeItem(GRIMOIRE_STORAGE_KEY);
  } catch {
    // Ignore storage issues
  }
}
