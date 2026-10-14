export const ROLES = ["lifter", "hacker", "builder", "shield", "pusher", "jumper", "breaker", "magnet"] as const;
export type Role = (typeof ROLES)[number];

export interface RoleInfo {
  name: string;
  ability: string;
  color: string;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  lifter: { name: "Lifter", ability: "The only robot that can carry the energy core.", color: "#fbbf24" },
  hacker: { name: "Hacker", ability: "Opens doors by hacking their terminal.", color: "#22d3ee" },
  builder: { name: "Builder", ability: "Builds bridges over marked gaps.", color: "#fb923c" },
  shield: { name: "Shield", ability: "Immune to lasers; blocks a beam while standing in it.", color: "#60a5fa" },
  pusher: { name: "Pusher", ability: "Pushes heavy blocks, e.g. onto pressure plates.", color: "#a3e635" },
  jumper: { name: "Jumper", ability: "Hops over one-tile gaps to reach islands.", color: "#f472b6" },
  breaker: { name: "Breaker", ability: "Smashes rubble that blocks the way.", color: "#f87171" },
  magnet: { name: "Magnet", ability: "Pulls the core up to 5 tiles in a straight line, even across gaps.", color: "#a78bfa" },
};
