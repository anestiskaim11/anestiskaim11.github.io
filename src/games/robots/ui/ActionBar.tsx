import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_INFO, type Role } from "../sim/robots";
import { ROLE_ICONS } from "./roleIcons";

interface ActionBarProps {
  role: Role;
  /** The ability usable right now, or null when there's nothing to do here. */
  action: string | null;
  onAct: () => void;
  disabled: boolean;
}

/** Shows which robot you drive and a button for its ability (Space / E). */
export function ActionBar({ role, action, onAct, disabled }: ActionBarProps) {
  const info = ROLE_INFO[role];
  const Icon = ROLE_ICONS[role];
  const ready = !!action && !disabled;
  return (
    <div className="absolute bottom-[4.25rem] left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/80 p-1.5 pl-2.5 shadow-lg backdrop-blur-md md:bottom-[5rem]">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold" style={{ color: info.color }}>
        <Icon className="h-4 w-4" />
        You: {info.name}
      </span>
      <button
        type="button"
        onClick={onAct}
        disabled={!ready}
        title={info.ability}
        className={cn(
          "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
          ready ? "border-cyan-300/60 bg-cyan-400/15 text-white shadow-[0_0_14px_rgba(34,211,238,0.35)] hover:bg-cyan-400/25" : "border-white/10 text-slate-500",
        )}
      >
        <Zap className="h-4 w-4" />
        {action ?? "Move next to a target"}
        <kbd className="hidden rounded border border-white/20 px-1 text-[10px] text-slate-400 sm:inline">Space</kbd>
      </button>
    </div>
  );
}
