import type { WorldStats } from "../sim/world";

interface HudProps {
  stats: WorldStats | null;
  history: { success: boolean; ticks: number }[];
  score: number;
  levelName: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Rolling success rate (cyan) and solve time (pink) over recent episodes. */
function LearningCurve({ history }: { history: { success: boolean; ticks: number }[] }) {
  const w = 180;
  const h = 40;
  if (history.length < 3) {
    return <div className="flex h-10 items-center text-[11px] text-slate-500">Learning curve after a few episodes…</div>;
  }
  const window = 8;
  const rate = history.map((_, i) => {
    const slice = history.slice(Math.max(0, i - window + 1), i + 1);
    return slice.filter((r) => r.success).length / slice.length;
  });
  const solved = history.map((r) => (r.success ? r.ticks : null));
  const maxTicks = Math.max(1, ...solved.filter((t): t is number => t !== null));
  const x = (i: number) => ((i / (history.length - 1)) * w).toFixed(1);
  const rateLine = rate.map((r, i) => `${x(i)},${(h - 2 - r * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-label="Success rate and solve time per episode">
      <polyline points={rateLine} fill="none" stroke="rgb(34 211 238)" strokeWidth={1.5} strokeLinejoin="round" />
      {solved.map((t, i) =>
        t === null ? null : <circle key={i} cx={x(i)} cy={(h - 2 - (t / maxTicks) * (h - 4)).toFixed(1)} r={1.6} fill="rgb(244 114 182)" />,
      )}
    </svg>
  );
}

export function Hud({ stats, history, score, levelName }: HudProps) {
  const items: [string, string][] = [
    ["Episode", String(stats?.episode ?? 1)],
    ["Success", pct(stats?.successRate ?? 0)],
    ["Fastest", stats?.fastest ? `${stats.fastest}t` : "—"],
    ["Explore", pct(stats?.epsilon ?? 0)],
  ];
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-white/10 bg-slate-950/75 p-3 text-slate-200 shadow-lg backdrop-blur-md md:left-4 md:top-4">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
        {levelName}
        {stats?.mastered && <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-emerald-300">Mastered</span>}
      </div>
      <div className="flex items-end gap-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
            <div className="font-mono text-base leading-tight tabular-nums">{value}</div>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-pink-300">Score</div>
          <div className="bg-gradient-to-r from-cyan-300 to-pink-400 bg-clip-text font-mono text-base font-bold leading-tight tabular-nums text-transparent">
            {score.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="mt-2 hidden sm:block">
        <LearningCurve history={history} />
        <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
          <span className="text-cyan-300">— success rate</span>
          <span className="text-pink-300">• solve time</span>
          <span>your influence {pct(stats?.influence ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
