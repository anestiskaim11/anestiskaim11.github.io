import type { Rng } from "./rng";

export interface LearnerParams {
  alpha: number;
  gammaTick: number;
  /** Weight of the human-feedback model H in action selection. */
  beta: number;
  alphaHuman: number;
}

export const DEFAULT_PARAMS: LearnerParams = { alpha: 0.25, gammaTick: 0.99, beta: 40, alphaHuman: 0.6 };

export interface SerializedLearner {
  q: [string, number[]][];
  h: [string, number[]][];
}

export interface Choice {
  option: number;
  /** True when human feedback changed the greedy choice. */
  humanSwayed: boolean;
  greedy: boolean;
}

/**
 * Tabular SMDP Q-learning over a robot's options, plus a TAMER-style model H
 * of human feedback. Robots act greedily on Q + β·H.
 */
export class Learner {
  private q = new Map<string, Float64Array>();
  private h = new Map<string, Float64Array>();

  constructor(
    readonly optionCount: number,
    private readonly rng: Rng,
    private readonly params: LearnerParams = DEFAULT_PARAMS,
  ) {}

  choose(state: string, available: boolean[], epsilon: number): Choice {
    const valid: number[] = [];
    for (let o = 0; o < this.optionCount; o++) if (available[o]) valid.push(o);
    if (valid.length === 0) return { option: -1, humanSwayed: false, greedy: false };
    if (this.rng() < epsilon) return { option: valid[Math.floor(this.rng() * valid.length)], humanSwayed: false, greedy: false };

    const q = this.q.get(state);
    const h = this.h.get(state);
    const pick = (score: (o: number) => number) => {
      let best = -Infinity;
      let ties: number[] = [];
      for (const o of valid) {
        const s = score(o);
        if (s > best + 1e-9) {
          best = s;
          ties = [o];
        } else if (Math.abs(s - best) <= 1e-9) ties.push(o);
      }
      return ties[Math.floor(this.rng() * ties.length)];
    };
    const qOf = (o: number) => (q ? q[o] : 0);
    const option = pick((o) => qOf(o) + this.params.beta * (h ? h[o] : 0));
    // Swayed if, without H, this option would not be among the best.
    const qBest = Math.max(...valid.map(qOf));
    const humanSwayed = !!h && qOf(option) < qBest - 1e-9;
    return { option, humanSwayed, greedy: true };
  }

  /** SMDP update after an option ran for `k` ticks and returned discounted reward `reward`. */
  update(state: string, option: number, reward: number, k: number, next: string, nextAvailable: boolean[], terminal: boolean) {
    const q = this.row(this.q, state);
    let target = reward;
    if (!terminal) {
      const nq = this.q.get(next);
      let best = 0;
      if (nq) {
        best = -Infinity;
        for (let o = 0; o < this.optionCount; o++) if (nextAvailable[o]) best = Math.max(best, nq[o]);
        if (best === -Infinity) best = 0;
      }
      target += Math.pow(this.params.gammaTick, k) * best;
    }
    q[option] += this.params.alpha * (target - q[option]);
  }

  /** Regress H(s, o) toward the human's signal (+1 / -1), scaled by credit weight. */
  human(state: string, option: number, value: number, weight: number) {
    const h = this.row(this.h, state);
    h[option] += this.params.alphaHuman * weight * (value - h[option]);
  }

  qValue(state: string, option: number) {
    return this.q.get(state)?.[option] ?? 0;
  }

  serialize(): SerializedLearner {
    const dump = (m: Map<string, Float64Array>) =>
      [...m].map(([k, v]) => [k, Array.from(v, (x) => Math.round(x * 1000) / 1000)] as [string, number[]]);
    return { q: dump(this.q), h: dump(this.h) };
  }

  load(data: SerializedLearner) {
    const fill = (m: Map<string, Float64Array>, rows: [string, number[]][]) => {
      m.clear();
      for (const [k, v] of rows) if (v.length === this.optionCount) m.set(k, Float64Array.from(v));
    };
    fill(this.q, data.q ?? []);
    fill(this.h, data.h ?? []);
  }

  reset() {
    this.q.clear();
    this.h.clear();
  }

  private row(m: Map<string, Float64Array>, state: string) {
    let r = m.get(state);
    if (!r) {
      r = new Float64Array(this.optionCount);
      m.set(state, r);
    }
    return r;
  }
}
