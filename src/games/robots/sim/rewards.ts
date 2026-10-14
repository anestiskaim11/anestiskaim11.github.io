/** Default team reward. Every robot receives the same signal, so success is shared. */
export const REWARDS = {
  success: 100,
  subgoal: 10,
  pickCore: 8,
  /** Running out of time ends the episode as a failure. */
  timeout: -25,
  tick: -0.05,
  failedOption: -2,
  /** Individual: small cost for idling, bonus for the robot whose action helped. */
  wait: -0.5,
  contribution: 5,
  disabled: -10,
  /** Potential-based shaping: reward per tile the core moves toward the reactor. */
  shapingPerTile: 0.5,
} as const;

/** Potential Φ for shaping; F = γΦ(s') − Φ(s) preserves the optimal policy. */
export const potential = (coreDistance: number) => -coreDistance * REWARDS.shapingPerTile;
