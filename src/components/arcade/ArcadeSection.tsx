import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Gamepad2, Play, Trophy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RobotGameLazy } from "@/games/robots/RobotGameLazy";
import { readPersonalBest } from "@/games/robots/storage";

// Decorative preview: a robot relay carrying the energy core over a bridge to the reactor (pure SVG animation).
const RELAY_PATH = "M 270 40 L 230 40 L 230 70 L 160 70 L 110 70 L 110 100 L 50 100";

function Bot({ x, y, color }: { x: number; y: number; color: string }) {
  return <rect x={x - 7} y={y - 7} width="14" height="14" rx="4" fill="#0b1020" stroke={color} strokeWidth="2" />;
}

function RelayPreview() {
  return (
    <svg viewBox="0 0 320 140" className="h-full w-full" aria-hidden>
      <defs>
        <filter id="relay-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="320" height="140" fill="#05070d" />
      <g stroke="rgba(120,140,200,0.08)">
        {Array.from({ length: 16 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="140" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 20} x2="320" y2={i * 20} />
        ))}
      </g>
      {/* Chasm with a bridge, and a laser wall that is switched off. */}
      <rect x="150" y="0" width="20" height="140" fill="#000" stroke="rgba(168,85,247,0.25)" />
      <g filter="url(#relay-glow)" stroke="#fb923c" strokeWidth="2">
        <line x1="150" y1="64" x2="170" y2="64" />
        <line x1="150" y1="76" x2="170" y2="76" />
      </g>
      <line x1="90" y1="0" x2="90" y2="140" stroke="#ff3b5c" strokeWidth="2" strokeDasharray="2 6" opacity="0.6" />
      <circle cx="40" cy="100" r="10" fill="none" stroke="#34d399" strokeWidth="2" filter="url(#relay-glow)">
        <animate attributeName="r" values="9;12;9" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <g filter="url(#relay-glow)">
        <Bot x={135} y={58} color="#fb923c" />
        <Bot x={70} y={40} color="#a3e635" />
        <Bot x={250} y={110} color="#22d3ee" />
        <g>
          <Bot x={0} y={0} color="#fbbf24" />
          <circle cx="0" cy="-12" r="4.5" fill="#fde047" />
          <animateMotion dur="5s" repeatCount="indefinite" path={RELAY_PATH} />
        </g>
      </g>
    </svg>
  );
}

export function ArcadeSection() {
  const [open, setOpen] = useState(false);
  const [best, setBest] = useState(() => readPersonalBest());

  const close = () => {
    setOpen(false);
    setBest(readPersonalBest());
  };

  return (
    <section id="arcade" className="py-24 px-6 bg-card/40 backdrop-blur-[1px]">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-4xl font-bold mb-4 text-center">
          <span className="bg-gradient-primary bg-clip-text text-transparent">AI Arcade</span>
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          Interactive experiments where you can play with the ideas behind modern AI.
        </p>

        <Card className="mx-auto max-w-3xl overflow-hidden border-primary/20 bg-card/80 backdrop-blur-sm">
          <div className="grid md:grid-cols-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="relative block h-48 md:h-full min-h-48 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Play Robot Trainer"
            >
              <RelayPreview />
            </button>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Gamepad2 className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wider">Multi-agent RL</span>
              </div>
              <h3 className="text-2xl font-bold">Robot Trainer</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Eight robots, each with one unique ability, learn through reinforcement learning to cooperate and
                deliver an energy core. Coach them with live rewards or vote on their strategies to speed up their
                learning.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Reinforcement learning", "Multi-agent", "Human feedback", "Web Workers"].map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button className="bg-primary hover:bg-primary/90 shadow-glow" onClick={() => setOpen(true)}>
                  <Play className="mr-2 h-4 w-4" />
                  Play
                </Button>
                {best && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    Your best: {best.score.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 bg-[#04060b] outline-none"
            aria-describedby={undefined}
            // The game handles Esc itself (quit → score summary before closing).
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">Robot Trainer</DialogPrimitive.Title>
            {open && <RobotGameLazy onExit={close} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
