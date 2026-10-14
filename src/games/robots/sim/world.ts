import { DIRS, parseLevel, TILE, type ParsedLevel } from "./grid";
import { DEFAULT_PARAMS, Learner, type SerializedLearner } from "./learner";
import type { LevelDef } from "./levels";
import { ACT_TICKS, HOLD_TICKS, isStrategic, optionsForRole, WAIT_TICKS, type OptionDef } from "./options";
import { findPath, type PathContext, type Step } from "./pathfinding";
import { potential, REWARDS } from "./rewards";
import { createRng, type Rng } from "./rng";
import type { Role } from "./robots";
import { solvePoints } from "./score";

const PULL_RANGE = 5;
const EPSILON_START = 0.4;
const EPSILON_DECAY = 0.98;
const EPSILON_MIN = 0.05;
const RESULTS_WINDOW = 20;
const MASTERY_RATE = 0.8;
const CARD_HISTORY = 12;
const INFLUENCE_WINDOW = 200;
const CARD_VOTE_WEIGHT = 0.7;

type Phase = "go" | "act" | "hold" | "push";

export interface Robot {
  id: number;
  role: Role;
  options: OptionDef[];
  learner: Learner;
  pos: number;
  prev: number;
  air: boolean;
  active: boolean;
  carrying: boolean;
  option: number;
  phase: Phase;
  path: Step[];
  pathVersion: number;
  timer: number;
  /** Tile the current option is heading for (for the intent line), or -1. */
  goal: number;
  decisionState: string;
  decisionTick: number;
  reward: number;
  k: number;
  /** Push option: the block path still to travel. */
  blockPath: number[];
  /** Set when the current option ended this tick; settled after rewards. */
  finishing: "success" | "failed" | null;
  /** Whether the current option actually helped (counts toward the strategy). */
  helped: boolean;
}

export interface Decision {
  robot: number;
  state: string;
  option: number;
  tick: number;
}

export interface StrategyStep {
  robot: number;
  role: Role;
  label: string;
}

export interface EpisodeCard {
  episode: number;
  success: boolean;
  ticks: number;
  reward: number;
  steps: StrategyStep[];
  strategy: string;
  vote: number;
}

export interface StrategyGroup {
  name: string;
  signature: string;
  steps: StrategyStep[];
  runs: number;
  successes: number;
  ticks: number;
}

export type WorldEvent =
  | { type: "hack" | "bridge" | "break" | "pick" | "deliver" | "disable" | "success" | "hold"; robot: number; tile: number }
  | { type: "pull"; robot: number; from: number; to: number }
  | { type: "push"; robot: number; from: number; to: number };

export interface WorldStats {
  episode: number;
  tick: number;
  episodesTrained: number;
  solves: number;
  successRate: number;
  fastest: number;
  epsilon: number;
  influence: number;
  feedbackCount: number;
  solvePoints: number;
  mastered: boolean;
  newlyMastered: boolean;
}

export interface SavedBrain {
  episodesTrained: number;
  robots: SerializedLearner[];
}

export interface WorldOptions {
  seed?: number;
  brain?: SavedBrain | null;
  /** Whether the level was already mastered before this session (for the mastery bonus). */
  wasMastered?: boolean;
}

/**
 * Cooperative multi-robot world. Each robot is an independent SMDP Q-learner
 * choosing high-level options; all share the team reward. Training is
 * endless: episodes reset automatically on success or timeout.
 */
export class World {
  readonly level: ParsedLevel;
  readonly robots: Robot[];
  readonly history: { success: boolean; ticks: number }[] = [];
  readonly cards: EpisodeCard[] = [];
  readonly strategies = new Map<string, StrategyGroup>();
  events: WorldEvent[] = [];

  // Dynamic state.
  doorsOpen = false;
  bridged: boolean[] = [];
  rubble: boolean[] = [];
  blocks: number[] = [];
  core = -1;
  holder = -1;
  delivered = false;
  lasersOn: boolean[] = [];
  platePressed: boolean[] = [];
  tick = 0;
  episode = 1;

