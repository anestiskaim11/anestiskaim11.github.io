import { CheckCircle2, ListTree, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_INFO } from "../sim/robots";
import type { EpisodeCard, StrategyGroup, StrategyStep } from "../sim/world";

interface StrategyFeedProps {
  cards: EpisodeCard[];
  strategies: StrategyGroup[];
  onVote: (episode: number, value: number) => void;
}

function Steps({ steps }: { steps: StrategyStep[] }) {
  if (!steps.length) return <span className="text-[11px] text-slate-500">No useful moves</span>;
  return (
    <ol className="flex flex-wrap gap-1">
      {steps.map((s, i) => (
        <li
          key={i}
          className="rounded-md border px-1.5 py-0.5 text-[10px] leading-tight"
          style={{ borderColor: `${ROLE_INFO[s.role].color}55`, color: ROLE_INFO[s.role].color }}
        >
          {s.human ? "You" : ROLE_INFO[s.role].name}: {s.label}
        </li>
      ))}
    </ol>
  );
}

export function StrategyFeed({ cards, strategies, onVote }: StrategyFeedProps) {
  return (
    <section aria-label="Strategies" className="space-y-3">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <ListTree className="h-4 w-4 text-violet-300" />
          Recent episodes
        </div>
        {cards.length === 0 && <p className="text-[11px] text-slate-500">Strategy cards appear after each episode. Vote to steer the team.</p>}
        <ul className="space-y-1.5">
          {cards.map((c) => (
            <li key={c.episode} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                {c.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                <span className="font-medium">Episode {c.episode}</span>
                <span className="text-slate-500">· {c.success ? `${c.ticks} ticks` : "timed out"} · Strategy {c.strategy}</span>
                <span className="ml-auto flex gap-1">
                  {[1, -1].map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-label={v > 0 ? `Upvote episode ${c.episode}` : `Downvote episode ${c.episode}`}
                      aria-pressed={c.vote === v}
                      onClick={() => onVote(c.episode, v)}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                        v > 0 ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/15" : "border-rose-400/30 text-rose-300 hover:bg-rose-400/15",
                        c.vote === v && (v > 0 ? "bg-emerald-400/25" : "bg-rose-400/25"),
                      )}
                    >
                      {v > 0 ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                    </button>
                  ))}
                </span>
              </div>
              <Steps steps={c.steps} />
            </li>
          ))}
        </ul>
      </div>

      {strategies.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Strategies so far</div>
          <ul className="space-y-1.5">
            {strategies.map((g) => {
              const rate = g.runs ? g.successes / g.runs : 0;
              return (
                <li key={g.signature} className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="font-semibold text-slate-100">Strategy {g.name}</span>
                    <span className="text-slate-500">
                      {g.runs} runs · {Math.round(rate * 100)}% · {g.successes ? `avg ${Math.round(g.ticks / g.successes)}t` : "never solved"}
                    </span>
                  </div>
                  <div className="mb-1.5 h-1 overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${rate * 100}%` }} />
                  </div>
                  <Steps steps={g.steps} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
