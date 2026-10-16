import { LogOut, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorldStats } from "../sim/world";

interface PauseOverlayProps {
  stats: WorldStats | null;
  score: number;
  onResume: () => void;
  onQuit: () => void;
}

export function PauseOverlay({ stats, score, onResume, onQuit }: PauseOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
      <div className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-950/85 p-6 text-center text-slate-200 shadow-2xl">
        <h2 className="text-2xl font-bold tracking-tight">Paused</h2>
        <p className="mt-1 text-sm text-slate-400">You can still coach teammates and vote on strategy cards while paused.</p>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Episode", stats?.episode ?? 1],
            ["Success", `${Math.round((stats?.successRate ?? 0) * 100)}%`],
            ["Score", score.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="font-mono text-lg tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" onClick={onResume} autoFocus>
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
          <Button variant="outline" className="flex-1 border-pink-400/40 text-pink-200 hover:bg-pink-500/10" onClick={onQuit}>
            <LogOut className="mr-2 h-4 w-4" />
            Quit
          </Button>
        </div>
      </div>
    </div>
  );
}