  private readonly rng: Rng;
  private version = 0;
  private episodeReward = 0;
  private subgoals = new Set<string>();
  private steps: StrategyStep[] = [];
  /** All decisions this episode (for live feedback) and the ones that formed the strategy (for card votes). */
  private decisions: Decision[] = [];
  private stepDecisions: Decision[] = [];
  private pastDecisions = new Map<number, Decision[]>();
  private episodesTrained = 0;
  private solves = 0;
  private fastest = 0;
  private solvePointsTotal = 0;
  private feedbackCount = 0;
  private influence: boolean[] = [];
  private mastered: boolean;
  private readonly wasMastered: boolean;

  constructor(def: LevelDef, options: WorldOptions = {}) {
    this.rng = createRng(options.seed ?? Date.now());
    this.level = parseLevel(def);
    this.wasMastered = !!options.wasMastered;
    this.mastered = this.wasMastered;
    this.robots = def.robots.map((role, id) => {
      const opts = optionsForRole(role, this.level);
      return {
        id,
        role,
        options: opts,
        learner: new Learner(opts.length, this.rng, DEFAULT_PARAMS),
        pos: 0,
        prev: 0,
        air: false,
        active: true,
        carrying: false,
        option: -1,
        phase: "go",
        path: [],
        pathVersion: -1,
        timer: 0,
        goal: -1,
        decisionState: "",
        decisionTick: 0,
        reward: 0,
        k: 0,
        blockPath: [],
        finishing: null,
        helped: false,
      };
    });
    if (options.brain && options.brain.robots.length === this.robots.length) {
      this.episodesTrained = options.brain.episodesTrained;
      options.brain.robots.forEach((data, i) => this.robots[i].learner.load(data));
    }
    this.resetEpisode();
  }

  get epsilon() {
    return Math.max(EPSILON_MIN, EPSILON_START * Math.pow(EPSILON_DECAY, this.episodesTrained));
  }

  stats(): WorldStats {
    const recent = this.history.slice(-RESULTS_WINDOW);
    const successRate = recent.length ? recent.filter((r) => r.success).length / recent.length : 0;
    return {
      episode: this.episode,
      tick: this.tick,
      episodesTrained: this.episodesTrained,
      solves: this.solves,
      successRate,
      fastest: this.fastest,
      epsilon: this.epsilon,
      influence: this.influence.length ? this.influence.filter(Boolean).length / this.influence.length : 0,
      feedbackCount: this.feedbackCount,
      solvePoints: this.solvePointsTotal,
      mastered: this.mastered,
      newlyMastered: this.mastered && !this.wasMastered,
    };
  }

  serializeBrain(): SavedBrain {
    return { episodesTrained: this.episodesTrained, robots: this.robots.map((r) => r.learner.serialize()) };
  }

  resetLearning() {
    for (const r of this.robots) r.learner.reset();
    this.episodesTrained = 0;
    this.history.length = 0;
    this.cards.length = 0;
    this.strategies.clear();
    this.pastDecisions.clear();
    this.influence = [];
    this.resetEpisode();
  }

  // ---------------------------------------------------------------- feedback

  /**
   * Live human feedback for one robot (or the whole team when `robot` is null).
   * Credit flows to recent decisions with exponentially decaying weight.
   */
  feedback(robot: number | null, value: number, tauTicks: number) {
    this.feedbackCount++;
    for (const d of this.decisions) {
      if (robot !== null && d.robot !== robot) continue;
      const weight = Math.exp(-(this.tick - d.tick) / Math.max(1, tauTicks));
      if (weight < 0.05) continue;
      this.robots[d.robot].learner.human(d.state, d.option, value, weight);
    }
  }

  /** Vote on a past episode's strategy card: credit the decisions that made up its strategy. */
  vote(episode: number, value: number) {
    const card = this.cards.find((c) => c.episode === episode);
    const decisions = this.pastDecisions.get(episode);
    if (!card || !decisions || card.vote === value) return;
    card.vote = value;
    this.feedbackCount++;
    for (const d of decisions) this.robots[d.robot].learner.human(d.state, d.option, value, CARD_VOTE_WEIGHT);
  }

  /** Makes a robot start a specific option now (used by tests and scripted demos). */
  command(robot: number, option: number) {
    const r = this.robots[robot];
    if (r.option >= 0) this.completeOption(r, false);
    r.option = option;
    r.phase = "go";
    r.path = [];
    r.pathVersion = -1;
    r.goal = -1;
    r.decisionState = this.stateKey(r);
    r.decisionTick = this.tick;
    r.reward = 0;
    r.k = 0;
    r.helped = false;
  }

  // ---------------------------------------------------------------- simulation

