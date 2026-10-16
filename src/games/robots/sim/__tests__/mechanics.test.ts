import { describe, expect, it } from "vitest";
import { parseLevel, TILE } from "../grid";
import { LEVELS, type LevelDef } from "../levels";
import { findPath } from "../pathfinding";
import type { Role } from "../robots";
import { World } from "../world";
import { fixture } from "./fixtures";

/** World where only the listed roles act; everyone else is switched off. */
function isolated(levelId: string, roles: Role[]) {
  const w = new World(fixture(levelId), { seed: 1 });
  for (const r of w.robots) if (!roles.includes(r.role)) r.active = false;
  return w;
}

const robotOf = (w: World, role: Role) => w.robots.find((r) => r.role === role)!;

/** Commands `role` to run the option labelled `label` and steps until it finishes. */
function run(w: World, role: Role, label: string, maxTicks = 80) {
  const r = robotOf(w, role);
  const option = r.options.findIndex((o) => o.label === label);
  if (option < 0) throw new Error(`${role} has no option ${label}`);
  w.command(r.id, option);
  for (let t = 0; t < maxTicks && r.option === option; t++) w.step();
  return r;
}

const tileAt = (w: World, x: number, y: number) => y * w.level.cols + x;

describe("levels", () => {
  it.each(LEVELS.map((l) => [l.id, l]))("%s parses with a core, reactor and enough spawns", (_, def) => {
    const level = parseLevel(def);
    expect(level.core).toBeGreaterThanOrEqual(0);
    expect(level.tiles[level.reactor]).toBe(TILE.Reactor);
    expect(level.spawns.length).toBeGreaterThanOrEqual(def.robots.length);
    expect(new Set(def.robots).size).toBe(def.robots.length);
    expect(def.robots.length).toBeGreaterThanOrEqual(5);
  });
});

describe("mechanics", () => {
  it("hacking the terminal opens the door", () => {
    const w = isolated("power-up", ["hacker"]);
    const door = w.level.doors[0];
    expect(w.passable(door, "lifter")).toBe(false);
    run(w, "hacker", "Hack terminal");
    expect(w.doorsOpen).toBe(true);
    expect(w.passable(door, "lifter")).toBe(true);
  });

  it("the Lifter can't reach the core behind a closed door, then carries it home once open", () => {
    const w = isolated("power-up", ["hacker", "lifter"]);
    run(w, "lifter", "Pick up core");
    expect(w.holder).toBe(-1);
    run(w, "hacker", "Hack terminal");
    run(w, "lifter", "Pick up core");
    expect(w.holder).toBe(robotOf(w, "lifter").id);
    const episode = w.episode;
    run(w, "lifter", "Deliver core");
    expect(w.episode).toBe(episode + 1);
    expect(w.history[w.history.length - 1].success).toBe(true);
  });

  it("building a bridge makes the gap walkable", () => {
    const w = isolated("chasm", ["builder"]);
    const spot = w.level.bridgeSpots[0];
    expect(w.passable(spot, "lifter")).toBe(false);
    run(w, "builder", "Build bridge");
    expect(w.passable(spot, "lifter")).toBe(true);
  });

  it("the Magnet pulls the core across the chasm", () => {
    const w = isolated("chasm", ["magnet"]);
    run(w, "magnet", "Pull core");
    const gapX = w.level.bridgeSpots[0] % w.level.cols;
    expect(w.core % w.level.cols).toBeLessThan(gapX);
    expect(w.level.reactorDist[w.core]).toBeLessThan(w.level.reactorDist[w.level.core]);
  });

  it("pushing the block onto the plate turns the lasers off for good", () => {
    const w = isolated("laser-hall", ["pusher"]);
    expect(w.lasersOn[0]).toBe(true);
    run(w, "pusher", "Push block to plate");
    w.step();
    expect(w.blocks[0]).toBe(w.level.plates[0]);
    expect(w.lasersOn[0]).toBe(false);
  });

  it("a Shield standing in the beam blocks it and survives; other robots get disabled when it comes back", () => {
    const w = isolated("laser-hall", ["shield", "lifter"]);
    const shield = robotOf(w, "shield");
    const lifter = robotOf(w, "lifter");
    const block = shield.options.findIndex((o) => o.kind === "shield");
    w.command(shield.id, block);
    for (let t = 0; t < 40 && shield.phase !== "hold"; t++) w.step();
    expect(w.lasersOn[0]).toBe(false);
    expect(shield.active).toBe(true);

    // The Lifter stands in the beam while the Shield holds it off...
    lifter.pos = w.level.laserRuns[0].find((t) => t !== shield.pos)!;
    w.command(lifter.id, lifter.options.findIndex((o) => o.kind === "wait"));
    w.step();
    expect(lifter.active).toBe(true);
    // ...then the Shield powers down and the beam returns.
    shield.active = false;
    w.step();
    expect(w.lasersOn[0]).toBe(true);
    expect(lifter.active).toBe(false);
  });

  it("only the Jumper can reach the island plate", () => {
    const w = new World(fixture("rubble-run"), { seed: 1 });
    w.rubble[0] = false;
    const plate = w.level.plates[0];
    const from = tileAt(w, 12, 6);
    const ctx = (canJump: boolean) => ({
      cols: w.level.cols,
      rows: w.level.rows,
      passable: (t: number) => w.passable(t, "jumper"),
      canJump,
      isGap: (t: number) => w.isGap(t),
    });
    const jumpPath = findPath(ctx(true), from, (t) => t === plate);
    expect(jumpPath).not.toBeNull();
    expect(jumpPath!.some((s) => s.air)).toBe(true);
    expect(findPath(ctx(false), from, (t) => t === plate)).toBeNull();
  });

  it("rubble blocks the way until the Breaker smashes it", () => {
    const w = isolated("rubble-run", ["breaker"]);
    const rubble = w.level.rubble[0];
    expect(w.passable(rubble, "lifter")).toBe(false);
    run(w, "breaker", "Break rubble");
    expect(w.passable(rubble, "lifter")).toBe(true);
  });
});

