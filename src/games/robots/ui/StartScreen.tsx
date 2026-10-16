import { Brain, CheckCircle2, Gamepad2, MessageSquareHeart, Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEVELS } from "../sim/levels";
import { ROLE_INFO, type Role } from "../sim/robots";
import type { LevelProgress, PersonalBest } from "../storage";
import { ROLE_ICONS } from "./roleIcons";

interface StartScreenProps {
  levelId: string;
  onLevel: (id: string) => void;
  humanRole: Role;
  onHumanRole: (role: Role) => void;
  onStart: (continueTraining: boolean) => void;
  progress: Record<string, LevelProgress>;
  best: PersonalBest | null;
}

const HOW_TO = [
  { icon: Gamepad2, text: "Pick a robot and drive it yourself. Every robot has one ability the others lack, and the energy core only reaches the reactor if you all work together." },
  { icon: Brain, text: "Your AI teammates start out clumsy: they wander off and try pointless moves. They learn by reinforcement learning which skill to use and when, from a shared team reward." },
  { icon: MessageSquareHeart, text: "After every episode you rate the team's plan, any teammates, or both. Your feedback is the fastest way to train them out of bad habits, and most of your score comes from your own play and your feedback." },
];

export function StartScreen({ levelId, onLevel, humanRole, onHumanRole, onStart, progress, best }: StartScreenProps) {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  const saved = progress[level.id];
  const hasBrain = !!saved?.brain && saved.episodes > 0;
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-950/70 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-4 py-12 text-slate-200">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">AI Arcade · Multi-agent reinforcement learning</div>
        <h2 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
          <span className="bg-gradient-to-r from-cyan-300 via-violet-400 to-pink-400 bg-clip-text text-transparent">Robot Trainer</span>
        </h2>
        <ul className="mt-6 space-y-3">
          {HOW_TO.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-sm text-slate-300">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-8 text-xs uppercase tracking-wider text-slate-400">Choose a mission</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((l) => {
            const p = progress[l.id];
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onLevel(l.id)}
                aria-pressed={l.id === levelId}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  l.id === levelId
                    ? "border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-[10px] text-slate-500">Tier {l.tier}</span>
                  {p?.mastered && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" aria-label="Mastered" />}
                </div>
                <div className="mt-1 text-xs text-slate-400">{l.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {l.robots.map((role) => {
                    const Icon = ROLE_ICONS[role];
                    return (
                      <span key={role} title={ROLE_INFO[role].name} className="rounded-md border p-1" style={{ color: ROLE_INFO[role].color, borderColor: `${ROLE_INFO[role].color}55` }}>
                        <Icon className="h-3 w-3" />
                      </span>
                    );
                  })}
                </div>
                {p && p.episodes > 0 && <div className="mt-2 text-[10px] text-slate-500">Trained {p.episodes.toLocaleString()} episodes</div>}
              </button>
            );
          })}
        </div>

        {level.channels && (
          <p className="mt-3 text-xs text-sky-300/90">
            Linked switches: a numbered pip marks every terminal, door, plate and laser. A switch only works the doors or lasers with the same
            number.
          </p>
        )}

        <div className="mt-8 text-xs uppercase tracking-wider text-slate-400">Your robot</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {level.robots.map((role) => {
            const Icon = ROLE_ICONS[role];
            const info = ROLE_INFO[role];
            const active = role === humanRole;
            return (
              <button
                key={role}
                type="button"
                onClick={() => onHumanRole(role)}
                aria-pressed={active}
                title={info.ability}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  active ? "bg-white/10 text-white" : "border-white/10 text-slate-300 hover:border-white/25",
                )}
                style={active ? { borderColor: info.color, boxShadow: `0 0 14px ${info.color}55` } : undefined}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: info.color }} />
                {info.name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">{ROLE_INFO[humanRole].ability}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => onStart(true)} className="shadow-glow" autoFocus>
            <Play className="mr-2 h-5 w-5" />
            {hasBrain ? "Continue playing" : "Start playing"}
          </Button>
          {hasBrain && (
            <Button size="lg" variant="outline" onClick={() => onStart(false)}>
              Start from scratch
            </Button>
          )}
          {best && (
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-300">
              <Trophy className="h-4 w-4" />
              Personal best {best.score.toLocaleString()}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">WASD / arrows move · Space / E use ability · click a tile to walk there · P pause · Esc quit · 1-3 speed</p>
      </div>
    </div>
  );
}