  step() {
    this.tick++;
    for (const r of this.robots) r.prev = r.pos;

    for (const r of this.robots) if (r.active && r.option < 0) this.decide(r);
    for (const r of this.robots) if (r.active && r.option >= 0) this.advance(r);

    this.updateLasers();
    this.creditEnablers();
    let reward = REWARDS.tick;
    for (const r of this.robots) {
      if (!r.active || r.air || this.tiles(r.pos) !== TILE.Laser) continue;
      if (this.lasersOn[this.level.laserRunOf[r.pos]] && r.role !== "shield") {
        this.disable(r);
        reward += REWARDS.disabled;
      }
    }

    reward += this.consumeSubgoalReward();
    const timedOut = !this.delivered && this.tick >= this.level.def.timeLimit;
    if (this.delivered) reward += REWARDS.success;
    if (timedOut) reward += REWARDS.timeout;
    this.episodeReward += reward;

    // Shaping is added per robot so it is discounted from each option's start.
    const shaping = this.shapingDelta();
    for (const r of this.robots) {
      if (r.option < 0) continue;
      r.reward += Math.pow(DEFAULT_PARAMS.gammaTick, r.k) * (reward + shaping);
      r.k++;
    }
    this.lastPotential = this.currentPotential();

    if (this.delivered || timedOut) this.endEpisode(this.delivered);
    else for (const r of this.robots) if (r.finishing) this.completeOption(r, false);
  }

  // ---------------------------------------------------------------- decisions

  stateKey(r: Robot): string {
    const bits = [
      this.doorsOpen ? 1 : 0,
      ...this.bridged.map(Number),
      ...this.rubble.map(Number),
      ...this.blocks.map((b) => (this.level.plates.includes(b) ? 1 : 0)),
      this.lasersOn.some(Boolean) ? 1 : 0,
    ].join("");
    const core = this.holder >= 0 ? `h${this.holder === r.id ? "me" : this.holder}` : `c${this.core}`;
    const region = this.level.regions[r.pos];
    return `${bits}|${core}|r${region}`;
  }

  available(r: Robot): boolean[] {
    return r.options.map((o) => {
      switch (o.kind) {
        case "hack":
          return !this.doorsOpen;
        case "bridge":
          return !this.bridged[o.target];
        case "break":
          return this.rubble[o.target];
        case "push":
          return !this.level.plates.includes(this.blocks[o.target]);
        case "hold":
          return !this.blocks.includes(this.level.plates[o.target]);
        case "shield":
          return true;
        case "pick":
          return this.holder < 0 && !this.delivered;
        case "deliver":
          return r.carrying;
        case "pull":
          return this.holder < 0 && !this.delivered;
        case "wait":
          return true;
      }
    });
  }

  private decide(r: Robot) {
    const state = this.stateKey(r);
    const choice = r.learner.choose(state, this.available(r), this.epsilon);
    if (choice.option < 0) return;
    if (choice.greedy) {
      this.influence.push(choice.humanSwayed);
      if (this.influence.length > INFLUENCE_WINDOW) this.influence.shift();
    }
    r.option = choice.option;
    r.phase = "go";
    r.path = [];
    r.pathVersion = -1;
    r.goal = -1;
    r.decisionState = state;
    r.decisionTick = this.tick;
    r.reward = 0;
    r.k = 0;
    r.helped = false;
    this.decisions.push({ robot: r.id, state, option: choice.option, tick: this.tick });
  }

  /** Queue an option to finish at the end of this tick, after its share of the tick's reward. */
  private finishOption(r: Robot, success: boolean) {
    if (r.option < 0 || r.finishing) return;
    r.finishing = success ? "success" : "failed";
  }

  private completeOption(r: Robot, terminal: boolean) {
    if (r.option < 0) return;
    const opt = r.options[r.option];
    let reward = r.reward;
    if (r.finishing === "failed") reward += REWARDS.failedOption;
    // Idling (or holding a plate nobody needed) carries a small individual cost.
    if (opt.kind === "wait" || ((opt.kind === "hold" || opt.kind === "shield") && !r.helped)) reward += REWARDS.wait;
    if (r.helped) reward += REWARDS.contribution;
    const next = this.stateKey(r);
    r.learner.update(r.decisionState, r.option, reward, Math.max(1, r.k), next, this.available(r), terminal);
    if (r.finishing === "success" && r.helped && isStrategic(opt.kind)) {
      this.stepDecisions.push({ robot: r.id, state: r.decisionState, option: r.option, tick: r.decisionTick });
      const last = this.steps[this.steps.length - 1];
      if (!last || last.robot !== r.id || last.label !== opt.label) this.steps.push({ robot: r.id, role: r.role, label: opt.label });
    }
    r.option = -1;
    r.finishing = null;
    r.goal = -1;
    r.path = [];
    r.blockPath = [];
  }

