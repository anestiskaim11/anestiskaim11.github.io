import { lazy, Suspense } from "react";

// The game (renderer, simulation worker) loads only when the dialog opens.
const RobotGame = lazy(() => import("./ui/RobotGame").then((m) => ({ default: m.RobotGame })));

export function RobotGameLazy({ onExit }: { onExit: () => void }) {
  return (
    <Suspense
      fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Booting the robots…</div>}
    >
      <RobotGame onExit={onExit} />
    </Suspense>
  );
}
