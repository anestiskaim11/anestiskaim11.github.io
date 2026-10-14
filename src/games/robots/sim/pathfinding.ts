import { DIRS } from "./grid";

export interface PathContext {
  cols: number;
  rows: number;
  passable: (tile: number) => boolean;
  /** Jumpers may hop over a single gap tile when `isGap` holds for it. */
  canJump: boolean;
  isGap: (tile: number) => boolean;
}

/** One step of a path: the tile to occupy, and whether the robot is mid-jump over it. */
export interface Step {
  tile: number;
  air: boolean;
}

/**
 * Breadth-first search from `start` to the nearest tile satisfying `isGoal`.
 * Jumps are modelled as two unit steps through an "air" node over the gap,
 * which keeps every edge at cost 1 so plain BFS stays optimal.
 * Returns the steps after `start` (empty if already at a goal), or null if unreachable.
 */
export function findPath(ctx: PathContext, start: number, isGoal: (tile: number) => boolean): Step[] | null {
  if (isGoal(start)) return [];
  const { cols, rows } = ctx;
  const n = cols * rows;
  // Node ids: tiles are [0, n); air nodes are n + gap * 4 + dir.
  const prev = new Int32Array(n * 5).fill(-2);
  prev[start] = -1;
  const queue = new Int32Array(n * 5);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;

  while (head < tail) {
    const node = queue[head++];
    if (node >= n) {
      // Leaving an air node: land on the far side of the gap.
      const gap = Math.floor((node - n) / 4);
      const [dx, dy] = DIRS[(node - n) % 4];
      const land = gap + dy * cols + dx;
      if (prev[land] === -2) {
        prev[land] = node;
        if (isGoal(land)) return unwind(prev, land, n);
        queue[tail++] = land;
      }
      continue;
    }
    const x = node % cols;
    const y = (node - x) / cols;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (ctx.passable(next)) {
        if (prev[next] !== -2) continue;
        prev[next] = node;
        if (isGoal(next)) return unwind(prev, next, n);
        queue[tail++] = next;
      } else if (ctx.canJump && ctx.isGap(next)) {
        const lx = nx + dx;
        const ly = ny + dy;
        if (lx < 0 || ly < 0 || lx >= cols || ly >= rows || !ctx.passable(ly * cols + lx)) continue;
        const air = n + next * 4 + d;
        if (prev[air] !== -2) continue;
        prev[air] = node;
        queue[tail++] = air;
      }
    }
  }
  return null;
}

function unwind(prev: Int32Array, end: number, n: number): Step[] {
  const steps: Step[] = [];
  for (let node = end; prev[node] !== -1; node = prev[node]) {
    steps.push(node >= n ? { tile: Math.floor((node - n) / 4), air: true } : { tile: node, air: false });
  }
  return steps.reverse();
}