  // ---------------------------------------------------------------- option execution

  private advance(r: Robot) {
    if (r.finishing) return;
    const opt = r.options[r.option];
    if (r.phase === "act") {
      if (--r.timer <= 0) this.applyEffect(r, opt);
      return;
    }
    if (r.phase === "hold") {
      if (--r.timer <= 0) this.finishOption(r, true);
      return;
    }
    if (r.phase === "push") {
      this.stepPush(r);
      return;
    }

    // "go": walk toward the option's goal, replanning when the world changes.
    if (r.air) {
      this.moveAlong(r);
      return;
    }
    const isGoal = this.goalFor(r, opt);
    if (!isGoal) return this.finishOption(r, false);
    if (isGoal(r.pos)) return this.arrive(r, opt);
    if (r.pathVersion !== this.version || r.path.length === 0) {
      const path = findPath(this.pathContext(r), r.pos, isGoal);
      if (!path) return this.finishOption(r, false);
      r.path = path;
      r.pathVersion = this.version;
      r.goal = path.length ? path[path.length - 1].tile : r.pos;
    }
    this.moveAlong(r);
    if (!r.air && isGoal(r.pos)) this.arrive(r, opt);
  }

  private moveAlong(r: Robot) {
    const next = r.path.shift();
    if (!next) return;
    r.pos = next.tile;
    r.air = next.air;
    if (r.carrying) this.core = r.pos;
  }

  /** Goal predicate for an option, or null when it cannot currently be attempted. */
  private goalFor(r: Robot, opt: OptionDef): ((tile: number) => boolean) | null {
    const L = this.level;
    switch (opt.kind) {
      case "hack":
        return (t) => t === L.terminals[opt.target];
      case "bridge":
        return this.adjacentTo(L.bridgeSpots[opt.target]);
      case "break":
        return this.adjacentTo(L.rubble[opt.target]);
      case "push":
        return this.adjacentTo(this.blocks[opt.target]);
      case "hold":
        return (t) => t === L.plates[opt.target];
      case "shield": {
        const run = new Set(L.laserRuns[opt.target]);
        return (t) => run.has(t);
      }
      case "pick":
        return this.holder < 0 && !this.delivered ? (t) => t === this.core : null;
      case "deliver":
        return r.carrying ? (t) => t === L.reactor : null;
      case "pull": {
        if (this.holder >= 0 || this.delivered) return null;
        const spots = this.pullSpots();
        return spots.size ? (t) => spots.has(t) : null;
      }
      case "wait":
        return () => true;
    }
  }

  private arrive(r: Robot, opt: OptionDef) {
    if (opt.kind === "wait" || opt.kind === "hold" || opt.kind === "shield") {
      r.phase = "hold";
      r.timer = opt.kind === "wait" ? WAIT_TICKS : HOLD_TICKS;
      if (opt.kind !== "wait") this.events.push({ type: "hold", robot: r.id, tile: r.pos });
      return;
    }
    if (opt.kind === "push") {
      const blockPath = this.blockPathToPlate(opt.target);
      if (!blockPath) return this.finishOption(r, false);
      r.blockPath = blockPath;
      r.phase = "push";
      return;
    }
    r.phase = "act";
    r.timer = ACT_TICKS[opt.kind] ?? 1;
  }

