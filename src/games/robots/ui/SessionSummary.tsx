import { Home, RotateCcw, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCORE_RULES, type ScoreBreakdown } from "../sim/score";
import type { WorldStats } from "../sim/world";
import type { PersonalBest } from "../storage";

interface SessionSummaryProps {
  breakdown: ScoreBreakdown;
  stats: WorldStats;
  levelName: string;
  best: PersonalBest | null;
  isNewBest: boolean;
  onPlayAgain: () => void;
  onMenu: () => void;
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString();

export function SessionSummary({ breakdown: b, stats, levelName, best, isNewBest, onPlayAgain, onMenu, onClose }: SessionSummaryProps) {
  const rows: [string, string, number][] = [
    ["Solved episodes", `${fmt(b.solves)} of ${fmt(b.episodes)} · tier + speed points`, b.solvePoints],
    ["Mastery bonus", b.masteryBonus ? "Level mastered this session!" : "Reach 80% success over 20 episodes", b.masteryBonus],
    ["Coaching bonus", `${fmt(b.feedbackCount)} rewards × ${SCORE_RULES.perFeedback} (max ${SCORE_RULES.maxFeedbackBonus})`, b.feedbackBonus],
  ];
  const facts: [string, string][] = [
    ["Success rate", `${Math.round(stats.successRate * 100)}%`],
    ["Fastest solve", stats.fastest ? `${stats.fastest} ticks` : "—"],
    ["Your influence", `${Math.round(stats.influence * 100)}%`],
  ];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-slate-200 shadow-2xl animate-fade-in">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Training over · {levelName}</div>
          {isNewBest && (
            <div className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-300">
              <Trophy className="h-4 w-4" />
              New personal best!
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="font-mono text-base tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {rows.map(([label, detail, points]) => (
              <tr key={label} className="border-b border-white/5">
                <td className="py-2">
                  {label}
                  <div className="text-xs text-slate-500">{detail}</div>
                </td>
                <td className="py-2 text-right font-mono tabular-nums">{fmt(points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-sm uppercase tracking-wider text-slate-400">Score</span>
          <span className="bg-gradient-to-r from-cyan-300 to-pink-400 bg-clip-text font-mono text-4xl font-bold tabular-nums text-transparent">
            {fmt(b.total)}
          </span>
        </div>
        <div className="mt-1 text-right text-xs text-slate-500">Personal best: {best ? fmt(best.score) : "—"}</div>
        <p className="mt-3 text-center text-[11px] text-slate-500">The team's learning on this level is saved, so you can keep training later.</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button onClick={onPlayAgain} autoFocus>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Again
          </Button>
          <Button variant="outline" onClick={onMenu}>
            <Home className="mr-1.5 h-4 w-4" />
            Levels
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" />
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
