import * as THREE from "three";

/** A target point cloud the swarm periodically assembles into. */
export interface ShapeDefinition {
  name: string;
  /** Writes `count` xyzw targets (world units) into `out`, sized for the visible half extents. */
  generate: (out: Float32Array, count: number, halfW: number, halfH: number) => void;
  /** Rotation applied to the targets while the shape is on screen (`t` = seconds since forming began). */
  motion: (t: number, out: THREE.Matrix4) => THREE.Matrix4;
}

const TAU = Math.PI * 2;

const rand = (min = 0, max = 1) => min + Math.random() * (max - min);

function gaussian() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}

function write(out: Float32Array, i: number, x: number, y: number, z: number) {
  out[i * 4] = x;
  out[i * 4 + 1] = y;
  out[i * 4 + 2] = z;
  out[i * 4 + 3] = 1;
}

const tmp = new THREE.Matrix4();
const tmp2 = new THREE.Matrix4();

const neuralNetwork: ShapeDefinition = {
  name: "neural-network",
  generate(out, count, halfW, halfH) {
    const layers = [4, 7, 8, 7, 4];
    const maxNodes = Math.max(...layers);
    const spanX = Math.min(halfW * 0.85, halfH * 2.2);
    const spacingY = (halfH * 1.45) / (maxNodes - 1);

    const nodes: THREE.Vector2[][] = layers.map((n, l) => {
      const x = -spanX + (2 * spanX * l) / (layers.length - 1);
      return Array.from({ length: n }, (_, j) => new THREE.Vector2(x, (j - (n - 1) / 2) * spacingY));
    });
    const flatNodes = nodes.flat();
    const edges: [THREE.Vector2, THREE.Vector2][] = [];
    for (let l = 0; l < nodes.length - 1; l++) {
      for (const a of nodes[l]) for (const b of nodes[l + 1]) edges.push([a, b]);
    }

    const nodeRadius = halfH * 0.025;
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.3) {
        const n = flatNodes[Math.floor(Math.random() * flatNodes.length)];
        write(out, i, n.x + gaussian() * nodeRadius, n.y + gaussian() * nodeRadius, gaussian() * nodeRadius);
      } else {
        const [a, b] = edges[Math.floor(Math.random() * edges.length)];
        const t = Math.random();
        const jitter = halfH * 0.004;
        write(out, i, a.x + (b.x - a.x) * t + gaussian() * jitter, a.y + (b.y - a.y) * t + gaussian() * jitter, 0);
      }
    }
  },
  motion: (t, out) => out.makeRotationY(Math.sin(t * 0.5) * 0.35).multiply(tmp.makeRotationX(Math.sin(t * 0.37) * 0.12)),
};

const galaxy: ShapeDefinition = {
  name: "galaxy",
  generate(out, count, halfW, halfH) {
    const R = Math.min(halfW * 0.95, halfH * 1.45);
    const r0 = R * 0.12;
    const arms = 3;
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.05) {
        // Bright core.
        write(out, i, gaussian() * r0 * 0.5, gaussian() * r0 * 0.5, gaussian() * r0 * 0.25);
        continue;
      }
      if (Math.random() < 0.12) {
        const r = R * 1.05 * Math.sqrt(Math.random());
        const a = rand(0, TAU);
        write(out, i, r * Math.cos(a), r * Math.sin(a), gaussian() * R * 0.04);
        continue;
      }
      const r = r0 + (R - r0) * Math.pow(Math.random(), 0.8) + gaussian() * R * 0.025;
      const theta = ((i % arms) * TAU) / arms + Math.log(Math.max(r, r0) / r0) * 2.2 + gaussian() * 0.12;
      write(out, i, r * Math.cos(theta), r * Math.sin(theta), gaussian() * R * 0.03 * (1 - r / R));
    }
  },
  motion: (t, out) => out.makeRotationX(-0.85).multiply(tmp.makeRotationZ(t * 0.18)),
};

