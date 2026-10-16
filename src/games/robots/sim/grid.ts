import type { LevelDef } from "./levels";

/** Static tile types. Rubble, blocks and the core are dynamic objects on top of floor tiles. */
export const TILE = {
  Floor: 0,
  Wall: 1,
  Gap: 2,
  BridgeSpot: 3,
  Door: 4,
  Terminal: 5,
  Laser: 6,
  Plate: 7,
  Reactor: 8,
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

const CHAR_TILE: Record<string, Tile> = {
  "#": TILE.Wall,
  ".": TILE.Floor,
  S: TILE.Floor,
  C: TILE.Floor,
  B: TILE.Floor,
  R: TILE.Floor,
  "~": TILE.Gap,
  "=": TILE.BridgeSpot,
  D: TILE.Door,
  T: TILE.Terminal,
  L: TILE.Laser,
  P: TILE.Plate,
  G: TILE.Reactor,
};

export const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface ParsedLevel {
  def: LevelDef;
  cols: number;
  rows: number;
  tiles: Uint8Array;
  spawns: number[];
  core: number;
  reactor: number;
  terminals: number[];
  doors: number[];
  bridgeSpots: number[];
  rubble: number[];
  blocks: number[];
  plates: number[];
  laserRuns: number[][];
  /** Laser run index per tile, or -1. */
  laserRunOf: Int16Array;
  bridgeIndexOf: Int16Array;
  rubbleIndexOf: Int16Array;
  doorIndexOf: Int16Array;
  /** Static room id per tile (doors, gaps, lasers and rubble act as room boundaries), or -1. */
  regions: Int16Array;
  /** BFS distance from the reactor ignoring every dynamic obstacle (used for reward shaping). */
  reactorDist: Int16Array;
  /** Switch channel per door / terminal / plate / laser run: the overlay digit minus one, or 0 without an overlay. */
  doorChannel: number[];
  terminalChannel: number[];
  plateChannel: number[];
  laserRunChannel: number[];
  /** Highest channel id + 1 (1 for levels without a `channels` overlay). */
  channelCount: number;
}

export function parseLevel(def: LevelDef): ParsedLevel {
  const rows = def.map.length;
  const cols = def.map[0].length;
  const n = cols * rows;
  const tiles = new Uint8Array(n);
  const p: Omit<ParsedLevel, "def" | "cols" | "rows" | "tiles" | "laserRuns" | "laserRunOf" | "bridgeIndexOf" | "rubbleIndexOf" | "doorIndexOf" | "doorChannel" | "terminalChannel" | "plateChannel" | "laserRunChannel" | "channelCount" | "regions" | "reactorDist"> = {
    spawns: [],
    core: -1,
    reactor: -1,
    terminals: [],
    doors: [],
    bridgeSpots: [],
    rubble: [],
    blocks: [],
    plates: [],
  };

  def.map.forEach((line, y) => {
    if (line.length !== cols) throw new Error(`Level ${def.id}: row ${y} has width ${line.length}, expected ${cols}`);
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      const t = CHAR_TILE[ch];
      if (t === undefined) throw new Error(`Level ${def.id}: unknown tile '${ch}'`);
      const i = y * cols + x;
      tiles[i] = t;
      if (ch === "S") p.spawns.push(i);
      else if (ch === "C") p.core = i;
      else if (ch === "G") p.reactor = i;
      else if (ch === "T") p.terminals.push(i);
      else if (ch === "D") p.doors.push(i);
      else if (ch === "=") p.bridgeSpots.push(i);
      else if (ch === "R") p.rubble.push(i);
      else if (ch === "B") p.blocks.push(i);
      else if (ch === "P") p.plates.push(i);
    }
  });
  if (p.core < 0 || p.reactor < 0) throw new Error(`Level ${def.id} needs a core and a reactor`);
  if (p.spawns.length < def.robots.length) throw new Error(`Level ${def.id} has fewer spawns than robots`);

  const indexOf = (list: number[]) => {
    const out = new Int16Array(n).fill(-1);
    list.forEach((tile, i) => (out[tile] = i));
    return out;
  };

  // Laser runs: 4-connected groups of laser tiles.
  const laserRunOf = new Int16Array(n).fill(-1);
  const laserRuns: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== TILE.Laser || laserRunOf[i] >= 0) continue;
    const run: number[] = [];
    const stack = [i];
    laserRunOf[i] = laserRuns.length;
    while (stack.length) {
      const c = stack.pop()!;
      run.push(c);
      for (const nb of neighbours(c, cols, rows)) {
        if (tiles[nb] === TILE.Laser && laserRunOf[nb] < 0) {
          laserRunOf[nb] = laserRuns.length;
          stack.push(nb);
        }
      }
    }
    laserRuns.push(run.sort((a, b) => a - b));
  }

  const rubbleSet = new Set(p.rubble);
  const roomTile = (i: number) =>
    (tiles[i] === TILE.Floor || tiles[i] === TILE.Terminal || tiles[i] === TILE.Plate || tiles[i] === TILE.Reactor) &&
    !rubbleSet.has(i);
  const regions = new Int16Array(n).fill(-1);
  let region = 0;
  for (let i = 0; i < n; i++) {
    if (!roomTile(i) || regions[i] >= 0) continue;
    const stack = [i];
    regions[i] = region;
    while (stack.length) {
      const c = stack.pop()!;
      for (const nb of neighbours(c, cols, rows)) {
        if (roomTile(nb) && regions[nb] < 0) {
          regions[nb] = region;
          stack.push(nb);
        }
      }
    }
    region++;
  }

  const reactorDist = new Int16Array(n).fill(-1);
  reactorDist[p.reactor] = 0;
  const queue = [p.reactor];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    for (const nb of neighbours(c, cols, rows)) {
      if (tiles[nb] !== TILE.Wall && reactorDist[nb] < 0) {
        reactorDist[nb] = reactorDist[c] + 1;
        queue.push(nb);
      }
    }
  }

  const channels = parseChannels(def, cols, rows, p.doors, p.terminals, p.plates, laserRuns);

  return {
    def,
    cols,
    rows,
    tiles,
    ...p,
    ...channels,
    laserRuns,
    laserRunOf,
    bridgeIndexOf: indexOf(p.bridgeSpots),
    rubbleIndexOf: indexOf(p.rubble),
    doorIndexOf: indexOf(p.doors),
    regions,
    reactorDist,
  };
}

