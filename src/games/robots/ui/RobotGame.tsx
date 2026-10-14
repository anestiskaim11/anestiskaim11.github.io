import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";
import { RobotClient } from "../client";
import type { RobotView, SummaryMessage, WorldView } from "../protocol";
import { RobotRenderer } from "../render/RobotRenderer";
import { parseLevel } from "../sim/grid";
import { getLevel, LEVELS } from "../sim/levels";
import { computeScore, type ScoreBreakdown } from "../sim/score";
import type { EpisodeCard, StrategyGroup, WorldStats } from "../sim/world";
import {
  clearLevelBrain,
  readLevelProgress,
  readPersonalBest,
  recordScore,
  saveLevelProgress,
  type LevelProgress,
  type PersonalBest,
} from "../storage";
import { Hud } from "./Hud";
import { PauseOverlay } from "./PauseOverlay";
import { RosterPanel } from "./RosterPanel";
import { SessionSummary } from "./SessionSummary";
import { StartScreen } from "./StartScreen";
import { StrategyFeed } from "./StrategyFeed";
import { SPEEDS, Toolbar } from "./Toolbar";

type Phase = "menu" | "playing" | "paused" | "ending" | "summary";

interface Summary {
  breakdown: ScoreBreakdown;
  stats: WorldStats;
  best: PersonalBest | null;
  isNewBest: boolean;
}

const ROSTER_REFRESH_MS = 150;
const readAllProgress = () => Object.fromEntries(LEVELS.map((l) => [l.id, readLevelProgress(l.id)]));

