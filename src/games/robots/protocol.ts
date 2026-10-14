import type { OptionKind } from "./sim/options";
import type { Role } from "./sim/robots";
import type { EpisodeCard, SavedBrain, StrategyGroup, WorldEvent, WorldStats } from "./sim/world";

export type ToWorker =
  | { type: "init"; levelId: string; seed: number; brain: SavedBrain | null; wasMastered: boolean }
  | { type: "setSpeed"; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "feedback"; robot: number | null; value: number }
  | { type: "vote"; episode: number; value: number }
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
  doorsOpen: boolean;
  bridged: boolean[];
  rubble: boolean[];
  blocks: number[];
  core: number;
  holder: number;
  delivered: boolean;
  lasersOn: boolean[];
  platePressed: boolean[];
  robots: RobotView[];
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

export type FromWorker = SnapshotMessage | StatsMessage | SummaryMessage;
