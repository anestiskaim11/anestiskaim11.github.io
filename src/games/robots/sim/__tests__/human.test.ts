import { describe, expect, it } from "vitest";
import type { Role } from "../robots";
import { World } from "../world";
import { fixture } from "./fixtures";

const RIGHT = 0;

/** World where the player drives `role`; every other robot is switched off unless listed. */
function playing(levelId: string, role: Role, keep: Role[] = [], requireReview = false) {
  const def = fixture(levelId);
  const w = new World(def, { seed: 3, human: def.robots.indexOf(role), requireReview });
  for (const r of w.robots) if (r.role !== role && !keep.includes(r.role)) r.active = false;
  return { w, me: w.robots[w.human!] };
}

describe("player control", () => {
  it("moves one tile per tap and stops at walls and closed doors", () => {
    const { w, me } = playing("power-up", "hacker");
    const start = me.pos;
    w.humanMove(RIGHT, true);
    w.humanMove(-1);
    w.step();
    expect(me.pos).toBe(start + 1);
    w.step();
    expect(me.pos).toBe(start + 1);
    // Holding right runs into the closed door and stays put.
    w.humanMove(RIGHT);
    for (let i = 0; i < 20; i++) w.step();
    expect(w.passable(me.pos + 1, "hacker")).toBe(false);
  });

  it("walks to a clicked tile and uses the ability there", () => {
    const { w, me } = playing("power-up", "hacker");
    const terminal = w.level.terminals[0];
    w.humanGoto(terminal);
    for (let i = 0; i < 30 && me.pos !== terminal; i++) w.step();
    expect(me.pos).toBe(terminal);
    expect(w.humanActionHere()).toBeGreaterThanOrEqual(0);
    w.humanAct();
    for (let i = 0; i < 6; i++) w.step();
    expect(w.doorsOpen).toBe(true);
    expect(w.stats().contributions).toBe(1);
  });

  it("the Lifter picks up and delivers the core automatically", () => {
    const { w, me } = playing("power-up", "lifter");
    w.channelOpen.fill(true);
    w.humanGoto(w.core);
    for (let i = 0; i < 40 && !me.carrying; i++) w.step();
    expect(me.carrying).toBe(true);
    w.humanGoto(w.level.reactor);
    for (let i = 0; i < 40 && w.episode === 1; i++) w.step();
    expect(w.history[0].success).toBe(true);
    expect(w.stats().contributions).toBe(2);
  });

  it("the player's robot never learns on its own", () => {
    const { w, me } = playing("power-up", "hacker", ["lifter", "builder", "pusher", "breaker"]);
    for (let i = 0; i < 300; i++) w.step();
    expect(me.learner.serialize().q).toHaveLength(0);
    expect(me.option).toBe(-1);
  });
});

describe("end-of-episode review", () => {
  it("freezes the world until the player sends a review", () => {
    const { w } = playing("power-up", "hacker", ["lifter", "builder", "pusher", "breaker"], true);
    for (let i = 0; i < 200 && !w.pendingReview; i++) w.step();
    const review = w.pendingReview!;
    expect(review).not.toBeNull();
    expect(review.teammates.map((t) => t.role)).not.toContain("hacker");
    const tick = w.tick;
    w.step();
    expect(w.tick).toBe(tick);

    w.review(1, review.teammates.map((t) => ({ robot: t.robot, value: -1 })));
    expect(w.pendingReview).toBeNull();
    expect(w.stats().reviews).toBe(1);
    expect(w.stats().ratings).toBe(review.teammates.length);
    w.step();
    expect(w.tick).toBe(tick + 1);
  });

  it("rating a single teammate is enough to carry on", () => {
    const { w } = playing("power-up", "hacker", ["lifter", "builder"], true);
    for (let i = 0; i < 200 && !w.pendingReview; i++) w.step();
    const [first] = w.pendingReview!.teammates;
    w.review(0, [{ robot: first.robot, value: 1 }]);
    expect(w.pendingReview).toBeNull();
    expect(w.stats().reviews).toBe(1);
    expect(w.stats().ratings).toBe(1);
  });

  it("a team 👎 discourages only the moves that didn't help", () => {
    const { w } = playing("power-up", "hacker", ["lifter", "builder", "pusher", "breaker"], true);
    for (let i = 0; i < 200 && !w.pendingReview; i++) w.step();
    const decisions = (w as unknown as { reviewDecisions: { robot: number; state: string; option: number; helped?: boolean }[] }).reviewDecisions;
    w.review(-1, []);
    const hOf = (d: (typeof decisions)[number]) => (w.robots[d.robot].learner as unknown as { h: Map<string, Float64Array> }).h.get(d.state)?.[d.option] ?? 0;
    for (const d of decisions) {
      if (d.helped) expect(hOf(d)).toBeGreaterThanOrEqual(0);
    }
    expect(decisions.some((d) => !d.helped && hOf(d) < 0)).toBe(true);
  });

  it("a 👎 lowers H for the moves the teammate made that episode", () => {
    const { w } = playing("power-up", "hacker", ["lifter"], true);
    for (let i = 0; i < 200 && !w.pendingReview; i++) w.step();
    const lifter = w.robots.find((r) => r.role === "lifter")!;
    const decisions = (w as unknown as { reviewDecisions: { robot: number; state: string; option: number }[] }).reviewDecisions.filter(
      (d) => d.robot === lifter.id,
    );
    expect(decisions.length).toBeGreaterThan(0);
    w.review(-1, [{ robot: lifter.id, value: -1 }]);
    const h = (lifter.learner as unknown as { h: Map<string, Float64Array> }).h;
    expect(decisions.every((d) => h.get(d.state)![d.option] < 0)).toBe(true);
  });
});