  private applyEffect(r: Robot, opt: OptionDef) {
    const L = this.level;
    switch (opt.kind) {
      case "hack":
        if (!this.doorsOpen) {
          this.doorsOpen = true;
          r.helped = true;
          this.subgoal("doors");
          this.changed();
          this.events.push({ type: "hack", robot: r.id, tile: L.terminals[opt.target] });
        }
        break;
      case "bridge":
        if (!this.bridged[opt.target]) {
          this.bridged[opt.target] = true;
          r.helped = true;
          this.subgoal(`bridge${opt.target}`);
          this.changed();
          this.events.push({ type: "bridge", robot: r.id, tile: L.bridgeSpots[opt.target] });
        }
        break;
      case "break":
        if (this.rubble[opt.target]) {
          this.rubble[opt.target] = false;
          r.helped = true;
          this.subgoal(`rubble${opt.target}`);
          this.changed();
          this.events.push({ type: "break", robot: r.id, tile: L.rubble[opt.target] });
        }
        break;
      case "pick":
        if (this.holder < 0 && this.core === r.pos) {
          this.holder = r.id;
          r.carrying = true;
          r.helped = true;
          if (!this.subgoals.has("pick")) {
            this.subgoals.add("pick");
            this.pendingSubgoal += REWARDS.pickCore;
          }
          this.changed();
          this.events.push({ type: "pick", robot: r.id, tile: r.pos });
        } else return this.finishOption(r, false);
        break;
      case "deliver":
        if (r.carrying && r.pos === L.reactor) {
          this.delivered = true;
          r.helped = true;
          r.carrying = false;
          this.holder = -1;
          this.core = L.reactor;
          this.events.push({ type: "deliver", robot: r.id, tile: r.pos }, { type: "success", robot: r.id, tile: r.pos });
        } else return this.finishOption(r, false);
        break;
      case "pull": {
        const landing = this.pullLanding(r.pos);
        if (landing < 0) return this.finishOption(r, false);
        const from = this.core;
        r.helped = L.reactorDist[landing] < L.reactorDist[from];
        this.core = landing;
        this.changed();
        this.events.push({ type: "pull", robot: r.id, from, to: landing });
        if (landing === L.reactor) {
          this.delivered = true;
          this.events.push({ type: "success", robot: r.id, tile: landing });
        }
        break;
      }
      default:
        break;
    }
    this.finishOption(r, true);
  }

  private stepPush(r: Robot) {
    const opt = r.options[r.option];
    const next = r.blockPath.shift();
    if (next === undefined) return this.finishOption(r, false);
    const from = this.blocks[opt.target];
    if (!this.blockPassable(next, opt.target)) return this.finishOption(r, false);
    this.blocks[opt.target] = next;
    r.pos = from;
    this.changed();
    this.events.push({ type: "push", robot: r.id, from, to: next });
    if (this.level.plates.includes(next)) {
      r.helped = true;
      this.subgoal(`plate${opt.target}`);
      this.finishOption(r, true);
    }
  }

  private disable(r: Robot) {
    r.active = false;
    this.events.push({ type: "disable", robot: r.id, tile: r.pos });
    if (r.carrying) {
      r.carrying = false;
      this.holder = -1;
      this.core = r.pos;
      this.changed();
    }
    this.finishOption(r, false);
  }

  // ---------------------------------------------------------------- world queries

  private tiles(i: number) {
    return this.level.tiles[i];
  }

  /** Whether `role` can stand on / walk through tile `i` right now. */
  passable(i: number, role: Role): boolean {
    const L = this.level;
    switch (L.tiles[i]) {
      case TILE.Wall:
      case TILE.Gap:
        return false;
      case TILE.BridgeSpot:
        return this.bridged[L.bridgeIndexOf[i]];
      case TILE.Door:
        return this.doorsOpen;
      case TILE.Laser:
        if (this.lasersOn[L.laserRunOf[i]] && role !== "shield") return false;
        break;
    }
    const ri = L.rubbleIndexOf[i];
    if (ri >= 0 && this.rubble[ri]) return false;
    return !this.blocks.includes(i);
  }

  isGap(i: number) {
    const t = this.level.tiles[i];
    return t === TILE.Gap || (t === TILE.BridgeSpot && !this.bridged[this.level.bridgeIndexOf[i]]);
  }

  private pathContext(r: Robot): PathContext {
    return {
      cols: this.level.cols,
      rows: this.level.rows,
      passable: (i) => this.passable(i, r.role),
      canJump: r.role === "jumper",
      isGap: (i) => this.isGap(i),
    };
  }

  private adjacentTo(tile: number) {
    const { cols } = this.level;
    return (t: number) => {
      const dx = Math.abs((t % cols) - (tile % cols));
      const dy = Math.abs(Math.floor(t / cols) - Math.floor(tile / cols));
      return dx + dy === 1;
    };
  }

