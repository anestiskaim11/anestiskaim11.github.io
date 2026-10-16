import type { OptionKind } from "./sim/options";
import type { Role } from "./sim/robots";
import type { EpisodeCard, EpisodeReview, ReviewRating, SavedBrain, StrategyGroup, WorldEvent, WorldStats } from "./sim/world";

export type ToWorker =
  | { type: "init"; levelId: string; seed: number; brain: SavedBrain | null; wasMastered: boolean; human: number }
  | { type: "setSpeed"; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "feedback"; robot: number | null; value: number }
  | { type: "vote"; episode: number; value: number }
  | { type: "review"; team: number; ratings: ReviewRating[] }
  /** Hold a direction (index into DIRS, -1 to release); `tap` guarantees one step. */
  | { type: "move"; dir: number; tap?: boolean }
  | { type: "act" }
  | { type: "goto"; tile: number }
  | { type: "resetLearning" }
  | { type: "quit" };

export interface RobotView {
  id: number;
  role: Role;
  pos: number;
  prev: number;
  air: boolean;
  active: boolean;
  carrying: boolean;
  intent: string | null;
  kind: OptionKind | null;
  phase: "go" | "act" | "hold" | "push";
  goal: number;
}

export interface WorldView {
  tick: number;
  episode: number;
  timeLimit: number;
  /** Per door (indexed like the level's `doors`). */
  doorOpen: boolean[];
  bridged: boolean[];
  rubble: boolean[];
  blocks: number[];
  core: number;
  holder: number;
  delivered: boolean;
  lasersOn: boolean[];
  platePressed: boolean[];
  robots: RobotView[];
  /** The player's robot, and the ability it could use right now (or null). */
  human: number;
  humanAction: string | null;
}

export interface SnapshotMessage {
  type: "snapshot";
  view: WorldView;
  events: WorldEvent[];
  /** Seconds per tick at the current speed, for interpolating motion. */
  tickInterval: number;
}

export interface StatsMessage {
  type: "stats";
  stats: WorldStats;
  history: { success: boolean; ticks: number }[];
  cards: EpisodeCard[];
  strategies: StrategyGroup[];
}

export interface SummaryMessage {
  type: "summary";
  stats: WorldStats;
  brain: SavedBrain;
}

/** An episode just ended; the world waits for the player's review. */
export interface ReviewMessage {
  type: "review";
  review: EpisodeReview;
}

export type FromWorker = SnapshotMessage | StatsMessage | SummaryMessage | ReviewMessage;
