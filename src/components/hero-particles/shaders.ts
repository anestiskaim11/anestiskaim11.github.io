// GLSL for the particle hero. The simulation passes run inside GPUComputationRenderer,
// which injects `resolution` and the `texturePosition` / `textureVelocity` samplers.

// Ashima Arts / Stefan Gustavson 3D simplex noise (MIT).
const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const positionShader = /* glsl */ `
uniform float uDelta;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  pos.xyz += vel * uDelta;
  gl_FragColor = pos;
}
`;

export const velocityShader = /* glsl */ `
uniform float uTime;
uniform float uDelta;
uniform float uForm;
uniform sampler2D uTarget;
uniform mat3 uTargetMatrix;
uniform vec3 uPointer;
uniform vec3 uPointerVel;
uniform float uPointerActive;
uniform vec3 uShockOrigin;
uniform float uShockAge;
uniform vec2 uBounds;

${simplexNoise}

// Divergence-free 2D flow from the curl of a noise stream function.
vec2 curlFlow(vec3 q) {
  const float e = 0.05;
  float n1 = snoise(q + vec3(0.0, e, 0.0));
  float n2 = snoise(q - vec3(0.0, e, 0.0));
  float n3 = snoise(q + vec3(e, 0.0, 0.0));
  float n4 = snoise(q - vec3(e, 0.0, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float seed = posData.w;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // Staggered per-particle formation so shapes assemble in waves.
  float form = clamp(uForm * 1.4 - seed * 0.4, 0.0, 1.0);
  float free = 1.0 - form;

  // Ambient nebula drift: two octaves of curl noise plus a gentle depth wobble.
  float t = uTime * 0.045;
  vec3 q = vec3(pos.xy * 0.3, pos.z * 0.2 + t);
  vec2 curl = curlFlow(q) + 0.45 * curlFlow(q * 2.1 + vec3(13.1, 7.7, t));
  float wobble = snoise(vec3(pos.yx * 0.25, t + 31.7));
  vec3 flow = vec3(curl, wobble * 0.8) * 0.2 * mix(0.6, 1.4, seed);

  vec3 acc = (flow - vel) * 1.2 * free;

  // Soft elliptical containment so the nebula fills the hero.
  vec3 nb = pos / vec3(uBounds, 1.6);
  acc -= pos * max(length(nb) - 1.0, 0.0) * 1.5;

  // Spring toward the current shape target.
  vec3 target = uTargetMatrix * texture2D(uTarget, uv).xyz;
  acc += (target - pos) * form * 9.0;
  acc -= vel * form * 4.5;

  // Pointer: gravity well with swirl and a repulsive core, dragging a wake.
  vec2 toP = uPointer.xy - pos.xy;
  float d = length(toP) + 1e-4;
  vec2 dir = toP / d;
  float infl = uPointerActive * exp(-d * d * 1.6) * (1.0 + form * 2.0);
  acc.xy += dir * infl * 2.5 * smoothstep(0.08, 0.35, d);
  acc.xy -= dir * infl * 6.0 * (1.0 - smoothstep(0.0, 0.3, d));
  acc.xy += vec2(-dir.y, dir.x) * infl * 3.5;
  acc += uPointerVel * infl * 1.5;

  // Click shockwave: an expanding ring that kicks particles outward.
  vec3 fromS = pos - uShockOrigin;
  float ds = length(fromS.xy) + 1e-4;
  float band = exp(-pow((ds - uShockAge * 3.5) * 2.5, 2.0));
  float decay = exp(-uShockAge * 2.0);
  acc += vec3(fromS.xy / ds, fromS.z * 0.3) * band * decay * 40.0;

  vel += acc * uDelta;
  float speed = length(vel);
  if (speed > 7.0) vel *= 7.0 / speed;

  gl_FragColor = vec4(vel, 1.0);
}
`;

export const renderVertexShader = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uAlpha;
uniform float uOpacity;
uniform float uForm;
uniform vec2 uMask;
uniform float uMaskFloor;

attribute vec2 reference;

varying vec3 vColor;
varying float vAlpha;

// Site palette: --primary blue, gradient violet, --accent cyan.
const vec3 BLUE = vec3(0.236, 0.515, 0.964);
const vec3 VIOLET = vec3(0.487, 0.231, 0.928);
const vec3 CYAN = vec3(0.1, 0.9, 0.9);

void main() {
  vec4 p = texture2D(uPos, reference);
  vec3 v = texture2D(uVel, reference).xyz;
  float seed = p.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float depth = 6.0 / max(-mv.z, 0.5);
  float sizeVar = mix(0.55, 1.8, pow(fract(seed * 13.17), 3.0));
  gl_PointSize = clamp(uSize * sizeVar * uPixelRatio * depth, 1.0, 24.0);

  float speed = length(v);
  vec3 c = mix(BLUE, VIOLET, smoothstep(0.15, 0.85, fract(seed * 7.31)));
  c = mix(c, CYAN, step(0.82, fract(seed * 3.71)) * 0.7);
  c = mix(c, CYAN, smoothstep(0.6, 2.5, speed));
  c = mix(c, vec3(1.0), smoothstep(2.5, 6.0, speed) * 0.6);
  vColor = c;

  // Dim particles behind the centre content column so the text stays readable.
  vec2 ndc = gl_Position.xy / gl_Position.w;
  float dim = mix(uMaskFloor, 1.0, smoothstep(0.45, 1.1, length(ndc / uMask)));
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + seed * 2.0) + seed * 40.0);
  vAlpha = uAlpha * dim * twinkle * uOpacity * mix(1.0, 1.35, uForm);
}
`;

export const renderFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}
`;
