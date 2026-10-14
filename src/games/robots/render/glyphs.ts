import type { Role } from "../sim/robots";

/** Draws a role's icon centred at (cx, cy) inside a box of size `s`, using the current strokeStyle. */
export function drawGlyph(ctx: CanvasRenderingContext2D, role: Role, cx: number, cy: number, s: number) {
  const u = s / 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(1.2, u * 0.9);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (role) {
    case "lifter": // crate with an up arrow
      ctx.rect(-3 * u, -0.5 * u, 6 * u, 4 * u);
      ctx.moveTo(0, -1.5 * u);
      ctx.lineTo(0, -4 * u);
      ctx.moveTo(-1.5 * u, -2.6 * u);
      ctx.lineTo(0, -4 * u);
      ctx.lineTo(1.5 * u, -2.6 * u);
      break;
    case "hacker": // </>
      ctx.moveTo(-1.6 * u, -2.5 * u);
      ctx.lineTo(-4 * u, 0);
      ctx.lineTo(-1.6 * u, 2.5 * u);
      ctx.moveTo(1.6 * u, -2.5 * u);
      ctx.lineTo(4 * u, 0);
      ctx.lineTo(1.6 * u, 2.5 * u);
      ctx.moveTo(0.8 * u, -3 * u);
      ctx.lineTo(-0.8 * u, 3 * u);
      break;
    case "builder": // bridge planks over an arch
      ctx.moveTo(-4 * u, -1 * u);
      ctx.lineTo(4 * u, -1 * u);
      for (const x of [-3, -1, 1, 3]) {
        ctx.moveTo(x * u, -2.5 * u);
        ctx.lineTo(x * u, -1 * u);
      }
      ctx.moveTo(-3.5 * u, 3 * u);
      ctx.quadraticCurveTo(0, -0.5 * u, 3.5 * u, 3 * u);
      break;
    case "shield":
      ctx.moveTo(0, -4 * u);
      ctx.lineTo(3.4 * u, -2.6 * u);
      ctx.lineTo(3 * u, 1 * u);
      ctx.quadraticCurveTo(2 * u, 3.4 * u, 0, 4.2 * u);
      ctx.quadraticCurveTo(-2 * u, 3.4 * u, -3 * u, 1 * u);
      ctx.lineTo(-3.4 * u, -2.6 * u);
      ctx.closePath();
      break;
    case "pusher": // >>
      ctx.moveTo(-3.5 * u, -3 * u);
      ctx.lineTo(-0.5 * u, 0);
      ctx.lineTo(-3.5 * u, 3 * u);
      ctx.moveTo(0.5 * u, -3 * u);
      ctx.lineTo(3.5 * u, 0);
      ctx.lineTo(0.5 * u, 3 * u);
      break;
    case "jumper": // hop arc with landing marks
      ctx.moveTo(-4 * u, 3 * u);
      ctx.quadraticCurveTo(0, -6 * u, 4 * u, 3 * u);
      ctx.moveTo(2.4 * u, 1.2 * u);
      ctx.lineTo(4 * u, 3 * u);
      ctx.lineTo(4.4 * u, 0.6 * u);
      break;
    case "breaker": // lightning bolt
      ctx.moveTo(1 * u, -4.2 * u);
      ctx.lineTo(-2.6 * u, 0.6 * u);
      ctx.lineTo(0.4 * u, 0.6 * u);
      ctx.lineTo(-1 * u, 4.2 * u);
      ctx.lineTo(2.6 * u, -0.8 * u);
      ctx.lineTo(-0.4 * u, -0.8 * u);
      ctx.closePath();
      break;
    case "magnet": // horseshoe
      ctx.moveTo(-3 * u, -3.5 * u);
      ctx.lineTo(-3 * u, 0.5 * u);
      ctx.arc(0, 0.5 * u, 3 * u, Math.PI, 0, true);
      ctx.lineTo(3 * u, -3.5 * u);
      ctx.moveTo(-4 * u, -3.5 * u);
      ctx.lineTo(-2 * u, -3.5 * u);
      ctx.moveTo(2 * u, -3.5 * u);
      ctx.lineTo(4 * u, -3.5 * u);
      break;
  }
  ctx.stroke();
  ctx.restore();
}