describe("linked switches", () => {
  const fixture = (map: string[], channels: string[]): LevelDef => ({
    id: "fixture",
    name: "Fixture",
    tier: 1,
    timeLimit: 200,
    description: "",
    robots: ["lifter", "hacker"],
    map,
    channels,
  });

  const doors = fixture(
    ["#########", "#SST.T..#", "#SS.....#", "###D#D###", "#.......#", "#G.....C#", "#########"],
    [".........", "...1.2...", ".........", "...1.2...", ".........", ".........", "........."],
  );
  const lasers = fixture(
    ["#########", "#SS.P.P.#", "#SS.....#", "#LLLLLLL#", "#.......#", "#LLLLLLL#", "#G....C.#", "#########"],
    [".........", "....1.2..", ".........", ".1111111.", ".........", ".2222222.", ".........", "........."],
  );

  it("a terminal opens only the doors on its channel", () => {
    const w = new World(doors, { seed: 1 });
    const [d1, d2] = [tileAt(w, 3, 3), tileAt(w, 5, 3)];
    run(w, "hacker", "Hack terminal 1");
    expect(w.passable(d1, "lifter")).toBe(true);
    expect(w.passable(d2, "lifter")).toBe(false);
    run(w, "hacker", "Hack terminal 2");
    expect(w.passable(d2, "lifter")).toBe(true);
    expect(w.doorsOpen).toBe(true);
  });

  it("a plate switches off only the lasers on its channel", () => {
    const w = new World(lasers, { seed: 1 });
    const hacker = robotOf(w, "hacker");
    w.command(hacker.id, hacker.options.findIndex((o) => o.label === "Hold plate 1"));
    for (let t = 0; t < 20 && hacker.phase !== "hold"; t++) w.step();
    w.step();
    expect(w.lasersOn).toEqual([false, true]);
  });

  it("rejects overlays that leave a lock without a key", () => {
    expect(() => parseLevel({ ...doors, channels: doors.channels!.map((l, y) => (y === 3 ? l.replace("2", "3") : l)) })).toThrow(/no terminal/);
    expect(() => parseLevel({ ...doors, channels: doors.channels!.map((l) => l.replace("1", ".")) })).toThrow(/channel digit/);
  });

  it("names linked switches after their channel", () => {
    const w = new World(doors, { seed: 1 });
    expect(robotOf(w, "hacker").options.map((o) => o.label)).toContain("Hack terminal 2");
  });
});
