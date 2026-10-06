import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
};

const PARTICLE_COUNT = 90;
const CONNECT_DISTANCE = 120;
const MOUSE_RADIUS = 160;
const MOUSE_FORCE = 0.35;

export function CursorInteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let animationId = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

    const initParticles = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: randomBetween(0, width),
        y: randomBetween(0, height),
        vx: randomBetween(-0.35, 0.35),
        vy: randomBetween(-0.35, 0.35),
        radius: randomBetween(1.2, 2.4),
        hue: randomBetween(200, 280),
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) initParticles();
    };

    const drawStatic = () => {
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.35, 0, width * 0.5, height * 0.35, width * 0.65);
      gradient.addColorStop(0, "hsla(217, 91%, 60%, 0.2)");
      gradient.addColorStop(0.5, "hsla(262, 83%, 58%, 0.08)");
      gradient.addColorStop(1, "hsla(220, 25%, 6%, 1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    };

    const tick = () => {
      ctx.fillStyle = "hsla(220, 25%, 6%, 0.22)";
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < MOUSE_RADIUS) {
            const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
            p.vx += (dx / dist) * force * MOUSE_FORCE;
            p.vy += (dy / dist) * force * MOUSE_FORCE;
          }
        }

        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) {
          p.x = 0;
          p.vx *= -0.6;
        } else if (p.x > width) {
          p.x = width;
          p.vx *= -0.6;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy *= -0.6;
        } else if (p.y > height) {
          p.y = height;
          p.vy *= -0.6;
        }
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > CONNECT_DISTANCE) continue;
          const alpha = (1 - dist / CONNECT_DISTANCE) * 0.35;
          ctx.strokeStyle = `hsla(217, 91%, 60%, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const p of particles) {
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, 0.85)`;
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };

    const onPointerLeave = () => {
      mouse.active = false;
    };

    const onMotionChange = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches) {
        window.cancelAnimationFrame(animationId);
        drawStatic();
      } else {
        animationId = window.requestAnimationFrame(tick);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    mq.addEventListener("change", onMotionChange);

    if (reducedMotionRef.current) {
      drawStatic();
    } else {
      animationId = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      mq.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}
