import type { GameState } from '../types/game';

export const MAX_UNDO_STEPS = 5;

export function pushUndoSnapshot(
  stack: GameState[],
  snapshot: GameState,
): GameState[] {
  return [...stack, snapshot].slice(-MAX_UNDO_STEPS);
}

export function popUndoSnapshot(stack: GameState[]): {
  previous: GameState | null;
  nextStack: GameState[];
} {
  if (stack.length === 0) {
    return { previous: null, nextStack: [] };
  }
  return {
    previous: stack[stack.length - 1] ?? null,
    nextStack: stack.slice(0, -1),
  };
}

export function clearUndoStack(): GameState[] {
  return [];
}