/** Full-screen "Robot Trainer" game. `onExit` closes the host dialog. */
export function RobotGame({ onExit }: { onExit: () => void }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RobotRenderer | null>(null);
  const clientRef = useRef<RobotClient | null>(null);
  const viewRef = useRef<WorldView | null>(null);
  const phaseRef = useRef<Phase>("menu");
  const selectedRef = useRef<number | null>(null);
  const statsRef = useRef<WorldStats | null>(null);
  /** Episodes loaded from a saved brain, and episodes trained this session before a reset. */
  const loadedEpisodesRef = useRef(0);
  const episodeOffsetRef = useRef(0);

  const [phase, setPhaseState] = useState<Phase>("menu");
  const [levelId, setLevelId] = useState(LEVELS[0].id);
  const [speed, setSpeedState] = useState<number>(1);
  const [stats, setStats] = useState<WorldStats | null>(null);
  const [history, setHistory] = useState<{ success: boolean; ticks: number }[]>([]);
  const [cards, setCards] = useState<EpisodeCard[]>([]);
  const [strategies, setStrategies] = useState<StrategyGroup[]>([]);
  const [robots, setRobots] = useState<RobotView[]>([]);
  const [selected, setSelectedState] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [best, setBest] = useState<PersonalBest | null>(() => readPersonalBest());
  const [progress, setProgress] = useState<Record<string, LevelProgress>>(readAllProgress);
  const [teamOpen, setTeamOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const levelRef = useRef(levelId);
  levelRef.current = levelId;

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const setSelected = useCallback((id: number | null) => {
    selectedRef.current = id;
    setSelectedState(id);
    rendererRef.current?.setSelected(id);
  }, []);

  // Renderer, resize and render loop live for the whole dialog.
  useEffect(() => {
    const canvas = canvasRef.current;
    const main = mainRef.current;
    if (!canvas || !main) return;
    let renderer: RobotRenderer;
    try {
      renderer = new RobotRenderer(canvas, parseLevel(getLevel(levelRef.current)));
    } catch (error) {
      console.warn("Robot renderer unavailable:", error);
      setFailed(true);
      return;
    }
    rendererRef.current = renderer;
    const resize = () => {
      const { width, height } = main.getBoundingClientRect();
      if (!width || !height) return;
      const compact = width < 640;
      renderer.resize(width, height, { top: compact ? 84 : 160, right: 0, bottom: 72, left: 0 });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(main);
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      renderer.render();
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clientRef.current?.dispose();
      clientRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Preview the selected mission's map in the menu.
  useEffect(() => {
    if (phase === "menu") rendererRef.current?.setLevel(parseLevel(getLevel(levelId)));
  }, [levelId, phase]);

  // Throttled roster refresh from the latest snapshot.
  useEffect(() => {
    if (phase !== "playing" && phase !== "paused") return;
    const id = window.setInterval(() => setRobots(viewRef.current?.robots ?? []), ROSTER_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const sessionEpisodes = (s: WorldStats) => episodeOffsetRef.current + s.episodesTrained - loadedEpisodesRef.current;

  const finish = useCallback(
    (msg: SummaryMessage) => {
      const id = levelRef.current;
      const s = msg.stats;
      const breakdown = computeScore({
        episodes: sessionEpisodes(s),
        solves: s.solves,
        solvePoints: s.solvePoints,
        newlyMastered: s.newlyMastered,
        feedbackCount: s.feedbackCount,
      });
      const previous = readLevelProgress(id);
      saveLevelProgress(id, { mastered: previous.mastered || s.mastered, episodes: s.episodesTrained, brain: msg.brain });
      const result = recordScore(breakdown.total, id);
      setBest(result.best);
      setProgress(readAllProgress());
      setSummary({ breakdown, stats: s, best: result.best, isNewBest: result.isNew });
      clientRef.current?.dispose();
      clientRef.current = null;
      viewRef.current = null;
      setSelected(null);
      setPhase("summary");
    },
    [setPhase, setSelected],
  );

  const start = useCallback(
    (id: string, continueTraining: boolean) => {
      clientRef.current?.dispose();
      const saved = readLevelProgress(id);
      if (!continueTraining) clearLevelBrain(id);
      const brain = continueTraining ? saved.brain : null;
      loadedEpisodesRef.current = brain?.episodesTrained ?? 0;
      episodeOffsetRef.current = 0;
      setLevelId(id);
      levelRef.current = id;
      setStats(null);
      statsRef.current = null;
      setHistory([]);
      setCards([]);
      setStrategies([]);
      setRobots([]);
      setSummary(null);
      setSelected(null);
      rendererRef.current?.setLevel(parseLevel(getLevel(id)));

      const client = new RobotClient({
        onSnapshot: (msg) => {
          rendererRef.current?.update(msg);
          viewRef.current = msg.view;
        },
        onStats: (msg) => {
          statsRef.current = msg.stats;
          setStats(msg.stats);
          setHistory(msg.history);
          setCards(msg.cards);
          setStrategies(msg.strategies);
        },
        onSummary: finish,
      });
      clientRef.current = client;
      client.send({ type: "init", levelId: id, seed: Math.floor(Math.random() * 2 ** 31), brain, wasMastered: saved.mastered });
      client.send({ type: "setSpeed", speed });
      setPhase("playing");
    },
    [finish, setPhase, setSelected, speed],
  );

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    clientRef.current?.send({ type: "pause" });
    setPhase("paused");
  }, [setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    clientRef.current?.send({ type: "resume" });
    setPhase("playing");
  }, [setPhase]);

  const quit = useCallback(() => {
    if (phaseRef.current !== "playing" && phaseRef.current !== "paused") return;
    setPhase("ending");
    clientRef.current?.send({ type: "quit" });
  }, [setPhase]);

  const exit = useCallback(() => {
    if (phaseRef.current === "playing" || phaseRef.current === "paused") quit();
    else if (phaseRef.current !== "ending") onExit();
  }, [onExit, quit]);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    clientRef.current?.send({ type: "setSpeed", speed: s });
  }, []);

  const feedback = useCallback((robot: number | null, value: number) => {
    if (!clientRef.current) return;
    clientRef.current.send({ type: "feedback", robot, value });
    rendererRef.current?.feedbackPop(robot, value);
  }, []);

  const vote = useCallback((episode: number, value: number) => {
    clientRef.current?.send({ type: "vote", episode, value });
  }, []);

  const resetLearning = useCallback(() => {
    const s = statsRef.current;
    if (s) episodeOffsetRef.current += s.episodesTrained - loadedEpisodesRef.current;
    loadedEpisodesRef.current = 0;
    clientRef.current?.send({ type: "resetLearning" });
  }, []);

  // Keyboard shortcuts and auto-pause when the player looks away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const p = phaseRef.current;
      const inGame = p === "playing" || p === "paused";
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      } else if (!inGame) {
        return;
      } else if (e.key === "p" || e.key === "P" || (e.key === " " && !target?.closest("button, [role='button']"))) {
        e.preventDefault();
        if (p === "playing") pause();
        else resume();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        feedback(selectedRef.current, e.key === "ArrowUp" ? 1 : -1);
      } else if (e.key === "Tab") {
        const count = viewRef.current?.robots.length ?? 0;
        if (!count) return;
        e.preventDefault();
        const cur = selectedRef.current;
        const step = e.shiftKey ? -1 : 1;
        const next = cur === null ? (step > 0 ? 0 : count - 1) : cur + step;
        setSelected(next < 0 || next >= count ? null : next);
      } else if (["1", "2", "3"].includes(e.key)) {
        setSpeed(SPEEDS[Number(e.key) - 1]);
      }
    };
    const onHidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [exit, feedback, pause, resume, setSelected, setSpeed]);

  const onCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing" && phaseRef.current !== "paused") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = rendererRef.current?.robotAt(e.clientX - rect.left, e.clientY - rect.top) ?? null;
    setSelected(hit === selectedRef.current ? null : hit);
  };

  const liveScore = stats
    ? computeScore({
        episodes: sessionEpisodes(stats),
        solves: stats.solves,
        solvePoints: stats.solvePoints,
        newlyMastered: stats.newlyMastered,
        feedbackCount: stats.feedbackCount,
      }).total
    : 0;
  const inGame = phase === "playing" || phase === "paused" || phase === "ending";
  const level = getLevel(levelId);

  return (
    <div className="flex h-full w-full select-none bg-[#04060b] text-slate-200">
      <div ref={mainRef} className="relative min-w-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className={cn("absolute inset-0 h-full w-full", inGame && "cursor-pointer")}
          onClick={onCanvasClick}
          aria-label={`${level.name} arena`}
        />

        {failed && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-6 text-center text-slate-300">
            <div>
              <p>This game needs a canvas-capable browser.</p>
              <button type="button" onClick={onExit} className="mt-4 text-cyan-300 underline">
                Close
              </button>
            </div>
          </div>
        )}

        {inGame && <Hud stats={stats} history={history} score={liveScore} levelName={level.name} />}
        {inGame && (
          <Toolbar
            speed={speed}
            onSpeed={setSpeed}
            paused={phase === "paused"}
            onTogglePause={phase === "paused" ? resume : pause}
            onResetLearning={resetLearning}
            onToggleTeam={() => setTeamOpen((o) => !o)}
            onQuit={quit}
          />
        )}
        {phase === "paused" && <PauseOverlay stats={stats} score={liveScore} onResume={resume} onQuit={quit} />}
        {phase === "menu" && (
          <StartScreen levelId={levelId} onLevel={setLevelId} onStart={(cont) => start(levelId, cont)} progress={progress} best={best} />
        )}
        {phase === "summary" && summary && (
          <SessionSummary
            breakdown={summary.breakdown}
            stats={summary.stats}
            levelName={level.name}
            best={summary.best}
            isNewBest={summary.isNewBest}
            onPlayAgain={() => start(levelId, true)}
            onMenu={() => setPhase("menu")}
            onClose={onExit}
          />
        )}

        <button
          type="button"
          onClick={exit}
          aria-label={inGame ? "Quit and see your score" : "Close game"}
          className="absolute right-3 top-3 z-40 rounded-full border border-white/10 bg-slate-950/70 p-2 text-slate-300 backdrop-blur-md hover:text-white md:right-4 md:top-4"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {inGame && (
        <aside
          aria-label="Team and strategies"
          className={cn(
            "w-[330px] shrink-0 space-y-5 overflow-y-auto border-l border-white/10 bg-slate-950/85 p-3 backdrop-blur-md",
            "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[65%] max-lg:w-auto max-lg:rounded-t-2xl max-lg:border-l-0 max-lg:border-t",
            !teamOpen && "max-lg:hidden",
          )}
        >
          <div className="flex items-center justify-between lg:hidden">
            <span className="text-sm font-semibold">Team & strategies</span>
            <button type="button" onClick={() => setTeamOpen(false)} aria-label="Hide team panel" className="rounded p-1 text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <RosterPanel robots={robots} selected={selected} onSelect={setSelected} onFeedback={feedback} />
          <StrategyFeed cards={cards} strategies={strategies} onVote={vote} />
        </aside>
      )}
    </div>
  );
}
