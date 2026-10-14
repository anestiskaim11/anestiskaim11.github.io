import { lazy, Suspense } from "react";

// three.js is split into its own chunk so it never delays first paint.
const ParticleHero = lazy(() => import("./ParticleHero").then((m) => ({ default: m.ParticleHero })));

export function ParticleHeroLazy() {
  return (
    <Suspense fallback={null}>
      <ParticleHero />
    </Suspense>
  );
}
