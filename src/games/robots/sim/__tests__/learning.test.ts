import { describe, expect, it } from "vitest";
import { Learner } from "../learner";
import { getLevel } from "../levels";
import { createRng } from "../rng";
import { computeScore, solvePoints } from "../score";
import { World } from "../world";

/** Steps until `episodes` more episodes have finished, calling `onEpisode` after each. */
function train(w: World, episodes: number, onEpisode?: () => void) {
  const target = w.stats().episodesTrained + episodes;
  let last = w.stats().episodesTrained;
  while (last < target) {
    w.step();
    const now = w.stats().episodesTrained;
    if (now > last) {
      last = now;
      onEpisode?.();
    }
  }
}

describe("learning", () => {
  it.each(["power-up", "chasm"])("%s reaches 80%% success within 300 episodes", (id) => {
    const w = new World(getLevel(id), { seed: 11 });
    train(w, 300);
    expect(w.stats().successRate).toBeGreaterThanOrEqual(0.8);
    expect(w.stats().mastered).toBe(true);
  });

  it("gets faster with training", () => {
    const w = new World(getLevel("grand-relay"), { seed: 4 });
    train(w, 15);
    const early = w.history.filter((h) => h.success).map((h) => h.ticks);
    train(w, 150);
    const late = w.history.slice(-20).filter((h) => h.success).map((h) => h.ticks);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    expect(late.length).toBeGreaterThanOrEqual(16);
    expect(mean(late)).toBeLessThan(early.length ? mean(early) : Infinity);
  });
});

describe("human feedback", () => {
  it("H can override Q for the greedy choice and reports the sway", () => {
    const learner = new Learner(2, createRng(1));
    learner.update("s", 0, 10, 1, "s", [true, true], true);
    expect(learner.choose("s", [true, true], 0).option).toBe(0);
    learner.human("s", 1, 1, 1);
    const choice = learner.choose("s", [true, true], 0);
    expect(choice.option).toBe(1);
    expect(choice.humanSwayed).toBe(true);
  });

  it("strategy-card votes shift which strategy the team uses", () => {
    const usesBridge = (w: World) =>
      w.cards.slice(-10).filter((c) => c.steps.some((s) => s.label === "Build bridge")).length;

    const baseline = new World(getLevel("chasm"), { seed: 5 });
    train(baseline, 120);

    // Same seed, but the coach punishes bridge plans and rewards the Magnet route.
    const coached = new World(getLevel("chasm"), { seed: 5 });
    train(coached, 120, () => {
      const card = coached.cards[coached.cards.length - 1];
      const bridge = card.steps.some((s) => s.label === "Build bridge");
      coached.vote(card.episode, !bridge && card.success ? 1 : -1);
    });

    expect(usesBridge(baseline)).toBeGreaterThanOrEqual(8);
    expect(usesBridge(coached)).toBeLessThan(usesBridge(baseline));
    expect(coached.stats().feedbackCount).toBeGreaterThan(0);
  });

  it("live 👎 on a robot's current decision lowers that option's H", () => {
    const w = new World(getLevel("power-up"), { seed: 2 });
    w.step();
    const hacker = w.robots.find((r) => r.role === "hacker")!;
    const state = hacker.decisionState;
    const option = hacker.option;
    w.feedback(hacker.id, -1, 12);
    const h = (hacker.learner as unknown as { h: Map<string, Float64Array> }).h.get(state);
    expect(h?.[option]).toBeLessThan(0);
  });
});

describe("score", () => {
  it("adds tier points, efficiency, mastery and capped coaching bonuses", () => {
    expect(solvePoints(2, 0, 50)).toBe(300);
    expect(solvePoints(2, 50, 50)).toBe(200);
    const s = computeScore({ episodes: 40, solves: 30, solvePoints: 5000, newlyMastered: true, feedbackCount: 500 });
    expect(s.masteryBonus).toBe(500);
    expect(s.feedbackBonus).toBe(200);
    expect(s.total).toBe(5700);
  });
});
