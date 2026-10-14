export const SCORE_RULES = {
  perTier: 100,
  maxEfficiency: 100,
  mastery: 500,
  perFeedback: 2,
  maxFeedbackBonus: 200,
} as const;

/** Points for one solved episode: tier points plus a bonus for solving quickly. */
export function solvePoints(tier: number, ticks: number, timeLimit: number): number {
  return SCORE_RULES.perTier * tier + Math.round(SCORE_RULES.maxEfficiency * Math.max(0, 1 - ticks / timeLimit));
}

export interface ScoreInput {
  episodes: number;
  solves: number;
  solvePoints: number;
  newlyMastered: boolean;
  feedbackCount: number;
}

export interface ScoreBreakdown {
  episodes: number;
  solves: number;
  solvePoints: number;
  masteryBonus: number;
  feedbackCount: number;
  feedbackBonus: number;
  total: number;
}

export function computeScore(s: ScoreInput): ScoreBreakdown {
  const masteryBonus = s.newlyMastered ? SCORE_RULES.mastery : 0;
  const feedbackBonus = Math.min(SCORE_RULES.maxFeedbackBonus, s.feedbackCount * SCORE_RULES.perFeedback);
  return {
    episodes: s.episodes,
    solves: s.solves,
    solvePoints: s.solvePoints,
    masteryBonus,
    feedbackCount: s.feedbackCount,
    feedbackBonus,
    total: s.solvePoints + masteryBonus + feedbackBonus,
  };
}
