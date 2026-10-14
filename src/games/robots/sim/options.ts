import type { ParsedLevel } from "./grid";
import type { Role } from "./robots";

export type OptionKind = "hack" | "bridge" | "break" | "push" | "hold" | "shield" | "pick" | "deliver" | "pull" | "wait";

/** A high-level skill a robot can choose. `target` indexes the matching level list (terminals, bridge spots…). */
export interface OptionDef {
  kind: OptionKind;
  target: number;
  label: string;
}

export const ACT_TICKS: Partial<Record<OptionKind, number>> = { hack: 3, bridge: 4, break: 3, pick: 1, deliver: 1, pull: 2 };
export const HOLD_TICKS = 15;
export const WAIT_TICKS = 4;

const numbered = (base: string, i: number, total: number) => (total > 1 ? `${base} ${i + 1}` : base);

/** The options available to a role on a level (filtered later by world state). */
export function optionsForRole(role: Role, level: ParsedLevel): OptionDef[] {
  const out: OptionDef[] = [];
  const add = (kind: OptionKind, target: number, label: string) => out.push({ kind, target, label });

  switch (role) {
    case "lifter":
      add("pick", 0, "Pick up core");
      add("deliver", 0, "Deliver core");
      break;
    case "hacker":
      level.terminals.forEach((_, i) => add("hack", i, numbered("Hack terminal", i, level.terminals.length)));
      break;
    case "builder":
      level.bridgeSpots.forEach((_, i) => add("bridge", i, numbered("Build bridge", i, level.bridgeSpots.length)));
      break;
    case "breaker":
      level.rubble.forEach((_, i) => add("break", i, numbered("Break rubble", i, level.rubble.length)));
      break;
    case "pusher":
      if (level.plates.length) level.blocks.forEach((_, i) => add("push", i, numbered("Push block to plate", i, level.blocks.length)));
      break;
    case "shield":
      level.laserRuns.forEach((_, i) => add("shield", i, numbered("Block laser", i, level.laserRuns.length)));
      break;
    case "magnet":
      add("pull", 0, "Pull core");
      break;
    case "jumper":
      break;
  }
  // Anyone but the Lifter can stand on a plate to switch lasers off.
  if (role !== "lifter" && level.laserRuns.length) {
    level.plates.forEach((_, i) => add("hold", i, numbered("Hold plate", i, level.plates.length)));
  }
  add("wait", 0, "Wait");
  return out;
}

/** Options that count as part of a team strategy (shown on strategy cards). */
export const isStrategic = (kind: OptionKind) => kind !== "wait";
