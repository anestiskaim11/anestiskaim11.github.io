import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ParticleSimulation } from "./simulation";

const INTERACTIVE_SELECTOR = "a, button, input, textarea, select, label, [role='button']";
const SHAPE_REBUILD_DELAY_MS = 250;

/** Interactive GPU particle nebula filling its (relatively positioned) parent. */
export function ParticleHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    let { width, height } = host.getBoundingClientRect();

    let sim: ParticleSimulation;
    try {
      sim = new ParticleSimulation(canvas, {
        width: width || window.innerWidth,
        height: height || window.innerHeight,
        size: lowPower ? 128 : 256,
        reducedMotion,
      });
    } catch (error) {
      console.warn("Particle hero disabled:", error);
      setStatus("failed");
      return;
    }

    let frame = 0;
    let last = 0;
    let running = false;
    let visible = true;

    const updateScroll = () => {
      const rect = host.getBoundingClientRect();
      sim.setScroll(-rect.top / Math.max(rect.height, 1));
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      updateScroll();
      sim.tick((now - last) / 1000);
      last = now;
    };
    const sync = () => {
      const shouldRun = visible && !document.hidden && !reducedMotion;
      if (shouldRun && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    };

    if (reducedMotion) {
      sim.prewarm(90);
      sim.render();
    }
    sync();
    setStatus("ready");

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(host);

    let rebuildTimer = 0;
    let shapesWidth = width;
    let shapesHeight = height;
    const resizeObserver = new ResizeObserver(([entry]) => {
      ({ width, height } = entry.contentRect);
      if (!width || !height) return;
      sim.resize(width, height);
      if (reducedMotion) sim.render();
      // Mobile URL-bar show/hide changes height slightly; only refit shapes on real layout changes.
      if (Math.abs(width - shapesWidth) < 1 && Math.abs(height - shapesHeight) < 120) return;
      window.clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(() => {
        shapesWidth = width;
        shapesHeight = height;
        sim.rebuildShapes();
      }, SHAPE_REBUILD_DELAY_MS);
    });
    resizeObserver.observe(host);

    const toNdc = (event: PointerEvent): [number, number] | null => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return [x * 2 - 1, 1 - y * 2];
    };
    const onPointerMove = (event: PointerEvent) => {
      const p = toNdc(event);
      if (p) sim.setPointer(p[0], p[1]);
      else sim.clearPointer();
    };
    const onPointerDown = (event: PointerEvent) => {
      const p = toNdc(event);
      if (!p) return;
      if (event.pointerType === "touch") sim.setPointer(p[0], p[1]);
      const target = event.target as Element | null;
      if (target?.closest(INTERACTIVE_SELECTOR) || !host.contains(target)) return;
      sim.shockwave(p[0], p[1]);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType === "touch") sim.clearPointer();
    };
    const onLeave = () => sim.clearPointer();
    const onVisibility = () => sync();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(rebuildTimer);
      intersection.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      sim.dispose();
    };
  }, []);

  if (status === "failed") return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-1000",
        status === "ready" ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
