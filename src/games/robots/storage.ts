import type { SavedBrain } from "./sim/world";

const BEST_KEY = "robot-trainer:best";
/** v2: robots gained the "Wander off" move, so brains saved before it no longer fit. */
const LEVEL_KEY = (id: string) => `robot-trainer:level:v2:${id}`;
/** Skip saving learned tables that would bloat storage. */
const MAX_BRAIN_CHARS = 400_000;

export interface PersonalBest {
  score: number;
  level: string;
  date: string;
}

export interface LevelProgress {
  mastered: boolean;
  episodes: number;
  brain: SavedBrain | null;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: progress just isn't remembered.
  }
}

export function readPersonalBest(): PersonalBest | null {
  const best = read<PersonalBest>(BEST_KEY);
  return best && Number.isFinite(best.score) ? best : null;
}

/** Saves the score if it beats the stored best. */
export function recordScore(score: number, level: string): { best: PersonalBest | null; isNew: boolean } {
  const previous = readPersonalBest();
  if (score <= 0 || (previous && score <= previous.score)) return { best: previous, isNew: false };
  const best = { score, level, date: new Date().toISOString() };
  write(BEST_KEY, best);
  return { best, isNew: true };
}

export function readLevelProgress(id: string): LevelProgress {
  return read<LevelProgress>(LEVEL_KEY(id)) ?? { mastered: false, episodes: 0, brain: null };
}

export function saveLevelProgress(id: string, progress: LevelProgress) {
  const brain = progress.brain && JSON.stringify(progress.brain).length <= MAX_BRAIN_CHARS ? progress.brain : null;
  write(LEVEL_KEY(id), { ...progress, brain });
}

export function clearLevelBrain(id: string) {
  const progress = readLevelProgress(id);
  write(LEVEL_KEY(id), { ...progress, episodes: 0, brain: null });
}
