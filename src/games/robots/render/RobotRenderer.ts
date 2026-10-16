import { TILE, type ParsedLevel } from "../sim/grid";
import { ROLE_INFO } from "../sim/robots";
import type { WorldEvent } from "../sim/world";
import type { SnapshotMessage, WorldView } from "../protocol";
import { drawGlyph } from "./glyphs";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

const BG = "#05070d";
const FLOOR = "rgba(22, 32, 58, 0.55)";
const FLOOR_EDGE = "rgba(90, 110, 170, 0.12)";
const WALL = "#0a1020";
const WALL_EDGE = "rgba(129, 140, 248, 0.55)";
const LASER = "#ff3b5c";
const CORE = "#fde047";
const REACTOR = "#34d399";
/** Colours that tie linked terminals/doors and plates/lasers together. */
const CHANNEL_COLORS = ["#38bdf8", "#f472b6", "#facc15", "#a3e635", "#c084fc", "#fb923c", "#2dd4bf", "#f87171", "#e2e8f0"];

/** Canvas2D neon renderer for the robot world. */
export class RobotRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement | null = null;
  private level: ParsedLevel;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private tile = 32;
  private ox = 0;
  private oy = 0;

  private view: WorldView | null = null;
  private prevBlocks: number[] = [];
  private snapshotAt = 0;
  private tickMs = 166;
  private selected: number | null = null;
  private doorAnim: number[] = [];
  private rubbleAnim: number[] = [];
  private bridgeAnim: number[] = [];
  private successFlash = 0;
  private particles: Particle[] = [];
  private beams: Beam[] = [];
  private pops: Pop[] = [];
  private rocks: { x: number; y: number; r: number }[][] = [];
  private last = performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    level: ParsedLevel,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.level = level;
    this.setLevel(level);
  }

  setLevel(level: ParsedLevel) {
    this.level = level;
    this.view = null;
    this.rubbleAnim = level.rubble.map(() => 1);
    this.bridgeAnim = level.bridgeSpots.map(() => 0);
    this.doorAnim = level.doors.map(() => 0);
    this.particles = [];
    this.beams = [];
    this.pops = [];
    // Deterministic rock clusters per rubble tile.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.rocks = level.rubble.map(() =>
      Array.from({ length: 6 }, () => ({ x: rand() * 0.6 - 0.3, y: rand() * 0.6 - 0.3, r: 0.12 + rand() * 0.12 })),
    );
    this.buildStatic();
  }

  resize(width: number, height: number, insets: Insets) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    const { cols, rows } = this.level;
    const availW = Math.max(50, width - insets.left - insets.right - 16);
    const availH = Math.max(50, height - insets.top - insets.bottom - 16);
    this.tile = Math.max(12, Math.floor(Math.min(availW / cols, availH / rows)));
    this.ox = insets.left + 8 + Math.floor((availW - this.tile * cols) / 2);
    this.oy = insets.top + 8 + Math.floor((availH - this.tile * rows) / 2);
    this.buildStatic();
  }

  setSelected(id: number | null) {
    this.selected = id;
  }

  update(msg: SnapshotMessage) {
    const prev = this.view;
    this.prevBlocks = prev && prev.episode === msg.view.episode ? prev.blocks : msg.view.blocks;
    if (!prev || prev.episode !== msg.view.episode) {
      this.doorAnim = msg.view.doorOpen.map((o) => (o ? 1 : 0));
      this.rubbleAnim = msg.view.rubble.map((r) => (r ? 1 : 0));
      this.bridgeAnim = msg.view.bridged.map((b) => (b ? 1 : 0));
    }
    this.view = msg.view;
    this.snapshotAt = performance.now();
    this.tickMs = msg.tickInterval * 1000;
    for (const e of msg.events) this.spawnEffect(e);
  }

  /** Floating "+1" / "−1" over a robot (or the reactor for team feedback). */
  feedbackPop(robot: number | null, value: number) {
    const v = this.view;
    const tile = robot !== null && v ? v.robots[robot]?.pos : this.level.reactor;
    if (tile === undefined) return;
    const [x, y] = this.center(tile);
    this.pops.push({ x, y: y - this.tile * 0.6, text: value > 0 ? "👍 +1" : "👎 −1", color: value > 0 ? "#86efac" : "#fda4af", life: 1 });
  }

  /** Map tile under a canvas-relative CSS pixel, or -1. */
  tileAt(px: number, py: number): number {
    const x = Math.floor((px - this.ox) / this.tile);
    const y = Math.floor((py - this.oy) / this.tile);
    if (x < 0 || y < 0 || x >= this.level.cols || y >= this.level.rows) return -1;
    return y * this.level.cols + x;
  }

  /** Robot under a canvas-relative CSS pixel, or null. */
  robotAt(px: number, py: number): number | null {
    if (!this.view) return null;
    let best: number | null = null;
    let bestD = (this.tile * 0.7) ** 2;
    for (const r of this.view.robots) {
      const [x, y] = this.robotPos(r.pos, r.prev, 1);
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = r.id;
      }
    }
    return best;
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.staticLayer) ctx.drawImage(this.staticLayer, 0, 0, this.width, this.height);

    const v = this.view;
    const t = Math.min(1, (now - this.snapshotAt) / Math.max(1, this.tickMs));
    const time = now / 1000;
    if (v) {
      this.animate(v, dt);
      this.drawBridges();
      this.drawPlates(v, time);
      this.drawTerminals(v, time);
      this.drawDoors();
      this.drawRubble();
      this.drawBlocks(v, t);
      this.drawLasers(v, time);
      this.drawChannelPips();
      this.drawReactor(time);
      this.drawIntent(v, t);
      this.drawRobots(v, t, time);
      this.drawCore(v, t, time);
      this.drawProgress(v);
    }
    this.drawEffects(dt);
  }

  dispose() {
    this.staticLayer = null;
  }

  // ------------------------------------------------------------------ helpers

  private center(tile: number): [number, number] {
    const { cols } = this.level;
    return [this.ox + ((tile % cols) + 0.5) * this.tile, this.oy + (Math.floor(tile / cols) + 0.5) * this.tile];
  }

  private robotPos(pos: number, prev: number, t: number): [number, number] {
    const [x1, y1] = this.center(prev);
    const [x2, y2] = this.center(pos);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  }

  private animate(v: WorldView, dt: number) {
    const k = Math.min(1, dt * 4);
    this.doorAnim = this.doorAnim.map((a, i) => a + ((v.doorOpen[i] ? 1 : 0) - a) * k);
    this.rubbleAnim = this.rubbleAnim.map((a, i) => a + ((v.rubble[i] ? 1 : 0) - a) * k);
    this.bridgeAnim = this.bridgeAnim.map((a, i) => a + ((v.bridged[i] ? 1 : 0) - a) * k);
    this.successFlash = Math.max(0, this.successFlash - dt * 1.2);
  }

  private glow<T>(color: string, blur: number, draw: () => T): T {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    const out = draw();
    ctx.restore();
    return out;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------------------ static layer

  private buildStatic() {
    if (typeof document === "undefined") return;
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.round(this.width * this.dpr));
    layer.height = Math.max(1, Math.round(this.height * this.dpr));
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { cols, rows, tiles } = this.level;
    const s = this.tile;

    const grad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7);
    grad.addColorStop(0, "rgba(40, 30, 90, 0.35)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = tiles[y * cols + x];
        const px = this.ox + x * s;
        const py = this.oy + y * s;
        if (tile === TILE.Wall) {
          ctx.fillStyle = WALL;
          ctx.fillRect(px, py, s, s);
          continue;
        }
        if (tile === TILE.Gap || tile === TILE.BridgeSpot) {
          const g = ctx.createLinearGradient(px, py, px, py + s);
          g.addColorStop(0, "#000");
          g.addColorStop(1, "#0b0420");
          ctx.fillStyle = g;
          ctx.fillRect(px, py, s, s);
          ctx.strokeStyle = "rgba(168, 85, 247, 0.18)";
          ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
          if (tile === TILE.BridgeSpot) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = "rgba(251, 146, 60, 0.7)";
            ctx.strokeRect(px + 3, py + 3, s - 6, s - 6);
            ctx.setLineDash([]);
          }
          continue;
        }
        ctx.fillStyle = FLOOR;
        ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
        ctx.strokeStyle = FLOOR_EDGE;
        ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
      }
    }

    // Neon trim where walls meet open space.
    ctx.save();
    ctx.strokeStyle = WALL_EDGE;
    ctx.lineWidth = 2;
    ctx.shadowColor = WALL_EDGE;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (tiles[y * cols + x] !== TILE.Wall) continue;
        const px = this.ox + x * s;
        const py = this.oy + y * s;
        const open = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && tiles[ny * cols + nx] !== TILE.Wall;
        const edge = (ax: number, ay: number, bx: number, by: number) => {
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        };
        if (open(x, y - 1)) edge(px, py, px + s, py);
        if (open(x, y + 1)) edge(px, py + s, px + s, py + s);
        if (open(x - 1, y)) edge(px, py, px, py + s);
        if (open(x + 1, y)) edge(px + s, py, px + s, py + s);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Spawn pads.
    ctx.strokeStyle = "rgba(96, 165, 250, 0.25)";
    for (const sp of this.level.spawns) {
      const px = this.ox + (sp % cols) * s;
      const py = this.oy + Math.floor(sp / cols) * s;
      ctx.strokeRect(px + s * 0.18, py + s * 0.18, s * 0.64, s * 0.64);
    }
    this.staticLayer = layer;
  }

  // ------------------------------------------------------------------ dynamic layers

  private drawBridges() {
    const { ctx } = this;
    const s = this.tile;
    this.level.bridgeSpots.forEach((spot, i) => {
      const a = this.bridgeAnim[i];
      if (a < 0.02) return;
      const [cx, cy] = this.center(spot);
      // Rails run along the crossing direction: left-right unless the gap runs horizontally.
      const crossesX = !this.isGapTile(spot - 1) && !this.isGapTile(spot + 1);
      ctx.save();
      ctx.translate(cx, cy);
      if (!crossesX) ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = Math.min(1, a * 1.2);
      this.glow("#fb923c", 10, () => {
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2;
        const len = s * a;
        ctx.beginPath();
        for (const ry of [-0.32, 0.32]) {
          ctx.moveTo(-s / 2, ry * s);
          ctx.lineTo(-s / 2 + len, ry * s);
        }
        for (let px = -s / 2 + s / 10; px < -s / 2 + len; px += s / 5) {
          ctx.moveTo(px, -0.32 * s);
          ctx.lineTo(px, 0.32 * s);
        }
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  private drawPlates(v: WorldView, time: number) {
    const { ctx } = this;
    const s = this.tile;
    this.level.plates.forEach((p, i) => {
      const [cx, cy] = this.center(p);
      const pressed = v.platePressed[i];
      this.glow("#facc15", pressed ? 16 : 4, () => {
        ctx.strokeStyle = pressed ? "#fde047" : "rgba(250, 204, 21, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
        ctx.stroke();
        if (pressed) {
          ctx.fillStyle = `rgba(253, 224, 71, ${0.25 + 0.1 * Math.sin(time * 6)})`;
          ctx.fill();
        }
      });
    });
  }

  private drawTerminals(v: WorldView, time: number) {
    const { ctx } = this;
    const s = this.tile;
    const L = this.level;
    L.terminals.forEach((t, ti) => {
      const [cx, cy] = this.center(t);
      // A terminal reads "done" once every door on its channel is open.
      const done = L.doors.every((_, di) => L.doorChannel[di] !== L.terminalChannel[ti] || v.doorOpen[di]);
      const color = done ? "#4ade80" : "#22d3ee";
      ctx.fillStyle = "#0f172a";
      this.roundRect(cx - s * 0.32, cy - s * 0.32, s * 0.64, s * 0.64, 4);
      ctx.fill();
      this.glow(color, 12, () => {
        ctx.fillStyle = color;
        ctx.globalAlpha = done ? 0.9 : 0.6 + 0.4 * Math.abs(Math.sin(time * 3));
        ctx.fillRect(cx - s * 0.22, cy - s * 0.2, s * 0.44, s * 0.26);
      });
    });
  }

  /** Numbered colour pips on linked switches, so players can see what opens what. */
  private drawChannelPips() {
    const L = this.level;
    if (L.channelCount < 2) return;
    const { ctx } = this;
    const s = this.tile;
    const pip = (tile: number, ch: number) => {
      const { cols } = L;
      const x = this.ox + (tile % cols) * s + s * 0.2;
      const y = this.oy + Math.floor(tile / cols) * s + s * 0.2;
      ctx.fillStyle = CHANNEL_COLORS[ch % CHANNEL_COLORS.length];
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, s * 0.16), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#020617";
      ctx.font = `700 ${Math.max(7, s * 0.2)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ch + 1), x, y + 0.5);
    };
    ctx.save();
    L.terminals.forEach((t, i) => pip(t, L.terminalChannel[i]));
    L.doors.forEach((d, i) => pip(d, L.doorChannel[i]));
    L.plates.forEach((p, i) => pip(p, L.plateChannel[i]));
    L.laserRuns.forEach((run, i) => pip(run[0], L.laserRunChannel[i]));
    ctx.restore();
  }

  private drawDoors() {
    const { ctx } = this;
    const s = this.tile;
    this.level.doors.forEach((d, di) => {
      const open = this.doorAnim[di] ?? 0;
      const [cx, cy] = this.center(d);
      const { cols, tiles } = this.level;
      const vertical = tiles[d - cols] === TILE.Wall || tiles[d + cols] === TILE.Wall;
      const color = open > 0.5 ? "rgba(74, 222, 128, 0.5)" : "#f97316";
      this.glow(color, 10, () => {
        ctx.fillStyle = color;
        const half = (s / 2) * (1 - open);
        if (vertical) {
          ctx.fillRect(cx - s * 0.12, cy - s / 2, s * 0.24, half);
          ctx.fillRect(cx - s * 0.12, cy + s / 2 - half, s * 0.24, half);
        } else {
          ctx.fillRect(cx - s / 2, cy - s * 0.12, half, s * 0.24);
          ctx.fillRect(cx + s / 2 - half, cy - s * 0.12, half, s * 0.24);
        }
      });
    });
  }

  private drawRubble() {
    const { ctx } = this;
    const s = this.tile;
    this.level.rubble.forEach((r, i) => {
      const a = this.rubbleAnim[i];
      if (a < 0.02) return;
      const [cx, cy] = this.center(r);
      ctx.save();
      ctx.globalAlpha = a;
      for (const rock of this.rocks[i]) {
        ctx.fillStyle = "#57534e";
        ctx.strokeStyle = "rgba(248, 113, 113, 0.55)";
        ctx.beginPath();
        ctx.arc(cx + rock.x * s, cy + rock.y * s, rock.r * s * a, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  private drawBlocks(v: WorldView, t: number) {
    const { ctx } = this;
    const s = this.tile;
    v.blocks.forEach((b, i) => {
      const [x, y] = this.robotPos(b, this.prevBlocks[i] ?? b, t);
      const onPlate = this.level.plates.includes(b);
      this.glow(onPlate ? "#a3e635" : "#64748b", onPlate ? 14 : 4, () => {
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = onPlate ? "#a3e635" : "#94a3b8";
        ctx.lineWidth = 2;
        this.roundRect(x - s * 0.38, y - s * 0.38, s * 0.76, s * 0.76, 4);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - s * 0.25, y - s * 0.25);
        ctx.lineTo(x + s * 0.25, y + s * 0.25);
        ctx.moveTo(x + s * 0.25, y - s * 0.25);
        ctx.lineTo(x - s * 0.25, y + s * 0.25);
        ctx.stroke();
      });
    });
  }

  private drawLasers(v: WorldView, time: number) {
    const { ctx } = this;
    const s = this.tile;
    this.level.laserRuns.forEach((run, i) => {
      const on = v.lasersOn[i];
      const [x1, y1] = this.center(run[0]);
      const [x2, y2] = this.center(run[run.length - 1]);
      const vertical = Math.abs(x2 - x1) < 1;
      const ext = s / 2;
      const ax = vertical ? x1 : x1 - ext;
      const ay = vertical ? y1 - ext : y1;
      const bx = vertical ? x2 : x2 + ext;
      const by = vertical ? y2 + ext : y2;
      ctx.save();
      if (on) {
        ctx.globalCompositeOperation = "lighter";
        const flicker = 0.75 + 0.25 * Math.sin(time * 40 + i);
        for (const [w, a] of [
          [8, 0.18],
          [3, 0.6],
          [1.2, 1],
        ] as const) {
          ctx.strokeStyle = LASER;
          ctx.globalAlpha = a * flicker;
          ctx.lineWidth = w;
          ctx.shadowColor = LASER;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      } else {
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(255, 59, 92, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.restore();
      // Emitters at both ends.
      ctx.fillStyle = on ? LASER : "#7f1d1d";
      for (const [ex, ey] of [
        [ax, ay],
        [bx, by],
      ]) {
        ctx.fillRect(ex - 3, ey - 3, 6, 6);
      }
    });
  }

  private drawReactor(time: number) {
    const { ctx } = this;
    const s = this.tile;
    const [cx, cy] = this.center(this.level.reactor);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.5);
    this.glow(REACTOR, 18 + 30 * this.successFlash, () => {
      ctx.strokeStyle = REACTOR;
      ctx.lineWidth = 2;
      for (const r of [0.22, 0.36 + pulse * 0.06]) {
        ctx.beginPath();
        ctx.arc(cx, cy, s * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.successFlash > 0) {
        ctx.globalAlpha = this.successFlash;
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.5 + (1 - this.successFlash) * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  private drawIntent(v: WorldView, t: number) {
    for (const id of new Set([this.selected, v.human])) if (id !== null && id >= 0) this.drawIntentOf(v, id, t);
  }

  private drawIntentOf(v: WorldView, id: number, t: number) {
    const r = v.robots[id];
    if (!r || !r.active || r.goal < 0) return;
    const { ctx } = this;
    const [x, y] = this.robotPos(r.pos, r.prev, t);
    const [gx, gy] = this.center(r.goal);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -performance.now() / 40;
    ctx.strokeStyle = ROLE_INFO[r.role].color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(gx, gy, this.tile * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawRobots(v: WorldView, t: number, time: number) {
    const { ctx } = this;
    const s = this.tile;
    for (const r of v.robots) {
      const [x, baseY] = this.robotPos(r.pos, r.prev, t);
      let y = baseY;
      // Jumpers arc over gaps.
      if (r.air || this.isGapTile(r.prev)) y -= Math.sin(Math.PI * t) * s * 0.45;
      const color = r.active ? ROLE_INFO[r.role].color : "#475569";
      const size = s * 0.68;
      const selected = this.selected === r.id;
      this.glow(color, r.active ? (selected ? 22 : 12) : 0, () => {
        ctx.fillStyle = "#0b1020";
        ctx.strokeStyle = color;
        ctx.lineWidth = selected ? 3 : 2;
        this.roundRect(x - size / 2, y - size / 2, size, size, size * 0.28);
        ctx.fill();
        ctx.stroke();
      });
      ctx.strokeStyle = color;
      drawGlyph(ctx, r.role, x, y, size * 0.95);
      if (selected) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (r.active && (r.phase === "act" || r.phase === "hold") && r.kind !== "wait") {
        // Busy spinner while acting / holding.
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const a = time * 6;
        ctx.arc(x, y, size * 0.72, a, a + Math.PI * 0.6);
        ctx.stroke();
      }
      if (!r.active) {
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.3, y - size * 0.3);
        ctx.lineTo(x + size * 0.3, y + size * 0.3);
        ctx.moveTo(x + size * 0.3, y - size * 0.3);
        ctx.lineTo(x - size * 0.3, y + size * 0.3);
        ctx.stroke();
      }
      if (r.id === v.human) {
        // "YOU" tag and a bobbing marker over the player's robot.
        const bob = Math.sin(time * 4) * s * 0.06;
        const ty = y - size * 0.95 + bob;
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.moveTo(x - s * 0.12, ty - s * 0.12);
        ctx.lineTo(x + s * 0.12, ty - s * 0.12);
        ctx.lineTo(x, ty);
        ctx.fill();
        ctx.font = `700 ${Math.max(9, s * 0.26)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("YOU", x, ty - s * 0.18);
      }
      if (selected && r.intent && r.id !== v.human) {
        ctx.font = `600 ${Math.max(10, s * 0.32)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        const label = r.intent;
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
        this.roundRect(x - w / 2, y - size - s * 0.55, w, s * 0.45, 6);
        ctx.fill();
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(label, x, y - size - s * 0.22);
      }
    }
  }

  private drawCore(v: WorldView, t: number, time: number) {
    if (v.delivered && this.successFlash <= 0) return;
    const { ctx } = this;
    const s = this.tile;
    let x: number;
    let y: number;
    if (v.holder >= 0) {
      const h = v.robots[v.holder];
      [x, y] = this.robotPos(h.pos, h.prev, t);
      y -= s * 0.42;
    } else {
      [x, y] = this.center(v.core);
    }
    const r = s * (0.18 + 0.02 * Math.sin(time * 5));
    this.glow(CORE, 24, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, CORE);
      g.addColorStop(1, "rgba(253, 224, 71, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawProgress(v: WorldView) {
    const { ctx } = this;
    const w = this.tile * this.level.cols;
    const frac = Math.min(1, v.tick / v.timeLimit);
    const y = this.oy - 6;
    ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
    ctx.fillRect(this.ox, y, w, 3);
    ctx.fillStyle = frac > 0.8 ? "#f43f5e" : "#38bdf8";
    ctx.fillRect(this.ox, y, w * frac, 3);
  }

  private isGapTile(tile: number) {
    const t = this.level.tiles[tile];
    return t === TILE.Gap || t === TILE.BridgeSpot;
  }

  // ------------------------------------------------------------------ effects

  private burst(tile: number, color: string, count: number, speed = 80) {
    const [x, y] = this.center(tile);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 1.2 + Math.random(), color, size: 1.5 + Math.random() * 2 });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  private beam(from: number, to: number, color: string) {
    const [x1, y1] = this.center(from);
    const [x2, y2] = this.center(to);
    this.beams.push({ x1, y1, x2, y2, life: 1, color });
  }

  private spawnEffect(e: WorldEvent) {
    const L = this.level;
    const color = this.view ? ROLE_INFO[this.view.robots[e.robot]?.role ?? "lifter"].color : "#fff";
    switch (e.type) {
      case "hack": {
        const ch = L.terminalChannel[L.terminals.indexOf(e.tile)];
        L.doors.forEach((d, i) => {
          if (L.doorChannel[i] === ch) this.beam(e.tile, d, "#22d3ee");
        });
        this.burst(e.tile, "#22d3ee", 14);
        break;
      }
      case "bridge":
        this.burst(e.tile, "#fb923c", 22);
        break;
      case "break":
        this.burst(e.tile, "#f87171", 30, 140);
        break;
      case "pick":
        this.burst(e.tile, CORE, 12);
        break;
      case "pull":
        this.beam(e.from, e.to, "#a78bfa");
        this.burst(e.to, "#a78bfa", 14);
        break;
      case "push":
        this.burst(e.to, "#a3e635", 3, 40);
        break;
      case "disable":
        this.burst(e.tile, "#f43f5e", 26, 120);
        break;
      case "success": {
        this.successFlash = 1;
        this.burst(L.reactor, REACTOR, 50, 180);
        const [x, y] = this.center(L.reactor);
        this.pops.push({ x, y: y - this.tile, text: "SOLVED!", color: REACTOR, life: 1.3 });
        break;
      }
      case "deliver":
      case "hold":
        this.burst(e.tile, color, 6, 40);
        break;
    }
  }

  private drawEffects(dt: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.beams) {
      b.life -= dt * 2;
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    this.beams = this.beams.filter((b) => b.life > 0);
    ctx.shadowBlur = 0;
    for (const p of this.particles) {
      p.life -= p.decay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    for (const pop of this.pops) {
      pop.life -= dt * 0.8;
      pop.y -= dt * 24;
      ctx.globalAlpha = Math.max(0, Math.min(1, pop.life));
      ctx.font = `700 ${Math.max(12, this.tile * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = pop.color;
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 12;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    ctx.restore();
  }
}
