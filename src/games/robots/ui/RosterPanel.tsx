import { ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RobotView } from "../protocol";
import { ROLE_INFO } from "../sim/robots";
import { ROLE_ICONS } from "./roleIcons";

interface RosterPanelProps {
  robots: RobotView[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onFeedback: (robot: number | null, value: number) => void;
}

function Thumbs({ onFeedback, label, size = "sm" }: { onFeedback: (v: number) => void; label: string; size?: "sm" | "lg" }) {
  const base =
    "flex items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
  const dims = size === "lg" ? "h-9 flex-1 gap-1.5 text-sm" : "h-7 w-7";
  return (
    <>
      <button
        type="button"
        aria-label={`Reward ${label}`}
        title={`Reward ${label} (↑)`}
        onClick={(e) => {
          e.stopPropagation();
          onFeedback(1);
        }}
        className={cn(base, dims, "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/15")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {size === "lg" && "Good"}
      </button>
      <button
        type="button"
        aria-label={`Punish ${label}`}
        title={`Punish ${label} (↓)`}
        onClick={(e) => {
          e.stopPropagation();
          onFeedback(-1);
        }}
        className={cn(base, dims, "border-rose-400/30 text-rose-300 hover:bg-rose-400/15")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        {size === "lg" && "Bad"}
      </button>
    </>
  );
}

export function RosterPanel({ robots, selected, onSelect, onFeedback }: RosterPanelProps) {
  return (
    <section aria-label="Robot team" className="space-y-2">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Users className="h-4 w-4 text-cyan-300" />
          Coach the team
        </div>
        <div className="flex gap-2">
          <Thumbs label="the whole team" size="lg" onFeedback={(v) => onFeedback(null, v)} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Rewards credit what robots did in the last ~2 seconds. Select a robot to coach it alone (↑ / ↓, Tab to cycle).
        </p>
      </div>
      <ul className="space-y-1.5">
        {robots.map((r) => {
          const info = ROLE_INFO[r.role];
          const Icon = ROLE_ICONS[r.role];
          const isSelected = selected === r.id;
          return (
            <li key={r.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(isSelected ? null : r.id);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  isSelected ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                  !r.active && "opacity-60",
                )}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                  style={{ color: info.color, borderColor: `${info.color}66`, boxShadow: r.active ? `0 0 12px ${info.color}33` : undefined }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                    {info.name}
                    {r.carrying && <span className="rounded bg-yellow-400/15 px-1 text-[10px] text-yellow-300">core</span>}
                    {!r.active && <span className="rounded bg-rose-500/15 px-1 text-[10px] text-rose-300">offline</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-400" title={info.ability}>
                    {r.active ? (r.intent ? `→ ${r.intent}` : "Thinking…") : "Zapped by a laser"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Thumbs label={info.name} onFeedback={(v) => onFeedback(r.id, v)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
