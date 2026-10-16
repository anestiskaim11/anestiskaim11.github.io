import { describe, expect, it } from "vitest";
import { getLevel, type LevelDef } from "../levels";
import type { OptionKind } from "../options";
import type { Role } from "../robots";
import { World } from "../world";

/** One scripted move: `role` runs its `kind` skill, at the switch / obstacle on tile `at` when it has several. */
interface Move {
  role: Role;
  kind: OptionKind;
  at?: [number, number];
}

const move = (role: Role, kind: OptionKind, at?: [number, number]): Move => ({ role, kind, at });

/** Intended solution per hard level: phases run in order, moves inside a phase run in parallel. */
const SOLUTIONS: Record<string, Move[][]> = {
  switchyard: [
    [move("jumper", "hold", [5, 7])],
    [move("breaker", "break", [10, 2])],
    [move("pusher", "push", [10, 1]), move("hacker", "hack", [9, 8])],
    [move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
  "rubble-maze": [
    [move("breaker", "break", [4, 6])],
    [move("hacker", "hack", [2, 9]), move("pusher", "push", [5, 3])],
    [move("breaker", "break", [13, 3])],
    [move("builder", "bridge", [16, 3])],
    [move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
  "reactor-vault": [
    [move("breaker", "break", [10, 2]), move("builder", "bridge", [16, 9]), move("jumper", "hold", [10, 9])],
    [move("hacker", "hack", [10, 1]), move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
  gauntlet: [
    [move("breaker", "break", [5, 2])],
    [move("hacker", "hack", [5, 1])],
    [move("pusher", "push", [9, 6]), move("hacker", "hack", [11, 1])],
    [move("hacker", "hack", [14, 1]), move("jumper", "hold", [15, 8])],
    [move("builder", "bridge", [20, 5])],
    [move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
  "cold-storage": [
    [move("breaker", "break", [6, 3])],
    [move("hacker", "hack", [8, 2]), move("pusher", "push", [9, 4])],
    [move("hacker", "hack", [16, 5])],
    [move("lifter", "pick")],
    [move("breaker", "hold", [3, 6])],
    [move("lifter", "deliver")],
  ],
  drawbridge: [
    [move("builder", "bridge", [5, 4])],
    [move("hacker", "hack", [7, 2])],
    [move("jumper", "hold", [14, 2])],
    [move("lifter", "pick")],
    [move("breaker", "break", [2, 6])],
    [move("lifter", "deliver")],
  ],
  crossfire: [
    [move("shield", "shield", [6, 1]), move("jumper", "hold", [3, 9])],
    [move("breaker", "hold", [17, 2])],
    [move("hacker", "hack", [10, 8])],
    [move("shield", "shield", [16, 8])],
    [move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
  "deep-core": [
    [move("breaker", "break", [5, 3])],
    [move("hacker", "hack", [8, 2])],
    [move("builder", "bridge", [14, 3])],
    [move("hacker", "hack", [23, 2]), move("jumper", "hold", [20, 9])],
    [move("lifter", "pick")],
    [move("lifter", "deliver")],
  ],
};

function optionFor(w: World, m: Move): { robot: number; option: number } {
  const r = w.robots.find((x) => x.role === m.role);
  if (!r) throw new Error(`${w.level.def.id} has no ${m.role}`);
  const L = w.level;
  const tile = m.at ? m.at[1] * L.cols + m.at[0] : -1;
  const targetTile: Partial<Record<OptionKind, (i: number) => number[]>> = {
    hack: (i) => [L.terminals[i]],
    bridge: (i) => [L.bridgeSpots[i]],
    break: (i) => [L.rubble[i]],
    push: (i) => [L.blocks[i]],
    hold: (i) => [L.plates[i]],
    shield: (i) => L.laserRuns[i],
  };
  const option = r.options.findIndex((o) => o.kind === m.kind && (tile < 0 || (targetTile[o.kind]?.(o.target) ?? []).includes(tile)));
  if (option < 0) throw new Error(`${m.role} can't ${m.kind} at ${m.at}`);
  return { robot: r.id, option };
}

/** Plays a scripted solution (optionally leaving out one phase); idle robots wait where they are. */
function play(def: LevelDef, phases: Move[][], skip = -1) {
  const w = new World({ ...def, timeLimit: 10_000 }, { seed: 1 });
  const waitOf = (id: number) => w.robots[id].options.findIndex((o) => o.kind === "wait");
  for (let p = 0; p < phases.length; p++) {
    if (p === skip) continue;
    const moves = phases[p].map((m) => optionFor(w, m));
    for (const { robot, option } of moves) w.command(robot, option);
    for (let t = 0; t < 300; t++) {
      const done = moves.every(({ robot, option }) => {
        const r = w.robots[robot];
        const kind = r.options[option].kind;
        return r.option !== option || ((kind === "hold" || kind === "shield") && r.phase === "hold");
      });
      if (done) break;
      for (const r of w.robots) if (r.option < 0) w.command(r.id, waitOf(r.id));
      w.step();
      if (w.history.length) return { solved: w.history[0].success, ticks: w.history[0].ticks };
    }
  }
  return { solved: false, ticks: w.tick };
}

describe("hard levels", () => {
  it.each(Object.keys(SOLUTIONS))("%s: the intended chain solves it inside the time limit", (id) => {
    const def = getLevel(id);
    expect(def.id).toBe(id);
    const { solved, ticks } = play(def, SOLUTIONS[id]);
    expect(solved).toBe(true);
    expect(ticks).toBeLessThanOrEqual(def.timeLimit);
  });

  it.each(Object.keys(SOLUTIONS))("%s: every step of the chain is needed", (id) => {
    const phases = SOLUTIONS[id];
    for (let skip = 0; skip < phases.length; skip++) {
      expect(play(getLevel(id), phases, skip).solved, `skipping phase ${skip + 1}`).toBe(false);
    }
  });
});
