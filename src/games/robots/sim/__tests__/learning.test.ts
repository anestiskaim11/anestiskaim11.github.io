import { describe, expect, it } from "vitest";
import { Learner } from "../learner";
import { getLevel } from "../levels";
import { createRng } from "../rng";
import { computeScore, solvePoints } from "../score";
import { World } from "../world";
import { fixture } from "./fixtures";

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
    const w = new World(fixture(id), { seed: 11 });
    train(w, 300);
    expect(w.stats().successRate).toBeGreaterThanOrEqual(0.8);
    expect(w.stats().mastered).toBe(true);
  });

  it.each(["rubble-maze", "gauntlet", "deep-core"])("%s is learnable: 80%% success within 300 episodes", (id) => {
    const w = new World(getLevel(id), { seed: 11 });
    train(w, 300);
    expect(w.stats().successRate).toBeGreaterThanOrEqual(0.8);
  });

  it("fresh robots are clumsy: an untrained team rarely solves a level", () => {
    const w = new World(getLevel("deep-core"), { seed: 11 });
    train(w, 20);
    expect(w.history.filter((h) => h.success).length).toBeLessThanOrEqual(5);
  });

  it("gets faster with training", () => {
    const w = new World(fixture("grand-relay"), { seed: 4 });
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

  it("feedback steers exploration too: a 👎 option is rarely tried at random", () => {
    const learner = new Learner(3, createRng(1));
    learner.human("s", 0, -1, 1);
    let picks = 0;
    for (let i = 0; i < 600; i++) if (learner.choose("s", [true, true, true], 1).option === 0) picks++;
    expect(picks).toBeLessThan(600 / 3 / 4);
  });

  it("strategy-card votes shift which strategy the team uses", () => {
    const usesBridge = (w: World) =>
      w.cards.slice(-10).filter((c) => c.steps.some((s) => s.label === "Build bridge")).length;

    const baseline = new World(fixture("chasm"), { seed: 5 });
    train(baseline, 120);

    // Same seed, but the coach punishes bridge plans and rewards the Magnet route.
    const coached = new World(fixture("chasm"), { seed: 5 });
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
    const w = new World(fixture("power-up"), { seed: 2 });
    const hacker = w.robots.find((r) => r.role === "hacker")!;
    do w.step();
    while (hacker.option < 0);
    const state = hacker.decisionState;
    const option = hacker.option;
    w.feedback(hacker.id, -1, 12);
    const h = (hacker.learner as unknown as { h: Map<string, Float64Array> }).h.get(state);
    expect(h?.[option]).toBeLessThan(0);
  });
});

describe("coaching", () => {
  /** Episodes until the last 20 are 80% solved, giving every review with `coach` (or none). */
  function episodesTo80(seed: number, coach?: (w: World) => void) {
    const w = new World(getLevel("gauntlet"), { seed, requireReview: !!coach });
    for (let n = 0; n < 200; ) {
      w.step();
      if (w.pendingReview) coach!(w);
      if (w.stats().episodesTrained > n) {
        n = w.stats().episodesTrained;
        if (n >= 20 && w.stats().successRate >= 0.8) return n;
      }
    }
    return Infinity;
  }

  it("a team verdict alone after each episode makes the robots learn much faster", () => {
    const verdict = (w: World) => w.review(w.pendingReview!.card.success ? 1 : -1, []);
    expect(episodesTo80(12, verdict)).toBeLessThan(episodesTo80(12) - 20);
  });

  it("coached robots explore less", () => {
    const w = new World(getLevel("gauntlet"), { seed: 1, requireReview: true });
    while (!w.pendingReview) w.step();
    const [a, b] = w.pendingReview.teammates;
    w.review(0, [{ robot: a.robot, value: 1 }]);
    expect(w.epsilonOf(w.robots[a.robot])).toBeLessThan(w.epsilonOf(w.robots[b.robot]));
  });
});

describe("score", () => {
  it("adds team, play and feedback points with capped live taps", () => {
    expect(solvePoints(2, 0, 50)).toBe(70);
    expect(solvePoints(2, 50, 50)).toBe(40);
    const s = computeScore({ episodes: 10, solves: 5, solvePoints: 300, newlyMastered: true, feedbackCount: 500, contributions: 10, reviews: 10, ratings: 40 });
    expect(s.teamPoints).toBe(450);
    expect(s.interactionPoints).toBe(300);
    expect(s.feedbackPoints).toBe(300 + 400 + 60);
    expect(s.total).toBe(1510);
  });

  it("your play and feedback outweigh the team's solves in a typical session", () => {
    // Tier 5, every episode solved quickly, two useful moves and a full review each time.
    const episodes = 20;
    const s = computeScore({
      episodes,
      solves: episodes,
      solvePoints: episodes * solvePoints(5, 40, 95),
      newlyMastered: true,
      feedbackCount: 0,
      contributions: episodes * 2,
      reviews: episodes,
      ratings: episodes * 7,
    });
    expect(s.interactionPoints + s.feedbackPoints).toBeGreaterThan(s.total / 2);
  });
});