const globe: ShapeDefinition = {
  name: "globe",
  generate(out, count, halfW, halfH) {
    const R = Math.min(halfH * 0.75, halfW * 0.55);
    const meridians = 10;
    const parallels = 7;
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      if (roll < 0.28) {
        // Orbital ring in the equatorial plane.
        const r = rand(1.35, 1.7) * R;
        const a = rand(0, TAU);
        write(out, i, r * Math.cos(a), gaussian() * R * 0.01, r * Math.sin(a));
        continue;
      }
      let lat: number;
      let lon: number;
      if (roll < 0.58) {
        lon = (Math.floor(Math.random() * meridians) * Math.PI) / meridians;
        lat = rand(-Math.PI, Math.PI);
      } else if (roll < 0.83) {
        lat = (((Math.floor(Math.random() * parallels) + 1) / (parallels + 1)) - 0.5) * Math.PI;
        lon = rand(0, TAU);
      } else {
        lat = Math.asin(rand(-1, 1));
        lon = rand(0, TAU);
      }
      const rr = R * (1 + gaussian() * 0.006);
      write(out, i, rr * Math.cos(lat) * Math.cos(lon), rr * Math.sin(lat), rr * Math.cos(lat) * Math.sin(lon));
    }
  },
  motion: (t, out) =>
    out.makeRotationX(0.32).multiply(tmp.makeRotationZ(0.3)).multiply(tmp2.makeRotationY(t * 0.35)),
};

const helix: ShapeDefinition = {
  name: "helix",
  generate(out, count, halfW, halfH) {
    const L = halfW * 0.92;
    const A = Math.min(halfH * 0.32, L * 0.3);
    const turns = Math.max(1.5, (2 * L) / (A * 4.2));
    const f = (turns * TAU) / (2 * L);
    const rungs = Math.round(turns * 10);
    const envelope = (x: number) => 1 - Math.pow(Math.abs(x) / L, 6);
    const strand = (x: number, phase: number) => {
      const a = A * envelope(x);
      return [a * Math.cos(f * x + phase), a * Math.sin(f * x + phase)];
    };
    for (let i = 0; i < count; i++) {
      const jitter = () => gaussian() * A * 0.015;
      if (Math.random() < 0.7) {
        const x = rand(-L, L);
        const [y, z] = strand(x, (i % 2) * Math.PI);
        write(out, i, x + jitter(), y + jitter(), z + jitter());
      } else {
        const x = -L + ((Math.floor(Math.random() * rungs) + 0.5) * 2 * L) / rungs;
        const [y1, z1] = strand(x, 0);
        const [y2, z2] = strand(x, Math.PI);
        const t = Math.random();
        write(out, i, x + jitter(), y1 + (y2 - y1) * t + jitter(), z1 + (z2 - z1) * t + jitter());
      }
    }
  },
  motion: (t, out) => out.makeRotationZ(-0.12).multiply(tmp.makeRotationX(t * 0.7)),
};

let glyphCache: Record<string, Float32Array> | null = null;

/** Rasterises a glyph and returns its filled pixels as (u, v) pairs in [-0.5, 0.5]. */
function sampleGlyph(ch: string): Float32Array {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Float32Array();
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${size * 0.9}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, size / 2, size / 2);
  const { data } = ctx.getImageData(0, 0, size, size);
  const points: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] > 128) points.push(x / size - 0.5, 0.5 - y / size);
    }
  }
  return new Float32Array(points);
}

const monogram: ShapeDefinition = {
  name: "monogram",
  generate(out, count, halfW, halfH) {
    glyphCache ??= { A: sampleGlyph("A"), K: sampleGlyph("K") };
    const glyphs = [glyphCache.A, glyphCache.K];
    const h = halfH * 1.15;
    // Letters flank the content column rather than sitting under the text.
    const cx = Math.max(halfW * 0.64, h * 0.45);
    for (let i = 0; i < count; i++) {
      const side = i % 2;
      const pts = glyphs[side];
      if (pts.length === 0) {
        write(out, i, rand(-halfW, halfW), rand(-halfH, halfH), 0);
        continue;
      }
      const k = Math.floor(Math.random() * (pts.length / 2)) * 2;
      const px = h / 256;
      write(
        out,
        i,
        (side ? cx : -cx) + pts[k] * h + rand(-0.5, 0.5) * px,
        pts[k + 1] * h + rand(-0.5, 0.5) * px,
        gaussian() * 0.04,
      );
    }
  },
  motion: (t, out) => out.makeRotationY(Math.sin(t * 0.6) * 0.18),
};

export const SHAPES: ShapeDefinition[] = [neuralNetwork, galaxy, globe, helix, monogram];