  /** Tiles from which the Magnet can pull the core, keyed for O(1) goal checks. */
  private pullSpots(): Set<number> {
    const { cols, rows } = this.level;
    const spots = new Set<number>();
    if (this.core < 0) return spots;
    const cx = this.core % cols;
    const cy = Math.floor(this.core / cols);
    for (const [dx, dy] of DIRS) {
      for (let d = 1; d <= PULL_RANGE; d++) {
        const x = cx + dx * d;
        const y = cy + dy * d;
        if (x < 0 || y < 0 || x >= cols || y >= rows) break;
        const t = y * cols + x;
        if (this.blocksLine(t)) break;
        // Need at least one tile between magnet and core for the core to land on.
        if (d >= 2 && this.passable(t, "magnet") && this.pullLanding(t) >= 0) spots.add(t);
      }
    }
    return spots;
  }

  /** Where the core lands when pulled by a magnet at `spot` (the tile next to it), or -1. */
  private pullLanding(spot: number): number {
    const { cols } = this.level;
    if (this.holder >= 0 || this.core < 0) return -1;
    const sx = spot % cols;
    const sy = Math.floor(spot / cols);
    const cx = this.core % cols;
    const cy = Math.floor(this.core / cols);
    if (sx !== cx && sy !== cy) return -1;
    const dist = Math.abs(sx - cx) + Math.abs(sy - cy);
    if (dist < 2 || dist > PULL_RANGE) return -1;
    const dx = Math.sign(cx - sx);
    const dy = Math.sign(cy - sy);
    for (let d = 1; d < dist; d++) if (this.blocksLine(spot + (dy * cols + dx) * d)) return -1;
    const landing = spot + dy * cols + dx;
    const t = this.level.tiles[landing];
    if (t === TILE.Laser || !this.passable(landing, "lifter")) return -1;
    return landing;
  }

  /** Walls, closed doors, rubble and blocks stop a magnet pull; gaps and lasers don't. */
  private blocksLine(t: number) {
    const L = this.level;
    const tile = L.tiles[t];
    if (tile === TILE.Wall || (tile === TILE.Door && !this.doorsOpen)) return true;
    const ri = L.rubbleIndexOf[t];
    return (ri >= 0 && this.rubble[ri]) || this.blocks.includes(t);
  }

  private blockPassable(t: number, block: number) {
    const L = this.level;
    const tile = L.tiles[t];
    if (tile === TILE.Wall || tile === TILE.Gap || tile === TILE.Reactor) return false;
    if (tile === TILE.BridgeSpot && !this.bridged[L.bridgeIndexOf[t]]) return false;
    if (tile === TILE.Door && !this.doorsOpen) return false;
    const ri = L.rubbleIndexOf[t];
    if (ri >= 0 && this.rubble[ri]) return false;
    return !this.blocks.some((b, i) => i !== block && b === t) && t !== this.core;
  }

  private blockPathToPlate(block: number): number[] | null {
    const plates = new Set(this.level.plates.filter((p) => !this.blocks.includes(p)));
    if (!plates.size) return null;
    const path = findPath(
      { cols: this.level.cols, rows: this.level.rows, passable: (t) => this.blockPassable(t, block), canJump: false, isGap: () => false },
      this.blocks[block],
      (t) => plates.has(t),
    );
    return path ? path.map((s) => s.tile) : null;
  }

  private updateLasers() {
    const L = this.level;
    this.platePressed = L.plates.map(
      (p) => this.blocks.includes(p) || this.robots.some((r) => r.active && !r.air && r.pos === p),
    );
    const plateOn = this.platePressed.some(Boolean);
    const next = L.laserRuns.map(
      (run) => !plateOn && !this.robots.some((r) => r.active && r.role === "shield" && run.includes(r.pos)),
    );
    if (next.some((on, i) => on !== this.lasersOn[i])) {
      if (next.some((on, i) => !on && this.lasersOn[i])) this.subgoal("lasers");
      this.lasersOn = next;
      this.changed();
    }
  }

  /**
   * A plate holder or shield "helped" if the core carrier crossed a laser that
   * would have been on without them (a counterfactual check, so idle extras get no credit).
   */
  private creditEnablers() {
    if (this.holder < 0) return;
    const carrier = this.robots[this.holder];
    const run = this.level.laserRunOf[carrier.pos];
    if (run < 0 || this.lasersOn[run]) return;
    for (const r of this.robots) {
      if (r.option < 0 || r.phase !== "hold") continue;
      const kind = r.options[r.option].kind;
      if ((kind === "hold" || kind === "shield") && this.laserOnWithout(run, r.id)) r.helped = true;
    }
  }

