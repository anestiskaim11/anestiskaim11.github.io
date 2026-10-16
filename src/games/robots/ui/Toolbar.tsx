import { LogOut, PanelRight, Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SPEEDS = [0.5, 1, 2] as const;

interface ToolbarProps {
  speed: number;
  onSpeed: (speed: number) => void;
  paused: boolean;
  onTogglePause: () => void;
  onResetLearning: () => void;
  onToggleTeam: () => void;
  onQuit: () => void;
}

function ToolButton({ active, label, onClick, children, className }: { active?: boolean; label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
        active && "bg-white/15 text-white shadow-[0_0_12px_rgba(34,211,238,0.35)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="mx-1 h-6 w-px shrink-0 bg-white/10" />;

export function Toolbar({ speed, onSpeed, paused, onTogglePause, onResetLearning, onToggleTeam, onQuit }: ToolbarProps) {
  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80 p-1.5 shadow-lg backdrop-blur-md md:bottom-5">
      {SPEEDS.map((s, i) => (
        <ToolButton key={s} label={`Speed ×${s} (${i + 1})`} active={speed === s} onClick={() => onSpeed(s)} className="font-mono">
          ×{s}
        </ToolButton>
      ))}
      <Divider />
      <ToolButton label={paused ? "Resume (P)" : "Pause (P)"} onClick={onTogglePause} active={paused}>
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        <span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
      </ToolButton>
      <ToolButton label="Reset what the robots learned on this level" onClick={onResetLearning}>
        <RotateCcw className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Show team and strategies" onClick={onToggleTeam} className="lg:hidden">
        <PanelRight className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Quit and see your score (Esc)" onClick={onQuit} className="text-pink-300 hover:text-pink-200">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Quit</span>
      </ToolButton>
    </div>
  );
}
