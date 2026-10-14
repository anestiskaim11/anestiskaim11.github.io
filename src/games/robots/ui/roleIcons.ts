import { ChevronsRight, Hammer, Magnet, Package, Pickaxe, Rabbit, Shield, Terminal, type LucideIcon } from "lucide-react";
import type { Role } from "../sim/robots";

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  lifter: Package,
  hacker: Terminal,
  builder: Hammer,
  shield: Shield,
  pusher: ChevronsRight,
  jumper: Rabbit,
  breaker: Pickaxe,
  magnet: Magnet,
};
