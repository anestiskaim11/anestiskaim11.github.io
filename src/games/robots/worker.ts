import { getLevel } from "./sim/levels";
import { World } from "./sim/world";
import type { FromWorker, ToWorker, WorldView } from "./protocol";

// The app tsconfig only ships DOM typings, so describe the worker scope we use.
const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const TICK_MS = 16;
const STEP_BUDGET_MS = 12;
const STATS_INTERVAL_MS = 250;
const BASE_TICKS_PER_SECOND = 6;
const MAX_EVENTS = 40;
/** Live feedback credits decisions from roughly the last two seconds of real time. */
const FEEDBACK_WINDOW_SECONDS = 2;

let world: World | null = null;
let running = false;
let dirty = false;
let speed = 1;
let due = 0;
let last = 0;
let lastStats = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const ticksPerSecond = () => BASE_TICKS_PER_SECOND * speed;

function view(w: World): WorldView {
  return {
    tick: w.tick,
    episode: w.episode,
    timeLimit: w.level.def.timeLimit,
    doorsOpen: w.doorsOpen,
    bridged: w.bridged.slice(),
    rubble: w.rubble.slice(),
    blocks: w.blocks.slice(),
    core: w.core,
    holder: w.holder,
    delivered: w.delivered,
    lasersOn: w.lasersOn.slice(),
    platePressed: w.platePressed.slice(),
    robots: w.robots.map((r) => {
      const opt = r.option >= 0 ? r.options[r.option] : null;
      return {
        id: r.id,
        role: r.role,
        pos: r.pos,
        prev: r.prev,
        air: r.air,
        active: r.active,
        carrying: r.carrying,
        intent: opt?.label ?? null,
        kind: opt?.kind ?? null,
        phase: r.phase,
        goal: r.goal,
      };
    }),
  };
}

function postStats(w: World) {
  const strategies = [...w.strategies.values()].sort((a, b) => b.runs - a.runs).slice(0, 6);
  scope.postMessage({
    type: "stats",
    stats: w.stats(),
    history: w.history.slice(-60),
    cards: w.cards.slice(-8).reverse(),
    strategies,
  });
}

function tick() {
  timer = setTimeout(tick, TICK_MS);
  const now = performance.now();
  const elapsed = (now - last) / 1000;
  last = now;
  if (!world) return;
  let stepped = 0;
  if (running) {
    due = Math.min(due + elapsed * ticksPerSecond(), ticksPerSecond());
    const start = performance.now();
    while (due >= 1 && performance.now() - start < STEP_BUDGET_MS) {
      world.step();
      due -= 1;
      stepped++;
    }
  }
  if (stepped > 0 || dirty) {
    const events = world.events.slice(-MAX_EVENTS);
    world.events = [];
    scope.postMessage({ type: "snapshot", view: view(world), events, tickInterval: 1 / ticksPerSecond() });
    dirty = false;
  }
  if ((running || dirty) && now - lastStats > STATS_INTERVAL_MS) {
    lastStats = now;
    postStats(world);
  }
}

scope.onmessage = ({ data: msg }) => {
  switch (msg.type) {
    case "init":
      world = new World(getLevel(msg.levelId), { seed: msg.seed, brain: msg.brain, wasMastered: msg.wasMastered });
      running = true;
      dirty = true;
      due = 0;
      lastStats = 0;
      last = performance.now();
      if (timer === undefined) tick();
      break;
    case "setSpeed":
      speed = msg.speed;
      break;
    case "pause":
      running = false;
      if (world) postStats(world);
      break;
    case "resume":
      running = true;
      due = 0;
      break;
    case "feedback":
      world?.feedback(msg.robot, msg.value, FEEDBACK_WINDOW_SECONDS * ticksPerSecond());
      if (world) postStats(world);
      break;
    case "vote":
      world?.vote(msg.episode, msg.value);
      if (world) postStats(world);
      break;
    case "resetLearning":
      world?.resetLearning();
      dirty = true;
      if (world) postStats(world);
      break;
    case "quit":
      running = false;
      if (world) scope.postMessage({ type: "summary", stats: world.stats(), brain: world.serializeBrain() });
      world = null;
      clearTimeout(timer);
      timer = undefined;
      break;
  }
};