  private laserOnWithout(run: number, excluded: number) {
    const L = this.level;
    const present = (r: Robot) => r.id !== excluded && r.active && !r.air;
    const plateOn = L.plates.some((p) => this.blocks.includes(p) || this.robots.some((r) => present(r) && r.pos === p));
    const shielded = this.robots.some((r) => present(r) && r.role === "shield" && L.laserRuns[run].includes(r.pos));
    return !plateOn && !shielded;
  }

  private changed() {
    this.version++;
  }

  // ---------------------------------------------------------------- rewards

  private pendingSubgoal = 0;
  private lastPotential = 0;

  private subgoal(key: string) {
    if (this.subgoals.has(key)) return;
    this.subgoals.add(key);
    this.pendingSubgoal += REWARDS.subgoal;
  }

  private consumeSubgoalReward() {
    const r = this.pendingSubgoal;
    this.pendingSubgoal = 0;
    return r;
  }

  private currentPotential() {
    const d = this.level.reactorDist[this.core >= 0 ? this.core : this.level.core];
    return potential(Math.max(0, d));
  }

  private shapingDelta() {
    return DEFAULT_PARAMS.gammaTick * this.currentPotential() - this.lastPotential;
  }

  // ---------------------------------------------------------------- episodes

  private endEpisode(success: boolean) {
    // Both success and timeout end the episode, so no bootstrapping.
    for (const r of this.robots) this.completeOption(r, true);
    const ticks = this.tick;
    this.history.push({ success, ticks });
    if (this.history.length > 200) this.history.shift();
    this.episodesTrained++;
    if (success) {
      this.solves++;
      this.fastest = this.fastest ? Math.min(this.fastest, ticks) : ticks;
      this.solvePointsTotal += solvePoints(this.level.def.tier, ticks, this.level.def.timeLimit);
    }
    const recent = this.history.slice(-RESULTS_WINDOW);
    if (recent.length >= RESULTS_WINDOW && recent.filter((r) => r.success).length / recent.length >= MASTERY_RATE) {
      this.mastered = true;
    }

    const signature = this.steps.map((s) => `${s.role}:${s.label}`).join(" > ") || "(nothing)";
    let group = this.strategies.get(signature);
    if (!group) {
      group = { name: strategyName(this.strategies.size), signature, steps: this.steps.slice(), runs: 0, successes: 0, ticks: 0 };
      this.strategies.set(signature, group);
    }
    group.runs++;
    if (success) {
      group.successes++;
      group.ticks += ticks;
    }
    this.cards.push({ episode: this.episode, success, ticks, reward: Math.round(this.episodeReward), steps: this.steps.slice(), strategy: group.name, vote: 0 });
    this.pastDecisions.set(this.episode, this.stepDecisions);
    if (this.cards.length > CARD_HISTORY) {
      const old = this.cards.shift()!;
      this.pastDecisions.delete(old.episode);
    }
    this.episode++;
    this.resetEpisode();
  }

  private resetEpisode() {
    const L = this.level;
    this.tick = 0;
    this.doorsOpen = false;
    this.bridged = L.bridgeSpots.map(() => false);
    this.rubble = L.rubble.map(() => true);
    this.blocks = L.blocks.slice();
    this.core = L.core;
    this.holder = -1;
    this.delivered = false;
    this.lasersOn = L.laserRuns.map(() => true);
    this.platePressed = L.plates.map(() => false);
    this.subgoals = new Set();
    this.pendingSubgoal = 0;
    this.episodeReward = 0;
    this.steps = [];
    this.decisions = [];
    this.stepDecisions = [];
    this.robots.forEach((r, i) => {
      Object.assign(r, {
        pos: L.spawns[i],
        prev: L.spawns[i],
        air: false,
        active: true,
        carrying: false,
        option: -1,
        phase: "go",
        path: [],
        pathVersion: -1,
        timer: 0,
        goal: -1,
        reward: 0,
        k: 0,
        blockPath: [],
        finishing: null,
        helped: false,
      });
    });
    this.lastPotential = this.currentPotential();
    this.changed();
  }
}

export function strategyName(i: number) {
  return i < 26 ? String.fromCharCode(65 + i) : `#${i + 1}`;
}
