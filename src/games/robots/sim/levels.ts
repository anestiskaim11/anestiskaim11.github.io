import type { Role } from "./robots";

/**
 * Map legend:
 *   #  wall          .  floor        S  robot spawn   G  reactor (goal)   C  energy core
 *   ~  gap           =  bridgeable gap               D  door             T  terminal (opens all doors)
 *   L  laser         P  pressure plate (any pressed plate turns all lasers off)
 *   B  heavy block   R  rubble
 */
export interface LevelDef {
  id: string;
  name: string;
  tier: number;
  /** Episode length in ticks; tight enough that random play often fails. */
  timeLimit: number;
  description: string;
  robots: Role[];
  map: string[];
}

export const LEVELS: LevelDef[] = [
  {
    id: "power-up",
    timeLimit: 54,
    name: "Power Up",
    tier: 1,
    description: "A locked door guards the core. Someone has to open it, someone has to carry.",
    robots: ["lifter", "hacker", "builder", "pusher", "breaker"],
    map: [
      "####################",
      "#........#.........#",
      "#.S......#.........#",
      "#.S......#......C..#",
      "#.S..T...D.........#",
      "#.S......#.........#",
      "#.S......#.........#",
      "#...G....#.........#",
      "#........#.........#",
      "####################",
    ],
  },
  {
    id: "chasm",
    timeLimit: 32,
    name: "The Chasm",
    tier: 2,
    description: "The core sits across a chasm. Build a bridge, or pull it over?",
    robots: ["lifter", "hacker", "builder", "magnet", "pusher", "breaker"],
    map: [
      "####################",
      "#........~.........#",
      "#.S......~.........#",
      "#.S......~.........#",
      "#.S......=.........#",
      "#.S......~.........#",
      "#.S......~.C.......#",
      "#.S.G....~.........#",
      "#........~.........#",
      "####################",
    ],
  },
  {
    id: "laser-hall",
    timeLimit: 46,
    name: "Laser Hall",
    tier: 3,
    description: "A laser wall splits the hall. Press the plate, hold it, or shield the beam.",
    robots: ["lifter", "hacker", "shield", "pusher", "magnet", "breaker"],
    map: [
      "####################",
      "#........L.........#",
      "#.S......L.........#",
      "#.S..B...L.........#",
      "#.S......L.....C...#",
      "#.S......L.........#",
      "#.S..P...L.........#",
      "#.S.G....L.........#",
      "#........L.........#",
      "####################",
    ],
  },
  {
    id: "rubble-run",
    timeLimit: 62,
    name: "Rubble Run",
    tier: 4,
    description: "Rubble blocks the way and lasers guard the reactor. The plate sits on an island.",
    robots: ["lifter", "hacker", "builder", "shield", "pusher", "jumper", "breaker"],
    map: [
      "####################",
      "#SS......#.........#",
      "#SS......R.....C...#",
      "#SS......#.........#",
      "#S.......#.........#",
      "#........#....~~~..#",
      "#........#....~P~..#",
      "#LLLLLLLL#....~~~..#",
      "#...G....#.........#",
      "####################",
    ],
  },
  {
    id: "grand-relay",
    timeLimit: 95,
    name: "Grand Relay",
    tier: 5,
    description: "Door, chasm, rubble and lasers. All eight abilities, one relay.",
    robots: ["lifter", "hacker", "builder", "shield", "pusher", "jumper", "breaker", "magnet"],
    map: [
      "####################",
      "#SS......#....~....#",
      "#SS..T...D....~..C.#",
      "#SS......#....=....#",
      "#SS......#....~....#",
      "##R#######....~....#",
      "#..B.....#....~....#",
      "#........#....~....#",
      "#......P.#....~....#",
      "#LLLLLLLL#....~....#",
      "#...G....#....~....#",
      "####################",
    ],
  },
];

export const getLevel = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
