/**
 * Scoring puts the player first: what your own robot does and the feedback
 * you give make up most of the points; the team's solves are a smaller bonus.
 */
export const SCORE_RULES = {
  perTier: 20,
  maxEfficiency: 30,
  mastery: 150,
  /** Each useful move by your robot (opening a door, carrying the core, holding a plate…). */
  perContribution: 30,
  /** Each end-of-episode review, plus each teammate rated in it. */
  perReview: 30,
  perRating: 10,
  /** Live 👍/👎 taps and strategy-card votes. */
  perFeedback: 2,
  maxFeedbackBonus: 60,
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
  contributions: number;
  reviews: number;
  ratings: number;
}

export interface ScoreBreakdown {
  episodes: number;
  solves: number;
  solvePoints: number;
  masteryBonus: number;
  /** Solves + mastery: what the team earned together. */
  teamPoints: number;
  contributions: number;
  interactionPoints: number;
  reviews: number;
  ratings: number;
  feedbackCount: number;
  feedbackPoints: number;
  total: number;
}

export function computeScore(s: ScoreInput): ScoreBreakdown {
  const masteryBonus = s.newlyMastered ? SCORE_RULES.mastery : 0;
  const teamPoints = s.solvePoints + masteryBonus;
  const interactionPoints = s.contributions * SCORE_RULES.perContribution;
  const feedbackPoints =
    s.reviews * SCORE_RULES.perReview +
    s.ratings * SCORE_RULES.perRating +
    Math.min(SCORE_RULES.maxFeedbackBonus, s.feedbackCount * SCORE_RULES.perFeedback);
  return {
    episodes: s.episodes,
    solves: s.solves,
    solvePoints: s.solvePoints,
    masteryBonus,
    teamPoints,
    contributions: s.contributions,
    interactionPoints,
    reviews: s.reviews,
    ratings: s.ratings,
    feedbackCount: s.feedbackCount,
    feedbackPoints,
    total: teamPoints + interactionPoints + feedbackPoints,
  };
}
