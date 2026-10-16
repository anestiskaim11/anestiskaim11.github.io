import { CheckCircle2, LayoutGrid, LogOut, MessageSquareHeart, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SCORE_RULES } from "../sim/score";
import { ROLE_INFO, type Role } from "../sim/robots";
import type { EpisodeReview as Review, ReviewRating } from "../sim/world";
import { ROLE_ICONS } from "./roleIcons";

interface EpisodeReviewProps {
  review: Review;
  humanRole: Role;
  onSubmit: (team: number, ratings: ReviewRating[]) => void;
  /** Leave the session for the level picker, or end it and see the score. */
  onChangeLevel: () => void;
  onQuit: () => void;
}

function Verdict({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="flex shrink-0 gap-1">
      {[1, -1].map((v) => (
        <button
          key={v}
          type="button"
          aria-label={`${v > 0 ? "Good" : "Bad"}: ${label}`}
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? 0 : v)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
            v > 0 ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/15" : "border-rose-400/30 text-rose-300 hover:bg-rose-400/15",
            value === v && (v > 0 ? "bg-emerald-400/30 text-white" : "bg-rose-400/30 text-white"),
          )}
        >
          {v > 0 ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
        </button>
      ))}
    </span>
  );
}

/** Feedback after every episode: rate the team's plan, any teammates, or both (at least one rating). */
export function EpisodeReview({ review, humanRole, onSubmit, onChangeLevel, onQuit }: EpisodeReviewProps) {
  const { card, teammates, yourMoves } = review;
  const [team, setTeam] = useState(0);
  const [ratings, setRatings] = useState<Record<number, number>>({});

  const rated = teammates.filter((t) => ratings[t.robot]).length;
  const ready = team !== 0 || rated > 0;
  const points = SCORE_RULES.perReview + rated * SCORE_RULES.perRating;
  const submit = () => {
    if (!ready) return;
    onSubmit(team, teammates.filter((t) => ratings[t.robot]).map((t) => ({ robot: t.robot, value: ratings[t.robot] })));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && ready) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl animate-fade-in">
        <div className="flex items-center gap-2">
          {card.success ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-rose-400" />}
          <h2 className="text-lg font-bold tracking-tight">
            Episode {card.episode} · {card.success ? `solved in ${card.ticks} ticks` : "timed out"}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Your feedback is how the team learns. Rate the team or at least one robot to continue; every extra robot you rate is +{SCORE_RULES.perRating} points.
        </p>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs">
          <span className="font-semibold" style={{ color: ROLE_INFO[humanRole].color }}>
            You ({ROLE_INFO[humanRole].name})
          </span>
          <span className="text-slate-400">
            {yourMoves.length
              ? ` · ${yourMoves.join(", ")} (+${yourMoves.length * SCORE_RULES.perContribution})`
              : " · no useful moves this time. Use your ability to earn points!"}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <MessageSquareHeart className="h-4 w-4 shrink-0 text-violet-300" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">How was the team's plan?</div>
            <div className="text-[11px] text-slate-500">
              {card.steps.length ? card.steps.map((s) => (s.human ? `You: ${s.label}` : `${ROLE_INFO[s.role].name}: ${s.label}`)).join(" → ") : "No useful moves"}
            </div>
          </div>
          <Verdict value={team} onChange={setTeam} label="the team's plan" />
        </div>

        <div className="mt-3 text-[11px] uppercase tracking-wider text-slate-400">Rate teammates (optional)</div>
        <ul className="mt-1.5 space-y-1.5">
          {teammates.map((t) => {
            const info = ROLE_INFO[t.role];
            const Icon = ROLE_ICONS[t.role];
            return (
              <li key={t.robot} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={{ color: info.color, borderColor: `${info.color}66` }}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {info.name}
                    {t.zapped && <span className="rounded bg-rose-500/15 px-1 text-[10px] text-rose-300">zapped</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] leading-tight">
                    {t.moves.length === 0 && <span className="text-slate-500">Did nothing</span>}
                    {t.moves.map((m, i) => (
                      <span key={i} className={cn("rounded px-1 py-0.5", m.helped ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-400")}>
                        {m.helped && "✓ "}
                        {m.label}
                        {m.count > 1 && ` ×${m.count}`}
                      </span>
                    ))}
                  </div>
                </div>
                <Verdict value={ratings[t.robot] ?? 0} onChange={(v) => setRatings((r) => ({ ...r, [t.robot]: v }))} label={info.name} />
              </li>
            );
          })}
        </ul>

        <Button className="mt-4 w-full" disabled={!ready} onClick={submit}>
          {ready ? `Send feedback & play next episode (+${points}, Enter)` : "Rate the team or a robot to continue"}
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onChangeLevel}>
            <LayoutGrid className="mr-1.5 h-4 w-4" />
            Change level
          </Button>
          <Button variant="outline" onClick={onQuit}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Quit & see score
          </Button>
        </div>
      </div>
    </div>
  );
}