/** Reads the optional channel overlay and checks every lock has a key. */
function parseChannels(
  def: LevelDef,
  cols: number,
  rows: number,
  doors: number[],
  terminals: number[],
  plates: number[],
  laserRuns: number[][],
) {
  const overlay = def.channels;
  if (overlay && (overlay.length !== rows || overlay.some((line) => line.length !== cols))) {
    throw new Error(`Level ${def.id}: channels overlay must match the map size`);
  }
  let channelCount = 1;
  const channelAt = (i: number) => {
    if (!overlay) return 0;
    const ch = overlay[Math.floor(i / cols)][i % cols];
    if (!/[1-9]/.test(ch)) throw new Error(`Level ${def.id}: switch tile ${i % cols},${Math.floor(i / cols)} needs a channel digit`);
    channelCount = Math.max(channelCount, Number(ch));
    return Number(ch) - 1;
  };
  const doorChannel = doors.map(channelAt);
  const terminalChannel = terminals.map(channelAt);
  const plateChannel = plates.map(channelAt);
  const laserRunChannel = laserRuns.map((run) => {
    const chs = new Set(run.map(channelAt));
    if (chs.size > 1) throw new Error(`Level ${def.id}: a laser run mixes channels`);
    return [...chs][0];
  });
  for (const ch of new Set(doorChannel)) {
    if (!terminalChannel.includes(ch)) throw new Error(`Level ${def.id}: a door channel has no terminal`);
  }
  const hasShield = def.robots.includes("shield");
  for (const ch of new Set(laserRunChannel)) {
    if (!plateChannel.includes(ch) && !hasShield) throw new Error(`Level ${def.id}: a laser channel has no plate or Shield`);
  }
  return { doorChannel, terminalChannel, plateChannel, laserRunChannel, channelCount };
}

export function neighbours(i: number, cols: number, rows: number): number[] {
  const x = i % cols;
  const y = (i - x) / cols;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
  }
  return out;
}
